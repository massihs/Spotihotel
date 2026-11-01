import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diningTables, notifications, orders, restaurants } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { bulkCreateTables, createTable, listTables, updateTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import { callWaiter } from "@/server/modules/guest/waiter";
import { guestCallsOf } from "@/server/modules/team/sections";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function seat(qrToken: string) {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

describe("hotel", () => {
  it("orders room service from a room's QR code", async () => {
    const { ctx } = await createOwnerWithRestaurant("Hôtel Azadi", { plan: "professional" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const hotel = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };

    expect(await bulkCreateTables(db, hotel, { from: 101, to: 105, kind: "room" })).toEqual({
      created: 5,
      skipped: 0,
    });
    const terrace = await createTable(db, hotel, { label: "T1" });
    const list = await listTables(db, hotel);
    expect(list.filter((x) => x.kind === "room").map((x) => x.label)).toEqual([
      "101",
      "102",
      "103",
      "104",
      "105",
    ]);
    expect(terrace.kind).toBe("table");
    // Editing without a kind keeps a room a room.
    const room = list.find((x) => x.label === "103")!;
    await updateTable(db, hotel, room.id, { label: "103", capacity: 2 });
    const [kept] = await db.select().from(diningTables).where(eq(diningTables.id, room.id));
    expect(kept!.kind).toBe("room");

    const cat = await createCategory(db, hotel, { name: "Room service" });
    const club = await createProduct(db, hotel, {
      categoryId: cat.id,
      name: "Club sandwich",
      priceCents: 4000,
    });

    const guest = await seat(room.qrToken);
    expect(guest.table.kind).toBe("room");
    await addToCart(db, guest, { productId: club.id });
    const placed = await placeOrder(db, guest);
    const [o] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(o).toMatchObject({ placeKind: "room", tableLabel: "103" });
    const [n] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "order.created")));
    expect(n!.payload).toMatchObject({ place: "room", tableLabel: "103" });

    // Housekeeping is offered in a room, not at a restaurant table.
    const inRoom = (await guestCallsOf(db, ctx.restaurant.id, { room: true })).map((c) => c.key);
    expect(inRoom).toEqual(expect.arrayContaining(["housekeeping", "towels", "reception"]));
    const atTable = (await guestCallsOf(db, ctx.restaurant.id)).map((c) => c.key);
    expect(atTable).not.toContain("housekeeping");
    await callWaiter(db, guest, "housekeeping");
    const atTerrace = await seat(terrace.qrToken);
    await expect(callWaiter(db, atTerrace, "housekeeping")).rejects.toMatchObject({
      message: "invalid_call",
    });
  });
});
