import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, tableSessions } from "@/server/db/schema";
import { setRestaurantStatus } from "@/server/modules/restaurants/service";
import {
  bulkCreateTables,
  createTable,
  deleteTable,
  getTablesByIds,
  listTables,
  regenerateQr,
  resolveQrToken,
  setQrEnabled,
  updateTable,
} from "@/server/modules/tables/service";
import { qrPng, qrSvg, tableUrl } from "@/server/modules/tables/qr";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

describe("tables", () => {
  it("creates a table with a unique, resolvable QR token", async () => {
    const { ctx } = await createOwnerWithRestaurant("Brielle");
    const t = await createTable(db, ctx, { label: "12", capacity: 4, zone: "Salle" });
    expect(t.number).toBe(12);
    expect(t.qrToken).toMatch(/^[0-9A-Za-z]{22}$/);
    const resolved = await resolveQrToken(db, t.qrToken);
    expect(resolved?.table.id).toBe(t.id);
    expect(resolved?.restaurant.name).toBe("Brielle");
  });

  it("rejects duplicate labels (case-insensitive) with a field error code", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    await createTable(db, ctx, { label: "Terrasse" });
    await expect(createTable(db, ctx, { label: "terrasse" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "label_taken",
    });
  });

  it("bulk creates a range and skips labels that already exist", async () => {
    const { ctx } = await createOwnerWithRestaurant("Bulk", { plan: "professional" });
    await createTable(db, ctx, { label: "3" });
    const res = await bulkCreateTables(db, ctx, { from: 1, to: 50 });
    expect(res).toEqual({ created: 49, skipped: 1 });
    const all = await listTables(db, ctx);
    expect(all).toHaveLength(50);
    expect(new Set(all.map((t) => t.qrToken)).size).toBe(50);
    const again = await bulkCreateTables(db, ctx, { from: 1, to: 50 });
    expect(again).toEqual({ created: 0, skipped: 50 });
  });

  it("supports prefixes and validates the range", async () => {
    const { ctx } = await createOwnerWithRestaurant("Prefix", { plan: "professional" });
    await bulkCreateTables(db, ctx, { from: 1, to: 3, prefix: "T", zone: "Terrasse", capacity: 2 });
    const labels = (await listTables(db, ctx)).map((t) => t.label);
    expect(labels).toEqual(["T1", "T2", "T3"]);
    await expect(bulkCreateTables(db, ctx, { from: 5, to: 2 })).rejects.toBeTruthy();
    await expect(bulkCreateTables(db, ctx, { from: 1, to: 500 })).rejects.toBeTruthy();
  });

  it("enforces the plan table quota, including under concurrency", async () => {
    const { ctx } = await createOwnerWithRestaurant("Free plan"); // Free = 5 tables
    await bulkCreateTables(db, ctx, { from: 1, to: 4 });
    await expect(bulkCreateTables(db, ctx, { from: 5, to: 6 })).rejects.toMatchObject({ code: "PLAN_LIMIT" });
    const results = await Promise.allSettled([
      createTable(db, ctx, { label: "A" }),
      createTable(db, ctx, { label: "B" }),
      createTable(db, ctx, { label: "C" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await listTables(db, ctx)).toHaveLength(5);
  });

  it("regenerating the QR invalidates the old token", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const t = await createTable(db, ctx, { label: "1" });
    const r = await regenerateQr(db, ctx, t.id);
    expect(r.qrToken).not.toBe(t.qrToken);
    expect(await resolveQrToken(db, t.qrToken)).toBeNull();
    expect((await resolveQrToken(db, r.qrToken))?.table.id).toBe(t.id);
  });

  it("disabled QR codes, deleted tables and suspended restaurants do not resolve", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    const a = await createTable(db, ctx, { label: "1" });
    const b = await createTable(db, ctx, { label: "2" });
    await setQrEnabled(db, ctx, a.id, false);
    expect(await resolveQrToken(db, a.qrToken)).toBeNull();
    await setQrEnabled(db, ctx, a.id, true);
    expect(await resolveQrToken(db, a.qrToken)).not.toBeNull();

    await deleteTable(db, ctx, b.id);
    expect(await resolveQrToken(db, b.qrToken)).toBeNull();
    expect((await listTables(db, ctx)).map((t) => t.id)).toEqual([a.id]);
    // The label of a deleted table can be reused.
    await createTable(db, ctx, { label: "2" });

    await setRestaurantStatus(db, restaurant.id, "suspended");
    expect(await resolveQrToken(db, a.qrToken)).toBeNull();
    expect(await resolveQrToken(db, "../../etc/passwd")).toBeNull();
  });

  it("refuses to delete a table with an open session", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    const t = await createTable(db, ctx, { label: "8" });
    await db.insert(tableSessions).values({ restaurantId: restaurant.id, tableId: t.id });
    await expect(deleteTable(db, ctx, t.id)).rejects.toMatchObject({ message: "table_has_open_session" });
  });

  it("renames a table", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const t = await createTable(db, ctx, { label: "1" });
    const u = await updateTable(db, ctx, t.id, { label: "Fenêtre", capacity: 6, zone: "Salle" });
    expect(u).toMatchObject({ label: "Fenêtre", capacity: 6, zone: "Salle", qrToken: t.qrToken });
  });

  it("isolates tenants: no cross-restaurant read or write", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    const tb = await createTable(db, b.ctx, { label: "1" });
    await expect(updateTable(db, a.ctx, tb.id, { label: "pwned" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(regenerateQr(db, a.ctx, tb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTable(db, a.ctx, tb.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await getTablesByIds(db, a.ctx, [tb.id])).toEqual([]);
    const [still] = await db.select().from(diningTables).where(eq(diningTables.id, tb.id));
    expect(still?.label).toBe("1");
  });

  it("staff can view tables but not manage them", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    await createTable(db, ctx, { label: "1" });
    const staff = await createUser();
    await addMember(restaurant.id, staff.user.id, "staff");
    const sctx = await contextFor(staff.sessionUser, restaurant.id);
    expect(await listTables(db, sctx)).toHaveLength(1);
    await expect(createTable(db, sctx, { label: "2" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("QR rendering", () => {
  it("encodes only the opaque token in the URL", () => {
    expect(tableUrl("AbC123", "https://app.example.com/")).toBe("https://app.example.com/t/AbC123");
  });

  it("renders SVG and PNG", async () => {
    const url = tableUrl("AbCdEfGhIjKlMnOpQrStUv");
    expect(await qrSvg(url)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
    const png = await qrPng(url, 512);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
});
