import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  orderItems,
  orders,
  payments,
  printJobs,
  restaurantSettings,
  tableSessions,
} from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { savePrinter, authenticateAgent } from "@/server/modules/printing/service";
import {
  authenticateDevice,
  createDevice,
  getSnapshot,
  importOfflineOrders,
  revokeDevice,
  type OfflineOrderInput,
} from "@/server/modules/offline/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function setup(name = "Offline") {
  const owner = await createOwnerWithRestaurant(name, { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ enabledPaymentProviders: ["cash", "on_site_terminal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const cat = await createCategory(db, owner.ctx, { name: "Plats" });
  const kebab = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Kebab", priceCents: 50_000 });
  const table = await createTable(db, owner.ctx, { label: "7" });
  await savePrinter(db, owner.ctx, null, {
    name: "Cuisine",
    host: "192.168.1.50",
    target: "all",
    stationId: null,
  });
  return { ...owner, cat, kebab, table };
}

const order = (o: Partial<OfflineOrderInput> & { lines: OfflineOrderInput["lines"] }): OfflineOrderInput => ({
  ref: randomUUID(),
  localNumber: "L-1",
  placedAt: new Date(Date.now() - 3600_000).toISOString(),
  channel: "takeaway",
  status: "served",
  ...o,
});

describe("desktop app offline mode", () => {
  it("links a device, gives it the menu, and takes back offline orders exactly once", async () => {
    const { ctx, restaurant, cat, kebab, table } = await setup();
    const device = await createDevice(db, ctx, "PC caisse");
    const auth = (await authenticateDevice(db, device.token, "1.0.0"))!;
    expect(auth.restaurantId).toBe(restaurant.id);
    expect(await authenticateDevice(db, `${device.id}.wrong`)).toBeNull();
    // The device token also drives the print agent.
    expect(await authenticateAgent(db, device.token)).toBe(restaurant.id);

    const snap = await getSnapshot(db, auth);
    expect(snap.products.map((p) => p.name)).toEqual(["Kebab"]);
    expect(snap.tables.map((t) => t.label)).toEqual(["7"]);
    expect(snap.printers).toHaveLength(1);
    expect(snap.payments).toEqual(["cash", "on_site_terminal"]);
    expect(snap.staff[0]?.userId).toBe(ctx.user.id);

    const line = {
      productId: kebab.id,
      categoryId: cat.id,
      name: "Kebab",
      unitPriceCents: 50_000,
      taxRateBps: 0,
      quantity: 2,
      options: [
        { groupId: "g", groupName: "Pain", valueId: "v", valueName: "Lavash", priceDeltaCents: 5_000 },
      ],
    };
    const paid = order({
      localNumber: "L-1",
      lines: [line],
      discountCents: 10_000,
      payment: { provider: "cash", tenderedCents: 200_000, at: new Date().toISOString() },
      staffUserId: ctx.user.id,
    });
    const atTable = order({
      localNumber: "L-2",
      channel: "dine_in",
      tableId: table.id,
      status: "ready",
      lines: [{ ...line, quantity: 1, options: [] }],
    });
    const cancelled = order({ localNumber: "L-3", status: "cancelled", lines: [line] });

    const first = await importOfflineOrders(db, auth, { orders: [paid, atTable, cancelled, { ref: "bad" }] });
    expect(first.imported).toBe(3);
    expect(first.results.at(-1)).toMatchObject({ ok: false, error: "invalid" });

    const [p] = await db.select().from(orders).where(eq(orders.offlineRef, paid.ref));
    // (50 000 + 5 000) × 2 − 10 000, paid in cash, served, no ticket printed again.
    expect(p).toMatchObject({
      totalCents: 100_000,
      status: "served",
      paymentStatus: "paid",
      offlineNumber: "L-1",
      createdByUserId: ctx.user.id,
      tableSessionId: null,
    });
    expect(await db.select().from(printJobs).where(eq(printJobs.orderId, p!.id))).toHaveLength(0);
    const [pay] = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, `offline-${paid.ref}`));
    expect(pay).toMatchObject({ amountCents: 100_000, provider: "cash", status: "succeeded" });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, p!.id));
    expect(items[0]).toMatchObject({ lineTotalCents: 110_000, optionsTotalCents: 5_000 });

    // Unpaid at a table: on the table's open bill.
    const [t] = await db.select().from(orders).where(eq(orders.offlineRef, atTable.ref));
    expect(t).toMatchObject({ tableLabel: "7", paymentStatus: "unpaid", status: "ready" });
    const [session] = await db
      .select()
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, table.id), eq(tableSessions.status, "open")));
    expect(t!.tableSessionId).toBe(session!.id);

    // Resent after a dropped connection: nothing doubles.
    const again = await importOfflineOrders(db, auth, { orders: [paid, atTable] });
    expect(again.imported).toBe(0);
    expect(again.results.every((r) => r.ok && r.duplicate)).toBe(true);
    expect(await db.select().from(orders).where(eq(orders.offlineRef, paid.ref))).toHaveLength(1);
    // Twice at the same instant: still one.
    const race = order({ lines: [line] });
    await Promise.all([
      importOfflineOrders(db, auth, { orders: [race] }),
      importOfflineOrders(db, auth, { orders: [race] }),
    ]);
    expect(await db.select().from(orders).where(eq(orders.offlineRef, race.ref))).toHaveLength(1);

    // A device cannot write into another restaurant: foreign ids are ignored.
    const other = await setup("Other");
    const cross = order({
      channel: "dine_in",
      tableId: other.table.id,
      lines: [{ ...line, productId: other.kebab.id }],
    });
    await importOfflineOrders(db, auth, { orders: [cross] });
    const [c] = await db.select().from(orders).where(eq(orders.offlineRef, cross.ref));
    expect(c).toMatchObject({ restaurantId: restaurant.id, tableId: null });
    const [ci] = await db.select().from(orderItems).where(eq(orderItems.orderId, c!.id));
    expect(ci!.productId).toBeNull();

    // Too old or in the future: refused.
    const old = await importOfflineOrders(db, auth, {
      orders: [order({ placedAt: new Date(Date.now() - 30 * 86_400_000).toISOString(), lines: [line] })],
    });
    expect(old.results[0]).toMatchObject({ ok: false, error: "too_old" });

    await revokeDevice(db, ctx, device.id);
    expect(await authenticateDevice(db, device.token)).toBeNull();
  });
});
