import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { orders, restaurantSettings } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { addCashMovement, closeShift, createPosOrder, openShift } from "@/server/modules/pos/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

async function setup() {
  const owner = await createOwnerWithRestaurant("Kafe", { plan: "professional" });
  await db
    .update(restaurantSettings)
    .set({ enabledPaymentProviders: ["cash", "on_site_terminal"] })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const cat = await createCategory(db, owner.ctx, { name: "Boissons" });
  const latte = await createProduct(db, owner.ctx, { categoryId: cat.id, name: "Latte", priceCents: 1000 });
  const table = await createTable(db, owner.ctx, { label: "5" });
  return { ...owner, latte, table };
}

describe("point of sale", () => {
  it("rings up a paid takeaway order with a discount", async () => {
    const { ctx, latte } = await setup();
    const { order, payment } = await createPosOrder(db, ctx, {
      channel: "takeaway",
      lines: [{ productId: latte.id, quantity: 3 }],
      discountPct: 10,
      payment: { provider: "cash", tenderedCents: 5000 },
      idempotencyKey: key(),
    });
    expect(order.totalCents).toBe(2700);
    expect(order.discountCents).toBe(300);
    expect(order.status).toBe("accepted");
    expect(payment?.amountCents).toBe(2700);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row!.paymentStatus).toBe("paid");
  });

  it("refuses cash below the bill and unknown products", async () => {
    const { ctx, latte } = await setup();
    await expect(
      createPosOrder(db, ctx, {
        lines: [{ productId: latte.id, quantity: 1 }],
        payment: { provider: "cash", tenderedCents: 10 },
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "tendered_too_low" });
    await expect(
      createPosOrder(db, ctx, {
        lines: [{ productId: "0190d4c2-0000-7000-8000-000000000000", quantity: 1 }],
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ message: "product_unavailable" });
  });

  it("sends a table order to the kitchen unpaid", async () => {
    const { ctx, latte, table } = await setup();
    const { order, payment } = await createPosOrder(db, ctx, {
      channel: "dine_in",
      tableId: table.id,
      lines: [{ productId: latte.id, quantity: 1, note: "sans sucre" }],
      idempotencyKey: key(),
    });
    expect(order.tableLabel).toBe("5");
    expect(order.paymentStatus).toBe("unpaid");
    expect(payment).toBeNull();
  });

  it("balances the cash drawer", async () => {
    const { ctx, latte } = await setup();
    await openShift(db, ctx, { openingFloatCents: 10_000 });
    await expect(openShift(db, ctx, { openingFloatCents: 0 })).rejects.toMatchObject({
      message: "shift_already_open",
    });
    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 2 }],
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 1 }],
      payment: { provider: "on_site_terminal" },
      idempotencyKey: key(),
    });
    await addCashMovement(db, ctx, { direction: "out", amountCents: 500, reason: "Lait" });
    const { shift, summary } = await closeShift(db, ctx, { countedCashCents: 11_400 });
    expect(summary.cashSales).toBe(2000);
    expect(summary.totalSales).toBe(3000);
    expect(shift.expectedCashCents).toBe(11_500);
    expect(shift.countedCashCents! - shift.expectedCashCents!).toBe(-100);
  });
});
