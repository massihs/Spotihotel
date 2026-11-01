import { index, integer, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { pk, tstz } from "./_helpers";

/**
 * Server errors, grouped: one row per fingerprint (message + route), counted.
 * Written by `onRequestError` (src/instrumentation.ts), read on /admin/errors.
 */
export const appErrors = pgTable(
  "app_errors",
  {
    id: pk(),
    fingerprint: varchar({ length: 64 }).notNull(),
    message: varchar({ length: 500 }).notNull(),
    /** Route pattern ("/[locale]/table") or the path when unknown. */
    route: varchar({ length: 300 }).notNull(),
    method: varchar({ length: 10 }),
    /** 'render' | 'route' | 'action' | 'proxy' */
    kind: varchar({ length: 16 }),
    digest: varchar({ length: 64 }),
    stack: text(),
    count: integer().notNull().default(1),
    firstAt: tstz().notNull().defaultNow(),
    lastAt: tstz().notNull().defaultNow(),
    /** Last SMS sent for this error, to send at most one per hour. */
    alertedAt: tstz(),
    resolvedAt: tstz(),
  },
  (t) => [
    uniqueIndex("app_errors_fingerprint_uq").on(t.fingerprint),
    index("app_errors_last_idx").on(t.lastAt),
  ],
);

/**
 * Self-hosted audience of the public site: one row per page view, no cookie, no third party.
 * `visitor` is a daily salted hash of IP + browser (unique visitors per day, not trackable
 * across days). Rows older than 90 days are pruned.
 */
export const siteHits = pgTable(
  "site_hits",
  {
    id: pk(),
    at: tstz().notNull().defaultNow(),
    path: varchar({ length: 200 }).notNull(),
    referrer: varchar({ length: 120 }),
    visitor: varchar({ length: 32 }).notNull(),
    device: varchar({ length: 8 }).notNull(),
    locale: varchar({ length: 8 }),
  },
  (t) => [index("site_hits_at_idx").on(t.at), index("site_hits_path_idx").on(t.path, t.at)],
);
