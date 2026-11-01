import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { listPayments, recordStaffPayment } from "@/server/modules/payments/service";
import { issueInvoiceAsStaff, listInvoices } from "@/server/modules/invoices/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

async function setup() {
  const owner = await createOwnerWithRestaurant("Comptoir", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ enabledPaymentProviders: ["cash", "on_site_terminal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const cat = await createCategory(db, owner.ctx, { name: "Plats" });
  const dish = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Kebab", priceCents: 2000 });
  return { ...owner, dish };
}

describe("manual orders end up in payments and invoices", () => {
  it("a sale paid at the till gets its invoice at once (with the discount)", async () => {
    const { ctx, dish } = await setup();
    const { payment } = await createPosOrder(db, ctx, {
      channel: "takeaway",
      lines: [{ productId: dish.id, quantity: 2 }],
      discountPct: 10,
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    const invoices = await listInvoices(db, ctx);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ paymentId: payment!.id, totalCents: 3600 });
    // Named later: same number, buyer added.
    const named = await issueInvoiceAsStaff(db, ctx, payment!.id, { name: "Société Arya" });
    expect(named.number).toBe(invoices[0]!.number);
    expect(named.snapshot.buyer?.name).toBe("Société Arya");
    expect(named.snapshot.discountCents).toBe(400);
    const base = named.snapshot.taxes.reduce((s, t) => s + t.baseCents + t.taxCents, 0);
    expect(base).toBe(3600);
  });

  it("an order sent to the kitchen unpaid (no table) is collected later from its card", async () => {
    const { ctx, dish } = await setup();
    const { order, payment } = await createPosOrder(db, ctx, {
      channel: "takeaway",
      lines: [{ productId: dish.id, quantity: 1 }],
      idempotencyKey: key(),
    });
    expect(payment).toBeNull();
    expect(await listPayments(db, ctx)).toHaveLength(0);

    const paid = await recordStaffPayment(db, ctx, {
      orderId: order.id,
      provider: "on_site_terminal",
      idempotencyKey: key(),
    });
    expect(paid.amountCents).toBe(2000);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.paymentStatus).toBe("paid");
    const list = await listPayments(db, ctx);
    expect(list).toHaveLength(1);
    expect(list[0]!.orderNumbers).toEqual([order.number]);
    expect((await listInvoices(db, ctx))[0]).toMatchObject({ paymentId: paid.id, totalCents: 2000 });

    // Twice: nothing left to pay.
    await expect(
      recordStaffPayment(db, ctx, { orderId: order.id, provider: "cash", idempotencyKey: key() }),
    ).rejects.toMatchObject({ message: "nothing_to_pay" });
  });
});
