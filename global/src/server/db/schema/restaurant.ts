import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./_helpers";
import { memberRole, memberStatus, restaurantStatus } from "./enums";
import { organizations, users } from "./platform";

/** The tenant. Every tenant-scoped row carries `restaurant_id`. */
export const restaurants = pgTable(
  "restaurants",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id),
    slug: varchar({ length: 64 }).notNull(),
    name: varchar({ length: 160 }).notNull(),
    logoKey: text(),
    email: varchar({ length: 320 }),
    phone: varchar({ length: 32 }),
    addressLine1: varchar({ length: 200 }),
    addressLine2: varchar({ length: 200 }),
    city: varchar({ length: 100 }),
    postalCode: varchar({ length: 20 }),
    country: varchar({ length: 2 }).notNull().default("FR"),
    currency: varchar({ length: 3 }).notNull().default("EUR"),
    timezone: varchar({ length: 64 }).notNull().default("Europe/Paris"),
    defaultLocale: varchar({ length: 8 }).notNull().default("fr"),
    status: restaurantStatus().notNull().default("active"),
    suspendedReason: text(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("restaurants_slug_uq").on(t.slug),
    index("restaurants_org_idx").on(t.organizationId),
    index("restaurants_status_idx").on(t.status),
  ],
);

export type OpeningHours = Partial<
  Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { open: string; close: string }[]>
>;

export const restaurantSettings = pgTable("restaurant_settings", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  /** Menu prices are entered tax-inclusive (EU restaurant standard). */
  pricesIncludeTax: boolean().notNull().default(true),
  /** Order number prefix, e.g. "B" → B-1048. */
  orderPrefix: varchar({ length: 8 }).notNull().default("A"),
  onlinePaymentEnabled: boolean().notNull().default(false),
  /** Provider codes enabled for this restaurant (cash, on_site_terminal, pay_later, stripe...). */
  enabledPaymentProviders: text()
    .array()
    .notNull()
    .default(sql`ARRAY['cash','on_site_terminal']::text[]`),
  requirePaymentBeforeOrder: boolean().notNull().default(false),
  /** Auto-close idle table sessions after N minutes (null = manual only). */
  sessionAutoCloseMinutes: integer().default(180),
  openingHours: jsonb().$type<OpeningHours>(),
  legalName: varchar({ length: 200 }),
  legalId: varchar({ length: 64 }),
  vatNumber: varchar({ length: 64 }),
  legalNotice: text(),
  privacyPolicyUrl: text(),
  enabledLocales: text()
    .array()
    .notNull()
    .default(sql`ARRAY['fr','en']::text[]`),
  updatedAt: timestamps.updatedAt,
});

export const restaurantMembers = pgTable(
  "restaurant_members",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull(),
    /** Extra permissions granted on top of the role defaults. */
    grantedPermissions: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    /** Permissions removed from the role defaults. */
    revokedPermissions: text()
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: memberStatus().notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("restaurant_members_restaurant_user_uq").on(t.restaurantId, t.userId),
    index("restaurant_members_user_idx").on(t.userId),
  ],
);

export const taxRates = pgTable(
  "tax_rates",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 64 }).notNull(),
    /** Basis points: 10% = 1000, 5.5% = 550. */
    rateBps: integer().notNull(),
    isDefault: boolean().notNull().default(false),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("tax_rates_restaurant_idx").on(t.restaurantId),
    check("tax_rates_rate_bps_chk", sql`${t.rateBps} >= 0 AND ${t.rateBps} <= 10000`),
  ],
);

/** Gap-free per-restaurant sequences (order numbers, invoice numbers). */
export const counters = pgTable(
  "counters",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 32 }).notNull(),
    value: bigint({ mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.restaurantId, t.name] })],
);
