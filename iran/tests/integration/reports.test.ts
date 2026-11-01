import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createPurchase, createStockItem, setRecipe } from "@/server/modules/inventory/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { createExpense, deleteExpense, profitAndLoss } from "@/server/modules/reports/service";
import { resolvePeriod } from "@/lib/period";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("reports", () => {
  it("builds sales, payment methods, cost of goods and a P&L", async () => {
    const { ctx } = await createOwnerWithRestaurant("Compta");
    const cat = await createCategory(db, ctx, { name: "Café" });
    const latte = await createProduct(db, ctx, { categoryId: cat.id, name: "Latte", priceCents: 1100 });
    const tea = await createProduct(db, ctx, { categoryId: cat.id, name: "Thé", priceCents: 500 });
    const milk = await createStockItem(db, ctx, { name: "Lait", unit: "ml" });
    await createPurchase(db, ctx, { lines: [{ stockItemId: milk.id, quantity: 1000, unitCostCents: 1 }] });
    await setRecipe(db, ctx, latte.id, { items: [{ stockItemId: milk.id, quantity: 200 }] });

    await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 2 }],
      payment: { provider: "cash" },
      idempotencyKey: key(),
    });
    await createPosOrder(db, ctx, {
      lines: [{ productId: tea.id, quantity: 1 }],
      payment: { provider: "on_site_terminal" },
      idempotencyKey: key(),
    });
    const { order: cancelled } = await createPosOrder(db, ctx, {
      lines: [{ productId: tea.id, quantity: 3 }],
      idempotencyKey: key(),
    });
    await updateOrderStatus(db, ctx, cancelled.id, "cancelled");
    await createExpense(db, ctx, { category: "rent", amountCents: 300 });
    const tmp = await createExpense(db, ctx, { category: "other", amountCents: 50 });
    await deleteExpense(db, ctx, tmp.id);

    const period = resolvePeriod({ p: "today" }, ctx.restaurant.timezone);
    const { sales, pnl, purchases } = await profitAndLoss(db, ctx, period);
    expect(sales.summary.orders).toBe(2);
    expect(sales.summary.totalCents).toBe(2700);
    expect(sales.summary.cancelledOrders).toBe(1);
    expect(sales.methods.map((m) => [m.provider, m.amountCents]).sort()).toEqual([
      ["cash", 2200],
      ["on_site_terminal", 500],
    ]);
    expect(sales.products[0]).toMatchObject({
      name: "Latte",
      quantity: 2,
      revenueCents: 2200,
      costCents: 400,
    });
    expect(sales.daily).toHaveLength(1);
    expect(pnl.cogsCents).toBe(400);
    expect(pnl.expensesCents).toBe(300);
    expect(pnl.netCents).toBe(pnl.netSalesCents - 400 - 300);
    expect(purchases.totalCents).toBe(1000);
  });
});
