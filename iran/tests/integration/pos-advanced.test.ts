import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { customers, notifications, orders, tableSessions } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { lookupCustomer, repayAccount, setCreditLimit } from "@/server/modules/customers/service";
import { moveTableSession } from "@/server/modules/floor/service";
import { callWaiter } from "@/server/modules/guest/waiter";
import { listSecurityEvents } from "@/server/modules/reports/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("advanced till", () => {
  it("uses channel price lists and house accounts within the credit limit", async () => {
    const { ctx } = await createOwnerWithRestaurant("Kafe");
    const cat = await createCategory(db, ctx, { name: "Café" });
    const latte = await createProduct(db, ctx, {
      categoryId: cat.id,
      name: "Latte",
      priceCents: 1000,
      takeawayPriceCents: 900,
    });
    const { order: away } = await createPosOrder(db, ctx, {
      channel: "takeaway",
      lines: [{ productId: latte.id, quantity: 2 }],
      idempotencyKey: key(),
    });
    expect(away.totalCents).toBe(1800);

    // First visit creates the customer; no credit yet.
    await createPosOrder(db, ctx, {
      channel: "dine_in",
      lines: [{ productId: latte.id, quantity: 1 }],
      customerPhone: "09125550000",
      idempotencyKey: key(),
    });
    const c = (await lookupCustomer(db, ctx, "09125550000")).customer!;
    await expect(
      createPosOrder(db, ctx, {
        channel: "dine_in",
        lines: [{ productId: latte.id, quantity: 1 }],
        customerPhone: "09125550000",
        payment: { provider: "account" },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "credit_limit_exceeded" });

    await setCreditLimit(db, ctx, c.id, 2500);
    const { order } = await createPosOrder(db, ctx, {
      channel: "dine_in",
      lines: [{ productId: latte.id, quantity: 2 }],
      customerPhone: "09125550000",
      payment: { provider: "account" },
      idempotencyKey: key(),
    });
    expect(order.paymentStatus).toBe("unpaid"); // row returned before settlement
    const [paid] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(paid!.paymentStatus).toBe("paid");
    let [row] = await db.select().from(customers).where(eq(customers.id, c.id));
    expect(row!.balanceCents).toBe(2000);
    await expect(
      createPosOrder(db, ctx, {
        lines: [{ productId: latte.id, quantity: 1 }],
        customerPhone: "09125550000",
        payment: { provider: "account" },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "credit_limit_exceeded" });

    await expect(repayAccount(db, ctx, c.id, { amountCents: 5000 })).rejects.toMatchObject({
      message: "repayment_too_high",
    });
    expect(await repayAccount(db, ctx, c.id, { amountCents: 1500, method: "card" })).toEqual({
      balanceCents: 500,
    });
    [row] = await db.select().from(customers).where(eq(customers.id, c.id));
    expect(row!.balanceCents).toBe(500);
  });

  it("moves a table, lets guests call the waiter, and logs sensitive actions", async () => {
    const { ctx } = await createOwnerWithRestaurant("Salon");
    const t1 = await createTable(db, ctx, { label: "1" });
    const t2 = await createTable(db, ctx, { label: "2" });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 2000 });
    const guestId = randomUUID();
    const e = await enterTableByQr(db, t1.qrToken, guestId);
    const guest = (await loadGuestContext(db, guestId, e!.participant.id))!;
    await addToCart(db, guest, { productId: dish.id });
    const placed = await placeOrder(db, guest);

    await callWaiter(db, guest, "bill");
    await expect(callWaiter(db, guest, "water")).rejects.toMatchObject({ message: "too_soon" });
    const calls = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, ctx.restaurant.id), eq(notifications.type, "waiter.call")));
    expect(calls[0]!.payload).toMatchObject({ kind: "bill", tableLabel: "1" });

    expect(await moveTableSession(db, ctx, t1.id, t2.id)).toEqual({ from: "1", to: "2" });
    const [o] = await db.select().from(orders).where(eq(orders.id, placed.id));
    expect(o).toMatchObject({ tableId: t2.id, tableLabel: "2" });
    const [s] = await db.select().from(tableSessions).where(eq(tableSessions.id, guest.session.id));
    expect(s!.tableId).toBe(t2.id);
    await expect(moveTableSession(db, ctx, t1.id, t2.id)).rejects.toMatchObject({
      message: "no_open_session",
    });

    const events = await listSecurityEvents(db, ctx, {
      from: new Date(Date.now() - 60_000),
      to: new Date(Date.now() + 60_000),
    });
    expect(events.map((x) => x.action)).toContain("table_session.moved");
  });
});
