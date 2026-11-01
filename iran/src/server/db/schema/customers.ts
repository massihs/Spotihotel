import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { orders } from "./orders";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * Customer file (باشگاه مشتریان), one row per mobile number and restaurant. Filled from the
 * phone given at checkout or at the till; holds the loyalty balance.
 */
export const customers = pgTable(
  "customers",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Normalized Iranian mobile: 09xxxxxxxxx. */
    phone: varchar({ length: 20 }).notNull(),
    name: varchar({ length: 120 }),
    note: text(),
    points: integer().notNull().default(0),
    ordersCount: integer().notNull().default(0),
    /** Paid orders only. */
    totalSpentCents: money().notNull().default(0),
    lastOrderAt: tstz(),
    smsOptOut: boolean().notNull().default(false),
    /** House account (حساب اعتباری / نسیه): null = not allowed; balance is what the customer owes. */
    creditLimitCents: money(),
    balanceCents: money().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customers_restaurant_phone_uq").on(t.restaurantId, t.phone),
    index("customers_restaurant_last_idx").on(t.restaurantId, t.lastOrderAt),
    check("customers_points_chk", sql`${t.points} >= 0`),
  ],
);

/** Points ledger: earn on paid orders, redeem at the till, reversed on cancellation. */
export const loyaltyEntries = pgTable(
  "loyalty_entries",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    /** earn | redeem | reverse_earn | reverse_redeem | adjust */
    kind: varchar({ length: 16 }).notNull(),
    points: integer().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [
    index("loyalty_entries_customer_idx").on(t.customerId, t.createdAt),
    uniqueIndex("loyalty_entries_order_kind_uq").on(t.orderId, t.kind),
  ],
);

export const coupons = pgTable(
  "coupons",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Upper-case, compared case-insensitively. */
    code: varchar({ length: 32 }).notNull(),
    /** percent | amount */
    kind: varchar({ length: 8 }).notNull(),
    /** Percent (1–100) or an amount in minor units. */
    value: money().notNull(),
    minOrderCents: money().notNull().default(0),
    maxUses: integer(),
    usedCount: integer().notNull().default(0),
    endsAt: tstz(),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("coupons_restaurant_code_uq").on(t.restaurantId, t.code),
    check("coupons_value_chk", sql`${t.value} > 0`),
  ],
);

export const smsCampaigns = pgTable(
  "sms_campaigns",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    message: text().notNull(),
    /** all | inactive | loyal | new */
    audience: varchar({ length: 16 }).notNull(),
    recipients: integer().notNull().default(0),
    sent: integer().notNull().default(0),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index("sms_campaigns_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

/** House-account ledger: charges (orders put on account) and repayments. */
export const customerAccountEntries = pgTable(
  "customer_account_entries",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    customerId: uuid()
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    /** charge | payment | adjust */
    kind: varchar({ length: 12 }).notNull(),
    /** Signed: positive raises what the customer owes. */
    amountCents: money().notNull(),
    /** Repayment method: cash | card | transfer */
    method: varchar({ length: 16 }),
    note: text(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index("customer_account_entries_customer_idx").on(t.customerId, t.createdAt)],
);
