import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { customers } from "./customers";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { diningTables } from "./tables";

/**
 * A table booking (رزرو) or a walk-in queue ticket (نوبت). Bookings have a time; queue
 * tickets have a number and are seated in order.
 */
export const reservations = pgTable(
  "reservations",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** booking | queue */
    kind: varchar({ length: 8 }).notNull().default("booking"),
    /** Public status link token. */
    code: varchar({ length: 16 }).notNull(),
    /** Queue ticket number of the day. */
    queueNumber: integer(),
    name: varchar({ length: 120 }).notNull(),
    phone: varchar({ length: 20 }).notNull(),
    partySize: integer().notNull(),
    startsAt: tstz().notNull(),
    durationMin: integer().notNull().default(90),
    /** indoor | outdoor | any */
    area: varchar({ length: 16 }).notNull().default("any"),
    tableId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    /** pending | confirmed | notified | seated | completed | cancelled | no_show */
    status: varchar({ length: 12 }).notNull().default("confirmed"),
    /** online | phone | walk_in */
    source: varchar({ length: 12 }).notNull().default("phone"),
    note: text(),
    /** birthday | anniversary | date | business | family (shown to the host). */
    occasion: varchar({ length: 16 }),
    customerId: uuid().references(() => customers.id, { onDelete: "set null" }),
    reminderSentAt: tstz(),
    notifiedAt: tstz(),
    seatedAt: tstz(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("reservations_code_uq").on(t.code),
    index("reservations_restaurant_time_idx").on(t.restaurantId, t.startsAt),
    check("reservations_party_chk", sql`${t.partySize} between 1 and 200`),
  ],
);
