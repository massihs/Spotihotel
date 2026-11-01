import type { Nutrition } from "@/lib/nutrition";
import { resolveCategoryIcon } from "@/lib/category-icons";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  categories,
  optionGroups,
  optionValues,
  productImages,
  productOptionGroups,
  products,
  taxRates,
} from "@/server/db/schema";
import type { PricedOptionGroup, PricedProduct } from "@/server/modules/pricing";
import { productImageUrls } from "./images";

export type PublicProduct = PricedProduct & {
  description: string | null;
  compareAtPriceCents: number | null;
  /** Price lists per sales type (null = menu price). */
  takeawayPriceCents: number | null;
  deliveryPriceCents: number | null;
  isFeatured: boolean;
  allergens: string[];
  tags: string[];
  ingredients: string | null;
  caloriesKcal: number | null;
  weightGrams: number | null;
  /** Protein, carbs… of one portion (kcal is caloriesKcal). */
  nutrition: Nutrition | null;
  categoryId: string;
  categoryName: string;
  images: { sm: string; md: string; lg: string; placeholder: string | null }[];
};

export type PublicMenu = {
  categories: {
    id: string;
    name: string;
    description: string | null;
    /** Resolved library icon key (chosen icon, else the template's, else a plate). */
    icon: string;
    productIds: string[];
  }[];
  products: Record<string, PublicProduct>;
};

/**
 * Products as the guest may see/order them: active category, active and not deleted product.
 * Sold-out products are included (shown as "Épuisé") but `isAvailable=false` blocks ordering.
 */
export async function loadPublicMenu(db: DbOrTx, restaurantId: string): Promise<PublicMenu> {
  const cats = await db
    .select({
      id: categories.id,
      name: categories.name,
      description: categories.description,
      icon: categories.icon,
      templateKey: categories.templateKey,
    })
    .from(categories)
    .where(
      and(
        eq(categories.restaurantId, restaurantId),
        isNull(categories.deletedAt),
        eq(categories.isActive, true),
      ),
    )
    .orderBy(asc(categories.sortOrder), asc(categories.createdAt));
  if (cats.length === 0) return { categories: [], products: {} };

  const items = await loadPricedProducts(db, restaurantId, { categoryIds: cats.map((c) => c.id) });
  const byCategory = new Map<string, string[]>();
  for (const p of items) {
    const list = byCategory.get(p.categoryId) ?? [];
    list.push(p.id);
    byCategory.set(p.categoryId, list);
  }
  return {
    categories: cats
      .map(({ templateKey, icon, ...c }) => ({
        ...c,
        icon: resolveCategoryIcon(icon, templateKey),
        productIds: byCategory.get(c.id) ?? [],
      }))
      .filter((c) => c.productIds.length > 0),
    products: Object.fromEntries(items.map((p) => [p.id, p])),
  };
}

/** Loads orderable products with their option groups and tax rate, fresh from the database. */
export async function loadPricedProducts(
  db: DbOrTx,
  restaurantId: string,
  filter: { categoryIds?: string[]; productIds?: string[] },
): Promise<PublicProduct[]> {
  const conditions = [
    eq(products.restaurantId, restaurantId),
    isNull(products.deletedAt),
    eq(products.isActive, true),
  ];
  if (filter.categoryIds) conditions.push(inArray(products.categoryId, filter.categoryIds));
  if (filter.productIds) {
    if (filter.productIds.length === 0) return [];
    conditions.push(inArray(products.id, filter.productIds));
  }

  const [rows, defaultRate] = await Promise.all([
    db
      .select({
        p: products,
        rateBps: taxRates.rateBps,
        categoryActive: categories.isActive,
        categoryName: categories.name,
        categoryDeleted: categories.deletedAt,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(taxRates, eq(taxRates.id, products.taxRateId))
      .where(and(...conditions))
      .orderBy(asc(products.sortOrder), asc(products.createdAt)),
    db
      .select({ rateBps: taxRates.rateBps })
      .from(taxRates)
      .where(
        and(
          eq(taxRates.restaurantId, restaurantId),
          eq(taxRates.isDefault, true),
          isNull(taxRates.deletedAt),
        ),
      )
      .limit(1),
  ]);
  const visible = rows.filter((r) => r.categoryActive && !r.categoryDeleted);
  if (visible.length === 0) return [];
  const ids = visible.map((r) => r.p.id);

  const [imgs, links] = await Promise.all([
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.sortOrder)),
    db
      .select({ productId: productOptionGroups.productId, group: optionGroups })
      .from(productOptionGroups)
      .innerJoin(optionGroups, eq(optionGroups.id, productOptionGroups.groupId))
      .where(and(inArray(productOptionGroups.productId, ids), isNull(optionGroups.deletedAt)))
      .orderBy(asc(productOptionGroups.sortOrder)),
  ]);
  const groupIds = [...new Set(links.map((l) => l.group.id))];
  const values = groupIds.length
    ? await db
        .select()
        .from(optionValues)
        .where(and(inArray(optionValues.groupId, groupIds), isNull(optionValues.deletedAt)))
        .orderBy(asc(optionValues.sortOrder))
    : [];

  const groupById = new Map<string, PricedOptionGroup>(
    groupIds.map((id) => {
      const g = links.find((l) => l.group.id === id)!.group;
      return [
        id,
        {
          id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          values: values
            .filter((v) => v.groupId === id)
            .map((v) => ({
              id: v.id,
              name: v.name,
              priceDeltaCents: v.priceDeltaCents,
              isAvailable: v.isAvailable,
              isDefault: v.isDefault,
            })),
        },
      ];
    }),
  );

  return visible.map(({ p, rateBps, categoryName }) => ({
    id: p.id,
    categoryId: p.categoryId,
    categoryName,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    takeawayPriceCents: p.takeawayPriceCents,
    deliveryPriceCents: p.deliveryPriceCents,
    isAvailable: p.isAvailable,
    isFeatured: p.isFeatured,
    allergens: p.allergens,
    tags: p.tags,
    ingredients: p.ingredients,
    caloriesKcal: p.caloriesKcal,
    weightGrams: p.weightGrams,
    nutrition: p.nutrition,
    taxRateBps: rateBps ?? defaultRate[0]?.rateBps ?? 0,
    images: imgs
      .filter((i) => i.productId === p.id)
      .map((i) => ({ ...productImageUrls(i.storageKey), placeholder: i.placeholder })),
    optionGroups: links.filter((l) => l.productId === p.id).map((l) => groupById.get(l.group.id)!),
  }));
}

export { forChannel } from "@/lib/channel-price";
