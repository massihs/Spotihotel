import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, softDelete, timestamps } from "./_helpers";
import { customers } from "./customers";
import { restaurants } from "./restaurant";

/** Delivery area with its fee (محدوده ارسال), e.g. "Zone 1 – up to 3 km". */
export const deliveryZones = pgTable(
  "delivery_zones",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    feeCents: money().notNull().default(0),
    minOrderCents: money().notNull().default(0),
    /** Typical delivery time shown to the customer. */
    etaMinutes: integer().notNull().default(45),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("delivery_zones_restaurant_idx").on(t.restaurantId),
    check("delivery_zones_fee_chk", sql`${t.feeCents} >= 0 AND ${t.minOrderCents} >= 0`),
  ],
);

/** Courier (پیک). Not necessarily a dashboard user. */
export const couriers = pgTable(
  "couriers",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 120 }).notNull(),
    phone: varchar({ length: 20 }),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("couriers_restaurant_idx").on(t.restaurantId)],
);

/** A customer can have unlimited delivery addresses. */
export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: varchar({ length: 40 }),
    address: text().notNull(),
    zoneId: uuid().references(() => deliveryZones.id, { onDelete: "set null" }),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("customer_addresses_customer_idx").on(t.customerId)],
);
