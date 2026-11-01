import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { foods, orderItems, products } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct, updateProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import {
  backfillNutrition,
  menuNutritionCoverage,
  searchFoods,
  syncFoods,
} from "@/server/modules/nutrition/foods";
import { createOwnerWithRestaurant } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");

describe("food database and automatic dish nutrition", () => {
  it("loads USDA and the catalogue once, and finds foods in any language", async () => {
    const first = await syncFoods(db);
    expect(first.usdaAdded).toBe(7793);
    expect((await syncFoods(db)).usdaAdded).toBe(0);
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(foods);
    expect(n!.n).toBe(7793 + first.catalogue);
    expect((await searchFoods(db, "برنج"))[0]?.sourceRef).toBe("rice");
    expect((await searchFoods(db, "salade césar"))[0]?.isRecipe).toBe(true);
    expect((await searchFoods(db, "Kiwifruit")).some((f) => f.source === "usda_sr")).toBe(true);
  });

  it("a Caesar salad saved with only its name gets protein, fat and salt; entered values stay", async () => {
    const { ctx } = await createOwnerWithRestaurant("Nutri DB");
    const cat = await createCategory(db, ctx, { name: "سالاد" });
    const caesar = await createProduct(db, ctx, {
      categoryId: cat.id,
      name: "سالاد سزار",
      priceCents: 1500,
      caloriesKcal: 450,
      nutrition: {},
    });
    expect(caesar.nutritionSource).toBe("auto");
    expect(caesar.nutrition).toMatchObject({ kcal: 450 });
    expect(caesar.nutrition!.proteinG!).toBeGreaterThan(25);

    // A value typed by the restaurant is kept, the rest stays calculated.
    const edited = await updateProduct(db, ctx, caesar.id, {
      categoryId: cat.id,
      name: "سالاد سزار",
      priceCents: 1500,
      caloriesKcal: 450,
      nutrition: { proteinG: 30 },
      nutritionSource: "manual",
    });
    const [row] = await db.select().from(products).where(eq(products.id, edited.id));
    expect(row!.nutrition).toMatchObject({ kcal: 450, proteinG: 30 });
    expect(row!.nutrition!.fatG!).toBeGreaterThan(10);

    // The order line freezes the full values.
    const { order } = await createPosOrder(db, ctx, {
      lines: [{ productId: caesar.id, quantity: 1 }],
      idempotencyKey: key(),
    });
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(line!.nutrition).toMatchObject({ kcal: 450, proteinG: 30 });

    const coverage = await menuNutritionCoverage(db, ctx.restaurant.id);
    expect(coverage[0]?.kind).toBe("manual");
  });

  it("completes old order lines that only recorded calories, scaled to those calories", async () => {
    const { ctx } = await createOwnerWithRestaurant("Nutri old");
    const cat = await createCategory(db, ctx, { name: "Salades" });
    const p = await createProduct(db, ctx, { categoryId: cat.id, name: "Salade César", priceCents: 1200 });
    // As before the database existed: only calories on the dish and on the line.
    await db
      .update(products)
      .set({ caloriesKcal: 500, nutrition: { kcal: 500 }, nutritionSource: "manual" })
      .where(eq(products.id, p.id));
    const { order } = await createPosOrder(db, ctx, {
      lines: [{ productId: p.id, quantity: 1 }],
      idempotencyKey: key(),
    });
    await db
      .update(orderItems)
      .set({ nutrition: { kcal: 250 } })
      .where(eq(orderItems.orderId, order.id));

    const res = await backfillNutrition(db);
    expect(res.dishes).toBeGreaterThan(0);
    const [line] = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(line!.nutrition!.kcal).toBe(250);
    const [dish] = await db.select().from(products).where(eq(products.id, p.id));
    expect(line!.nutrition!.proteinG).toBeCloseTo(dish!.nutrition!.proteinG! / 2, 0);
    // Nothing left to do.
    expect((await backfillNutrition(db)).lines).toBe(0);
  });
});
