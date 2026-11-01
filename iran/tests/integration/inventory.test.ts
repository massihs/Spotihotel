import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, stockItems } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import {
  adjustStock,
  createPurchase,
  createStockItem,
  createSupplier,
  listRecipes,
  setRecipe,
} from "@/server/modules/inventory/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { updateOrderStatus } from "@/server/modules/orders/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const qtyOf = async (id: string) =>
  (await db.select().from(stockItems).where(eq(stockItems.id, id)))[0]!.quantity;

describe("inventory", () => {
  it("tracks purchases, recipes, sales and cancellations", async () => {
    const { ctx } = await createOwnerWithRestaurant("Kafe");
    const cat = await createCategory(db, ctx, { name: "Café" });
    const latte = await createProduct(db, ctx, { categoryId: cat.id, name: "Latte", priceCents: 1000 });
    const milk = await createStockItem(db, ctx, { name: "Lait", unit: "ml", lowStockThreshold: 500 });
    const coffee = await createStockItem(db, ctx, { name: "Café grains", unit: "g" });
    const supplier = await createSupplier(db, ctx, { name: "Laiterie" });

    await createPurchase(db, ctx, {
      supplierId: supplier.id,
      lines: [
        { stockItemId: milk.id, quantity: 1000, unitCostCents: 2 },
        { stockItemId: coffee.id, quantity: 500, unitCostCents: 10 },
      ],
    });
    await createPurchase(db, ctx, { lines: [{ stockItemId: milk.id, quantity: 1000, unitCostCents: 4 }] });
    const [m] = await db.select().from(stockItems).where(eq(stockItems.id, milk.id));
    expect(m!.quantity).toBe(2000);
    expect(m!.avgCostCents).toBe(3); // weighted average of 2 and 4

    await setRecipe(db, ctx, latte.id, {
      items: [
        { stockItemId: milk.id, quantity: 200 },
        { stockItemId: coffee.id, quantity: 18 },
      ],
    });
    const recipe = (await listRecipes(db, ctx)).find((r) => r.id === latte.id)!;
    expect(recipe.costCents).toBe(200 * 3 + 18 * 10);

    const { order } = await createPosOrder(db, ctx, {
      lines: [{ productId: latte.id, quantity: 3 }],
      idempotencyKey: randomBytes(12).toString("hex"),
    });
    expect(await qtyOf(milk.id)).toBe(1400);
    expect(await qtyOf(coffee.id)).toBe(446);

    await updateOrderStatus(db, ctx, order.id, "cancelled");
    expect(await qtyOf(milk.id)).toBe(2000);
  });

  it("counts, wastes and alerts below the threshold", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Kafe");
    const item = await createStockItem(db, ctx, {
      name: "Sucre",
      unit: "kg",
      lowStockThreshold: 2,
      initialQuantity: 5,
    });
    await adjustStock(db, ctx, item.id, { kind: "waste", quantity: 1.5 });
    expect(await qtyOf(item.id)).toBe(3.5);
    await adjustStock(db, ctx, item.id, { kind: "count", quantity: 1 });
    expect(await qtyOf(item.id)).toBe(1);
    const alerts = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.restaurantId, restaurant.id), eq(notifications.type, "stock.low")));
    expect(alerts).toHaveLength(1);
  });
});
