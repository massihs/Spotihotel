import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps, tstz } from "./_helpers";
import { tableSessionStatus } from "./enums";
import { restaurants } from "./restaurant";
import { users } from "./platform";

export const diningTables = pgTable(
  "dining_tables",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Display label: "12", "Terrasse 3"... */
    label: varchar({ length: 48 }).notNull(),
    number: integer(),
    capacity: integer(),
    zone: varchar({ length: 64 }),
    /** Opaque, regenerable token encoded in the QR code (/t/{qrToken}). */
    qrToken: varchar({ length: 32 }).notNull(),
    qrEnabled: boolean().notNull().default(true),
    qrRegeneratedAt: tstz(),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("dining_tables_qr_token_uq").on(t.qrToken),
    index("dining_tables_restaurant_idx").on(t.restaurantId, t.sortOrder),
    uniqueIndex("dining_tables_restaurant_label_uq")
      .on(t.restaurantId, sql`lower(${t.label})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/** One "visit" of a group at a table. Participants, carts, orders and payments hang off it. */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableId: uuid()
      .notNull()
      .references(() => diningTables.id, { onDelete: "cascade" }),
    status: tableSessionStatus().notNull().default("open"),
    openedAt: tstz().notNull().defaultNow(),
    lastActivityAt: tstz().notNull().defaultNow(),
    closedAt: tstz(),
    closedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** 'staff' | 'auto' | 'system' */
    closedReason: varchar({ length: 16 }),
    ...timestamps,
  },
  (t) => [
    // Exactly one open session per table — enforced by the database, not by app logic.
    uniqueIndex("table_sessions_one_open_per_table_uq")
      .on(t.tableId)
      .where(sql`${t.status} = 'open'`),
    index("table_sessions_restaurant_status_idx").on(t.restaurantId, t.status),
    index("table_sessions_restaurant_opened_idx").on(t.restaurantId, t.openedAt),
  ],
);

/** Anonymous device identity (value of the signed guest cookie). Not tenant-scoped on purpose. */
export const guests = pgTable("guests", {
  id: pk(),
  email: varchar({ length: 320 }),
  locale: varchar({ length: 8 }),
  ...timestamps,
});

export const sessionParticipants = pgTable(
  "session_participants",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableSessionId: uuid()
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    guestId: uuid()
      .notNull()
      .references(() => guests.id, { onDelete: "cascade" }),
    /** 1, 2, 3... → "Client 1" */
    seq: integer().notNull(),
    displayName: varchar({ length: 48 }),
    joinedAt: tstz().notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("session_participants_session_guest_uq").on(t.tableSessionId, t.guestId),
    uniqueIndex("session_participants_session_seq_uq").on(t.tableSessionId, t.seq),
    index("session_participants_guest_idx").on(t.guestId),
  ],
);
