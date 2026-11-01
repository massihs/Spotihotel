import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, restaurantSettings, tableSessions } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext, type GuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { callWaiter } from "@/server/modules/guest/waiter";
import {
  blockGuest,
  confirmTableSession,
  listGuestBlocks,
  setScansNeedStaff,
  unblockGuest,
} from "@/server/modules/guest/safety";
import { getFloor } from "@/server/modules/floor/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

async function setup() {
  const owner = await createOwnerWithRestaurant("Safe", { plan: "professional" });
  const table = await createTable(db, owner.ctx, { label: "5" });
  const cat = await createCategory(db, owner.ctx, { name: "Plats" });
  const dish = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });
  return { owner, table, dish };
}

async function seat(qrToken: string, guestId = randomUUID()): Promise<GuestContext | null> {
  const e = await enterTableByQr(db, qrToken, guestId);
  if (!e) return null;
  return loadGuestContext(db, guestId, e.participant.id);
}

async function order(g: GuestContext, productId: string) {
  await addToCart(db, g, { productId });
  return placeOrder(db, g);
}

describe("guest safety", () => {
  it("caps the orders waiting for the staff, per guest and per table", async () => {
    const { owner, table, dish } = await setup();
    const a = (await seat(table.qrToken))!;
    const first = await order(a, dish.id);
    await order(a, dish.id);
    await addToCart(db, a, { productId: dish.id });
    await expect(placeOrder(db, a)).rejects.toMatchObject({ message: "too_many_pending" });
    // Once the staff accept one, the guest may order again.
    await updateOrderStatus(db, owner.ctx, first.id, "accepted");
    await expect(placeOrder(db, a)).resolves.toMatchObject({ status: "received" });

    const b = (await seat(table.qrToken))!;
    await order(b, dish.id);
    // 2 (a) + 1 (b) + 1 = 4 for the table, then refused.
    const c = (await seat(table.qrToken))!;
    await order(c, dish.id);
    await addToCart(db, c, { productId: dish.id });
    await expect(placeOrder(db, c)).rejects.toMatchObject({ message: "too_many_pending" });
  });

  it("blocks a device: waiting orders cancelled, no more entry, unblock restores it", async () => {
    const { owner, table, dish } = await setup();
    const guestId = randomUUID();
    const g = (await seat(table.qrToken, guestId))!;
    const o = await order(g, dish.id);

    const res = await blockGuest(db, owner.ctx, { orderId: o.id }, "spam");
    expect(res.cancelled).toBe(1);
    const [row] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, o.id));
    expect(row!.status).toBe("cancelled");
    expect(await loadGuestContext(db, guestId, g.participant.id)).toBeNull();
    expect(await enterTableByQr(db, table.qrToken, guestId)).toBeNull();

    const blocks = await listGuestBlocks(db, owner.ctx);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ tableLabel: "5", reason: "spam" });
    // Blocking twice is harmless.
    await expect(blockGuest(db, owner.ctx, { participantId: g.participant.id })).resolves.toMatchObject({
      cancelled: 0,
    });

    await unblockGuest(db, owner.ctx, blocks[0]!.id);
    expect(await seat(table.qrToken, guestId)).not.toBeNull();
  });

  it("only blocks within the restaurant that blocked", async () => {
    const one = await setup();
    const two = await setup();
    const guestId = randomUUID();
    const g = (await seat(one.table.qrToken, guestId))!;
    await blockGuest(db, one.owner.ctx, { participantId: g.participant.id });
    expect(await seat(two.table.qrToken, guestId)).not.toBeNull();
    // And another restaurant cannot block through a foreign order.
    const o = await order((await seat(two.table.qrToken))!, two.dish.id);
    await expect(blockGuest(db, one.owner.ctx, { orderId: o.id })).rejects.toMatchObject({
      message: "not_a_guest_order",
    });
  });

  it("tables opened by the staff: a scan waits for a waiter before ordering or calling", async () => {
    const { owner, table, dish } = await setup();
    await setScansNeedStaff(db, owner.ctx, true);
    const [s] = await db
      .select({ v: restaurantSettings.guestOrdersNeedStaff })
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
    expect(s!.v).toBe(true);

    const g = (await seat(table.qrToken))!;
    expect(g.session.confirmed).toBe(false);
    await addToCart(db, g, { productId: dish.id });
    await expect(placeOrder(db, g)).rejects.toMatchObject({ message: "table_not_confirmed" });
    await expect(callWaiter(db, g, "waiter")).rejects.toMatchObject({ message: "table_not_confirmed" });
    expect((await getFloor(db, owner.ctx)).find((x) => x.id === table.id)!.waiting).toBe(true);

    await confirmTableSession(db, owner.ctx, table.id);
    const again = (await loadGuestContext(db, g.guestId, g.participant.id))!;
    expect(again.session.confirmed).toBe(true);
    await expect(placeOrder(db, again)).resolves.toMatchObject({ status: "received" });
    expect((await getFloor(db, owner.ctx)).find((x) => x.id === table.id)!.waiting).toBe(false);

    // Off again: new tables are open at once.
    await setScansNeedStaff(db, owner.ctx, false);
    const t2 = await createTable(db, owner.ctx, { label: "6" });
    const h = (await seat(t2.qrToken))!;
    expect(h.session.confirmed).toBe(true);
    const [sess] = await db
      .select({ c: tableSessions.confirmedAt })
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, t2.id), eq(tableSessions.status, "open")));
    expect(sess!.c).not.toBeNull();
  });
});
