import { boolean, index, numeric, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, softDelete, timestamps, tstz } from "./_helpers";
import { products } from "./menu";
import { orders } from "./orders";
import { users } from "./platform";
import { restaurants } from "./restaurant";

const qty = () => numeric({ precision: 14, scale: 3, mode: "number" });

export const suppliers = pgTable(
  "suppliers",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    phone: varchar({ length: 32 }),
    note: text(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("suppliers_restaurant_idx").on(t.restaurantId)],
);

/** An ingredient or consumable kept in stock (کالای انبار). */
export const stockItems = pgTable(
  "stock_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    /** g | kg | ml | l | piece | pack */
    unit: varchar({ length: 12 }).notNull(),
    quantity: qty().notNull().default(0),
    lowStockThreshold: qty().notNull().default(0),
    /** Weighted average purchase cost per unit, minor units. */
    avgCostCents: money().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("stock_items_restaurant_idx").on(t.restaurantId)],
);

/** Bill of materials: how much of each stock item one portion of a product uses. */
export const recipeItems = pgTable(
  "recipe_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    stockItemId: uuid()
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    quantity: qty().notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("recipe_items_product_item_uq").on(t.productId, t.stockItemId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    supplierId: uuid().references(() => suppliers.id, { onDelete: "set null" }),
    /** Supplier's invoice number. */
    reference: varchar({ length: 64 }),
    totalCents: money().notNull(),
    purchasedAt: tstz().notNull().defaultNow(),
    note: text(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("purchases_restaurant_idx").on(t.restaurantId, t.purchasedAt)],
);

export const purchaseLines = pgTable("purchase_lines", {
  id: pk(),
  purchaseId: uuid()
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  stockItemId: uuid()
    .notNull()
    .references(() => stockItems.id),
  quantity: qty().notNull(),
  unitCostCents: money().notNull(),
});

/** Every change of stock: purchase, sale, cancellation, count adjustment, waste. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    stockItemId: uuid()
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    /** purchase | sale | sale_cancel | adjustment | waste */
    kind: varchar({ length: 16 }).notNull(),
    /** Signed: + in, − out. */
    quantity: qty().notNull(),
    unitCostCents: money().notNull().default(0),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    purchaseId: uuid().references(() => purchases.id, { onDelete: "set null" }),
    note: varchar({ length: 200 }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_item_idx").on(t.stockItemId, t.createdAt),
    index("stock_movements_restaurant_idx").on(t.restaurantId, t.createdAt),
  ],
);
