import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Nutrition } from "@/lib/nutrition";
import { pk, softDelete, timestamps, tstz } from "./_helpers";

/**
 * People who eat at Spotifood restaurants and keep an account (not restaurant staff: those are
 * `users`). They sign in with their mobile (SMS code) or an e-mail and password, and see what
 * they ate and its nutrition. A phone is stored only once verified by a code.
 */
export const diners = pgTable(
  "diners",
  {
    id: pk(),
    phone: varchar({ length: 20 }),
    phoneVerifiedAt: tstz(),
    email: varchar({ length: 320 }),
    passwordHash: text(),
    name: varchar({ length: 80 }),
    locale: varchar({ length: 8 }),
    timezone: varchar({ length: 64 }).notNull().default("Asia/Tehran"),
    /** Daily goals (null = the reference intakes). */
    goals: jsonb().$type<Nutrition>(),
    /** Asked when the account is created: null = not answered yet. */
    trackCalories: boolean(),
    /** Body profile for the daily needs (all optional). Age is kept as a birth year. */
    sex: varchar({ length: 8 }),
    birthYear: integer(),
    weightKg: real(),
    heightCm: real(),
    activity: varchar({ length: 16 }),
    weightGoal: varchar({ length: 12 }),
    /** Goals typed by the diner instead of the calculated ones. */
    goalsManual: boolean().notNull().default(false),
    /** "Clear my history": orders before this are no longer shown nor claimed again. */
    historySince: tstz(),
    lastLoginAt: tstz(),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("diners_phone_uq")
      .on(t.phone)
      .where(sql`${t.phone} is not null and ${t.deletedAt} is null`),
    uniqueIndex("diners_email_uq")
      .on(t.email)
      .where(sql`${t.email} is not null and ${t.deletedAt} is null`),
  ],
);

export const dinerSessions = pgTable(
  "diner_sessions",
  {
    id: pk(),
    dinerId: uuid()
      .notNull()
      .references(() => diners.id, { onDelete: "cascade" }),
    tokenHash: varchar({ length: 64 }).notNull(),
    expiresAt: tstz().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("diner_sessions_token_uq").on(t.tokenHash),
    index("diner_sessions_diner_idx").on(t.dinerId),
  ],
);

/** One-time SMS codes (hashed). A few tries each, short-lived. */
export const dinerOtps = pgTable(
  "diner_otps",
  {
    id: pk(),
    phone: varchar({ length: 20 }).notNull(),
    codeHash: varchar({ length: 64 }).notNull(),
    attempts: integer().notNull().default(0),
    expiresAt: tstz().notNull(),
    consumedAt: tstz(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("diner_otps_phone_idx").on(t.phone, t.createdAt)],
);
