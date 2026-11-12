import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { money, pk, softDelete, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { stays } from "./pms";
import { restaurants } from "./restaurant";
import { diningTables } from "./tables";

/**
 * The hotel's service departments beyond the front desk: laundry and damages (a price list, tickets
 * registered for a room or a walk-in, settled on the room's bill or at the department's cash desk),
 * guest internet (profiles and accounts), in-room TV (each room's state and its activity log),
 * engineering (equipment and preventive maintenance) and the housekeeping logbook.
 */

/** A department's price list ("اطلاعات پایه"): what laundry washes, what a damage costs. */
export const serviceItems = pgTable(
  "service_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** laundry | damage */
    kind: varchar({ length: 16 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    /** Laundry: wash, iron, dry clean… Damage: linen, furniture… */
    category: varchar({ length: 40 }),
    priceCents: money().notNull(),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("service_items_restaurant_kind_idx").on(t.restaurantId, t.kind, t.sortOrder)],
);

/** One laundry bag or one damage report, for a room (its stay) or a walk-in guest. */
export const serviceTickets = pgTable(
  "service_tickets",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    kind: varchar({ length: 16 }).notNull(),
    number: integer().notNull(),
    stayId: uuid().references(() => stays.id, { onDelete: "set null" }),
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    guestName: varchar({ length: 120 }),
    /** received → in_progress → ready → delivered (laundry); open (damage); cancelled. */
    status: varchar({ length: 16 }).notNull(),
    express: boolean().notNull().default(false),
    note: text(),
    totalCents: money().notNull(),
    /** pending | room (posted on the stay's bill) | cash | card | pos | waived */
    settlement: varchar({ length: 12 }).notNull().default("pending"),
    settledAt: tstz(),
    settledByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    businessDate: date({ mode: "string" }).notNull(),
    dueAt: tstz(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("service_tickets_number_uq").on(t.restaurantId, t.kind, t.number),
    index("service_tickets_day_idx").on(t.restaurantId, t.kind, t.businessDate),
    index("service_tickets_stay_idx").on(t.stayId),
  ],
);

export const serviceTicketLines = pgTable(
  "service_ticket_lines",
  {
    id: pk(),
    ticketId: uuid()
      .notNull()
      .references(() => serviceTickets.id, { onDelete: "cascade" }),
    itemId: uuid().references(() => serviceItems.id, { onDelete: "set null" }),
    name: varchar({ length: 80 }).notNull(),
    quantity: integer().notNull(),
    unitCents: money().notNull(),
    amountCents: money().notNull(),
  },
  (t) => [
    index("service_ticket_lines_ticket_idx").on(t.ticketId),
    check("service_ticket_lines_qty_chk", sql`${t.quantity} between 1 and 999`),
  ],
);

/** An internet plan: speed, data allowance, length, devices, price. */
export const internetProfiles = pgTable(
  "internet_profiles",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 60 }).notNull(),
    downKbps: integer().notNull().default(0),
    upKbps: integer().notNull().default(0),
    /** Data allowance in MB (null = unlimited). */
    quotaMb: integer(),
    /** Validity in days (null = until check-out). */
    days: integer(),
    devices: integer().notNull().default(2),
    priceCents: money().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("internet_profiles_restaurant_idx").on(t.restaurantId)],
);

/** A guest's internet login (hotspot user). */
export const internetAccounts = pgTable(
  "internet_accounts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    username: varchar({ length: 40 }).notNull(),
    password: varchar({ length: 40 }).notNull(),
    profileId: uuid().references(() => internetProfiles.id, { onDelete: "set null" }),
    stayId: uuid().references(() => stays.id, { onDelete: "set null" }),
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    guestName: varchar({ length: 120 }),
    /** active | disabled | expired */
    status: varchar({ length: 12 }).notNull().default("active"),
    validUntil: tstz(),
    usedMb: integer().notNull().default(0),
    note: varchar({ length: 200 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("internet_accounts_username_uq").on(t.restaurantId, t.username),
    index("internet_accounts_stay_idx").on(t.stayId),
  ],
);

/** The TV of each room: on or off, its channel package, the message on screen. */
export const tvRooms = pgTable("tv_rooms", {
  roomId: uuid()
    .primaryKey()
    .references(() => diningTables.id, { onDelete: "cascade" }),
  restaurantId: uuid()
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  active: boolean().notNull().default(false),
  package: varchar({ length: 60 }),
  message: varchar({ length: 300 }),
  since: tstz(),
  ...timestamps,
});

/** What happened to the rooms' TVs ("گزارش فعالیت"). */
export const tvEvents = pgTable(
  "tv_events",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    stayId: uuid().references(() => stays.id, { onDelete: "set null" }),
    /** activated | deactivated | package | message */
    event: varchar({ length: 16 }).notNull(),
    detail: varchar({ length: 300 }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("tv_events_restaurant_time_idx").on(t.restaurantId, t.createdAt)],
);

/** Engineering: the hotel's equipment and when each is next serviced. */
export const equipment = pgTable(
  "equipment",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    category: varchar({ length: 40 }),
    location: varchar({ length: 80 }),
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    serial: varchar({ length: 60 }),
    /** Preventive maintenance every N days (null = none). */
    intervalDays: integer(),
    lastServiceOn: date({ mode: "string" }),
    nextServiceOn: date({ mode: "string" }),
    note: text(),
    active: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("equipment_restaurant_next_idx").on(t.restaurantId, t.nextServiceOn)],
);

/** Housekeeping logbook ("دفتر گزارش"): notes, lost and found, incidents, per business day. */
export const hkLogbook = pgTable(
  "hk_logbook",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    businessDate: date({ mode: "string" }).notNull(),
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    /** note | lost_found | incident | request */
    category: varchar({ length: 16 }).notNull(),
    text: text().notNull(),
    /** open | closed */
    status: varchar({ length: 8 }).notNull().default("open"),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [index("hk_logbook_restaurant_day_idx").on(t.restaurantId, t.businessDate)],
);
