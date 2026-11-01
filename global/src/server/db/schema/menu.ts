import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, money } from "./_helpers";
import { restaurants, taxRates } from "./restaurant";

export const categories = pgTable(
  "categories",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    description: text(),
    icon: varchar({ length: 32 }),
    /** Set when created from a global template (keeps analytics comparable across tenants). */
    templateKey: varchar({ length: 48 }),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("categories_restaurant_sort_idx").on(t.restaurantId, t.sortOrder)],
);

export const products = pgTable(
  "products",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    priceCents: money().notNull(),
    /** Original price shown struck-through when a promo price is active. */
    compareAtPriceCents: money(),
    taxRateId: uuid().references(() => taxRates.id, { onDelete: "set null" }),
    ingredients: text(),
    /** EU 14 allergens codes: gluten, crustaceans, eggs, fish, peanuts, soy, milk, nuts, celery, mustard, sesame, sulphites, lupin, molluscs. */
    allergens: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    caloriesKcal: integer(),
    weightGrams: integer(),
    tags: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    isAvailable: boolean().notNull().default(true),
    isFeatured: boolean().notNull().default(false),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("products_restaurant_category_sort_idx").on(t.restaurantId, t.categoryId, t.sortOrder),
    check("products_price_chk", sql`${t.priceCents} >= 0`),
    check("products_compare_at_chk", sql`${t.compareAtPriceCents} IS NULL OR ${t.compareAtPriceCents} >= 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Base storage key; variants are stored as `${key}-{sm|md|lg}.webp`. */
    storageKey: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    /** Tiny base64 placeholder for instant blur-up. */
    placeholder: text(),
    altText: varchar({ length: 200 }),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("product_images_product_idx").on(t.productId, t.sortOrder)],
);

/** Reusable modifier group ("Cuisson", "Suppléments"). */
export const optionGroups = pgTable(
  "option_groups",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    description: text(),
    minSelect: integer().notNull().default(0),
    maxSelect: integer().notNull().default(1),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("option_groups_restaurant_idx").on(t.restaurantId),
    check(
      "option_groups_select_chk",
      sql`${t.minSelect} >= 0 AND ${t.maxSelect} >= 1 AND ${t.minSelect} <= ${t.maxSelect}`,
    ),
  ],
);

export const optionValues = pgTable(
  "option_values",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    groupId: uuid()
      .notNull()
      .references(() => optionGroups.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    priceDeltaCents: money().notNull().default(0),
    isDefault: boolean().notNull().default(false),
    isAvailable: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("option_values_group_idx").on(t.groupId, t.sortOrder),
    check("option_values_delta_chk", sql`${t.priceDeltaCents} >= 0`),
  ],
);

export const productOptionGroups = pgTable(
  "product_option_groups",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    groupId: uuid()
      .notNull()
      .references(() => optionGroups.id, { onDelete: "cascade" }),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.groupId] }),
    index("product_option_groups_group_idx").on(t.groupId),
  ],
);
