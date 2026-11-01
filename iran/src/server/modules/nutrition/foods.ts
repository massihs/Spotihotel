import { and, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { NUTRIENTS, tidy, type Nutrition } from "@/lib/nutrition";
import type { DbOrTx } from "@/server/db/client";
import { foods, orderItems, products } from "@/server/db/schema";
import { INGREDIENTS, RECIPES } from "./catalog";
import usda from "./data/usda-sr-legacy.json";
import { autoNutrition, usdaPer100 } from "./estimate";

const toNutrition = (v: number[]): Nutrition =>
  tidy(Object.fromEntries(NUTRIENTS.map((k, i) => [k, v[i]])) as Nutrition);

type UsdaRow = [number, string, number, ...(number | null)[]];

/**
 * Loads the food database: the USDA table once (7 793 foods), the Spotifood catalogue on every
 * start (small, follows the code). Idempotent.
 */
export async function syncFoods(db: DbOrTx) {
  const rows = usda.foods as unknown as UsdaRow[];
  const cats = usda.categories as Record<string, string>;
  const [have] = await db.select({ n: count() }).from(foods).where(eq(foods.source, "usda_sr"));
  let usdaAdded = 0;
  if ((have?.n ?? 0) < rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((f) => ({
        source: "usda_sr",
        sourceRef: String(f[0]),
        nameEn: f[1],
        category: cats[String(f[2])] ?? null,
        per100g: toNutrition([3, 4, 5, 6, 7, 8, 9].map((j) => (f[j] as number | null) ?? 0)),
      }));
      const res = await db.insert(foods).values(chunk).onConflictDoNothing().returning({ id: foods.id });
      usdaAdded += res.length;
    }
  }

  const catalogue = [
    ...INGREDIENTS.map((i) => ({
      source: "spotifood_ingredient",
      sourceRef: i.key,
      nameEn: i.en[0] ?? i.key,
      nameFr: i.fr[0] ?? null,
      nameFa: i.fa[0] ?? null,
      aliases: [...i.fa, ...i.fr, ...i.en].join(" | ").toLowerCase(),
      category: i.usda ? `USDA ${i.usda}` : "Spotifood (moyenne publiée)",
      per100g: toNutrition(i.custom ?? usdaPer100(i.usda!) ?? []),
      portionG: i.portionG,
      isRecipe: false,
    })),
    ...RECIPES.map((r) => {
      const byKey = new Map(INGREDIENTS.map((i) => [i.key, i]));
      const grams = r.parts.reduce((s, [, g]) => s + g, 0);
      const sum = [0, 0, 0, 0, 0, 0, 0];
      for (const [k, g] of r.parts) {
        const i = byKey.get(k)!;
        (i.custom ?? usdaPer100(i.usda!) ?? []).forEach((v, j) => (sum[j]! += (v * g) / 100));
      }
      return {
        source: "spotifood_recipe",
        sourceRef: r.key,
        nameEn: r.en[0] ?? r.key,
        nameFr: r.fr[0] ?? null,
        nameFa: r.fa[0] ?? null,
        aliases: [...r.fa, ...r.fr, ...r.en, ...r.parts.map(([k, g]) => `${k} ${g}g`)]
          .join(" | ")
          .toLowerCase(),
        category: "Recette type",
        per100g: toNutrition(sum.map((v) => (grams ? (v * 100) / grams : 0))),
        perPortion: toNutrition(sum),
        portionG: grams,
        isRecipe: true,
      };
    }),
  ];
  for (const row of catalogue)
    await db
      .insert(foods)
      .values(row)
      .onConflictDoUpdate({
        target: [foods.source, foods.sourceRef],
        set: { ...row, updatedAt: new Date() },
      });
  return { usdaAdded, catalogue: catalogue.length };
}

export async function searchFoods(db: DbOrTx, q: string, limit = 30) {
  const term = q.trim();
  const where = term
    ? or(
        ilike(foods.nameEn, `%${term}%`),
        ilike(foods.nameFr, `%${term}%`),
        ilike(foods.nameFa, `%${term}%`),
        ilike(foods.aliases, `%${term.toLowerCase()}%`),
      )
    : eq(foods.isRecipe, true);
  return (
    db
      .select()
      .from(foods)
      .where(where)
      // Recipes and the multilingual catalogue first, then USDA by name length.
      .orderBy(
        // Exact names first, then our catalogue (recipes, ingredients), then USDA.
        sql`case when lower(${foods.nameEn}) = lower(${term}) or lower(coalesce(${foods.nameFr}, '')) = lower(${term}) or ${foods.nameFa} = ${term} then 0 else 1 end`,
        sql`case ${foods.source} when 'spotifood_recipe' then 0 when 'spotifood_ingredient' then 1 else 2 end`,
        sql`length(${foods.nameEn})`,
      )
      .limit(limit)
  );
}

