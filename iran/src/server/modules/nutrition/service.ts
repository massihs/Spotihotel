import { and, eq, inArray } from "drizzle-orm";
import { tidy, type Nutrition } from "@/lib/nutrition";
import type { DbOrTx } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { completeNutrition } from "./foods";

/**
 * Nutrition of one portion of each dish, to freeze on the order lines (null = unknown).
 * A dish not calculated yet (imported, copied…) is calculated on the spot.
 */
export async function nutritionOf(db: DbOrTx, rid: string, productIds: string[]) {
  const out = new Map<string, Nutrition | null>();
  if (!productIds.length) return out;
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      ingredients: products.ingredients,
      description: products.description,
      weightGrams: products.weightGrams,
      caloriesKcal: products.caloriesKcal,
      nutrition: products.nutrition,
      nutritionSource: products.nutritionSource,
    })
    .from(products)
    .where(and(eq(products.restaurantId, rid), inArray(products.id, [...new Set(productIds)])));
  for (const r of rows) {
    const full = r.nutrition?.proteinG != null ? r.nutrition : completeNutrition(r).nutrition;
    const n = tidy({ ...(full ?? {}), ...(r.caloriesKcal != null ? { kcal: r.caloriesKcal } : {}) });
    out.set(r.id, Object.keys(n).length ? n : null);
  }
  return out;
}
