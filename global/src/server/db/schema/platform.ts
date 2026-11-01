import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, tstz, money } from "./_helpers";
import { orgRole, subscriptionStatus, userStatus } from "./enums";

/** Platform accounts: restaurant owners, staff and super admins. Customers are anonymous guests. */
export const users = pgTable(
  "users",
  {
    id: pk(),
    email: varchar({ length: 320 }).notNull(),
    passwordHash: text().notNull(),
    fullName: varchar({ length: 160 }).notNull(),
    locale: varchar({ length: 8 }),
    isSuperAdmin: boolean().notNull().default(false),
    status: userStatus().notNull().default("active"),
    lastLoginAt: tstz(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** SHA-256 of the opaque cookie token. The raw token is never stored. */
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: tstz().notNull(),
    lastSeenAt: tstz().notNull().defaultNow(),
    ip: varchar({ length: 64 }),
    userAgent: varchar({ length: 512 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("auth_sessions_token_hash_uq").on(t.tokenHash),
    index("auth_sessions_user_idx").on(t.userId),
    index("auth_sessions_expires_idx").on(t.expiresAt),
  ],
);

/** SaaS plans. `limits` drives entitlement checks (max tables, features...). */
export const plans = pgTable(
  "plans",
  {
    id: pk(),
    code: varchar({ length: 32 }).notNull(),
    name: varchar({ length: 64 }).notNull(),
    priceMonthlyCents: money().notNull().default(0),
    currency: varchar({ length: 3 }).notNull().default("EUR"),
    limits: jsonb().$type<PlanLimits>().notNull(),
    isPublic: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("plans_code_uq").on(t.code)],
);

export type PlanLimits = {
  /** null = unlimited */
  maxRestaurants: number | null;
  maxTables: number | null;
  maxOrdersPerMonth: number | null;
  maxStaff: number | null;
  features: string[];
};

/** Legal owner / group. Prepares multi-site owners and franchises. */
export const organizations = pgTable("organizations", {
  id: pk(),
  name: varchar({ length: 160 }).notNull(),
  billingEmail: varchar({ length: 320 }),
  ...timestamps,
  ...softDelete,
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole().notNull().default("member"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("org_members_org_user_uq").on(t.organizationId, t.userId),
    index("org_members_user_idx").on(t.userId),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatus().notNull().default("trialing"),
    provider: varchar({ length: 32 }),
    providerRef: varchar({ length: 128 }),
    currentPeriodEnd: tstz(),
    cancelAt: tstz(),
    ...timestamps,
  },
  (t) => [index("subscriptions_org_idx").on(t.organizationId)],
);

export const platformSettings = pgTable("platform_settings", {
  key: varchar({ length: 64 }).primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamps.updatedAt,
});

/** Predefined categories offered to every restaurant (Entrées, Pizza...). Names are i18n keys. */
export const globalCategoryTemplates = pgTable(
  "global_category_templates",
  {
    id: pk(),
    key: varchar({ length: 48 }).notNull(),
    icon: varchar({ length: 32 }),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("global_category_templates_key_uq").on(t.key)],
);