const hasMacros = (n: Nutrition | null | undefined) =>
  n?.proteinG != null || n?.carbsG != null || n?.fatG != null;

/**
 * Completes a dish's nutrition: values the restaurant entered stay; the others come from the
 * automatic calculation (ingredients, recipe, declared calories).
 */
export function completeNutrition(p: {
  name: string;
  ingredients: string | null;
  description?: string | null;
  weightGrams: number | null;
  caloriesKcal: number | null;
  nutrition: Nutrition | null;
  nutritionSource: string | null;
}): { nutrition: Nutrition | null; nutritionSource: string | null } {
  const manual = p.nutritionSource !== "auto" && hasMacros(p.nutrition) ? p.nutrition : null;
  const auto = autoNutrition(p);
  if (!auto) return { nutrition: manual ?? p.nutrition, nutritionSource: manual ? p.nutritionSource : null };
  const merged = tidy({
    ...auto,
    ...(manual ?? {}),
    ...(p.caloriesKcal != null ? { kcal: p.caloriesKcal } : {}),
  });
  return { nutrition: merged, nutritionSource: manual ? (p.nutritionSource ?? "manual") : "auto" };
}

/**
 * Every dish without full nutrition gets it calculated, then order lines recorded with only
 * calories (or nothing) get the missing nutrients — scaled to the calories they recorded.
 * Values already recorded are never changed. Idempotent.
 */
export async function backfillNutrition(db: DbOrTx) {
  const list = await db
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
    .where(
      and(
        isNull(products.deletedAt),
        // Calculated dishes follow the database as it grows; entered values never change.
        or(
          isNull(products.nutrition),
          sql`not (${products.nutrition} ? 'proteinG')`,
          eq(products.nutritionSource, "auto"),
        ),
      ),
    );
  let dishes = 0;
  for (const p of list) {
    const next = completeNutrition(p);
    if (!hasMacros(next.nutrition)) continue;
    if (JSON.stringify(next.nutrition) === JSON.stringify(p.nutrition)) continue;
    await db
      .update(products)
      .set({ nutrition: next.nutrition, nutritionSource: next.nutritionSource })
      .where(eq(products.id, p.id));
    dishes++;
  }

  let lines = 0;
  for (;;) {
    const todo = await db
      .select({ id: orderItems.id, productId: orderItems.productId, nutrition: orderItems.nutrition })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(
        and(
          or(isNull(orderItems.nutrition), sql`not (${orderItems.nutrition} ? 'proteinG')`),
          sql`${products.nutrition} ? 'proteinG'`,
        ),
      )
      .limit(500);
    if (!todo.length) break;
    const ids = [...new Set(todo.map((t) => t.productId!))];
    const src = new Map(
      (
        await db
          .select({ id: products.id, nutrition: products.nutrition })
          .from(products)
          .where(inArray(products.id, ids))
      ).map((r) => [r.id, r.nutrition]),
    );
    for (const t of todo) {
      const base = src.get(t.productId!);
      if (!base) continue;
      const k = t.nutrition?.kcal != null && base.kcal ? t.nutrition.kcal / base.kcal : 1;
      const scaled = Object.fromEntries(Object.entries(base).map(([key, v]) => [key, (v as number) * k]));
      await db
        .update(orderItems)
        .set({ nutrition: tidy({ ...scaled, ...(t.nutrition ?? {}) } as Nutrition) })
        .where(eq(orderItems.id, t.id));
      lines++;
    }
  }
  return { dishes, lines };
}

/** The restaurant's dishes and where their nutrition comes from. */
export async function menuNutritionCoverage(db: DbOrTx, restaurantId: string) {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      nutrition: products.nutrition,
      source: products.nutritionSource,
      categoryId: products.categoryId,
    })
    .from(products)
    .where(and(eq(products.restaurantId, restaurantId), isNull(products.deletedAt)))
    .orderBy(products.name);
  const kind = (r: (typeof rows)[number]) =>
    !hasMacros(r.nutrition) ? "missing" : r.source === "auto" ? "auto" : "manual";
  return rows.map((r) => ({ ...r, kind: kind(r) as "missing" | "auto" | "manual" }));
}

/** Recalculates the restaurant's calculated (not entered) dishes now. */
export async function recalculateMenu(db: DbOrTx, restaurantId: string) {
  const list = await db
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
    .where(and(eq(products.restaurantId, restaurantId), isNull(products.deletedAt)));
  let updated = 0;
  for (const p of list) {
    if (p.nutritionSource !== "auto" && hasMacros(p.nutrition)) continue;
    const next = completeNutrition({ ...p, nutritionSource: "auto" });
    if (!hasMacros(next.nutrition) || JSON.stringify(next.nutrition) === JSON.stringify(p.nutrition))
      continue;
    await db
      .update(products)
      .set({ nutrition: next.nutrition, nutritionSource: "auto" })
      .where(eq(products.id, p.id));
    updated++;
  }
  return { updated };
}
