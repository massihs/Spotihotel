import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, tstz } from "./_helpers";
import { orders } from "./orders";
import { restaurants } from "./restaurant";

/**
 * A network ticket printer (ESC/POS, port 9100) on the restaurant's LAN. The cloud cannot reach
 * it: the local print agent pulls the jobs and forwards them.
 */
export const printers = pgTable(
  "printers",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 60 }).notNull(),
    host: varchar({ length: 120 }).notNull(),
    port: integer().notNull().default(9100),
    /** Paper width in mm: 80 (576 dots) or 58 (384 dots). */
    paperMm: integer().notNull().default(80),
    /** cashier: whole order with prices · station: that station's items · all: whole order, no prices */
    target: varchar({ length: 12 }).notNull().default("station"),
    stationId: uuid(),
    copies: integer().notNull().default(1),
    isActive: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("printers_restaurant_idx").on(t.restaurantId),
    check("printers_copies_chk", sql`${t.copies} between 1 and 5`),
  ],
);

/** One ticket to print. Rendered when the agent picks it up; retried a few times. */
export const printJobs = pgTable(
  "print_jobs",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    printerId: uuid()
      .notNull()
      .references(() => printers.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "cascade" }),
    /** station | cashier | all | test */
    kind: varchar({ length: 12 }).notNull(),
    /** pending | printing | done | failed */
    status: varchar({ length: 12 }).notNull().default("pending"),
    attempts: integer().notNull().default(0),
    leasedUntil: tstz(),
    error: text(),
    printedAt: tstz(),
    ...timestamps,
  },
  (t) => [index("print_jobs_queue_idx").on(t.restaurantId, t.status, t.createdAt)],
);

/**
 * A Spotifood desktop app (Windows / macOS) linked to the restaurant. It keeps a copy of the menu
 * and, when the internet drops, takes orders on the restaurant's network and prints them; the
 * orders come back here once online. The token is shown once; only its hash is kept.
 */
export const offlineDevices = pgTable(
  "offline_devices",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 60 }).notNull(),
    tokenHash: varchar({ length: 64 }).notNull(),
    createdByUserId: uuid(),
    lastSeenAt: tstz(),
    lastSyncAt: tstz(),
    /** Orders received from it, all time. */
    syncedOrders: integer().notNull().default(0),
    appVersion: varchar({ length: 24 }),
    revokedAt: tstz(),
    ...timestamps,
  },
  (t) => [index("offline_devices_restaurant_idx").on(t.restaurantId)],
);
