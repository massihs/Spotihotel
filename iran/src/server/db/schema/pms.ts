import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
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
import { money, pk, softDelete, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { diningTables } from "./tables";

/**
 * Hotel property management (PMS): room types and rates, guest profiles, company accounts (city
 * ledger), stays with their nights, folios (the guest's bill) and their postings, wellness
 * services (spa, sauna, pool, massage…) with their bookings, and the minibar.
 *
 * Dates of stay are calendar days (`date`, the hotel's local day): a night is the day it starts.
 * Amounts are integers in minor units, like everywhere else.
 */

/** Hotel-wide settings, one row per hotel (created on first use). */
export const pmsSettings = pgTable("pms_settings", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  checkInTime: varchar({ length: 5 }).notNull().default("14:00"),
  checkOutTime: varchar({ length: 5 }).notNull().default("12:00"),
  /** The hotel's accounting day. Moves forward one day at each night audit. */
  businessDate: date({ mode: "string" }),
  /** VAT included in room and service prices (basis points). */
  roomTaxBps: integer().notNull().default(0),
  serviceTaxBps: integer().notNull().default(0),
  /** City / tourist tax per adult and night (0 = none). */
  cityTaxCents: money().notNull().default(0),
  /** Room service ordered from an occupied room goes straight onto the room's bill. */
  autoChargeRoomService: boolean().notNull().default(true),
  /** Guests may declare what they took from the minibar on their phone. */
  minibarSelfService: boolean().notNull().default(true),
  /** Guest portal (room QR): Wi-Fi and practical information. */
  wifiName: varchar({ length: 64 }),
  wifiPassword: varchar({ length: 64 }),
  guestInfo: text(),
  /** Commission of each booking channel (basis points): { snapptrip: 1500, alibaba: 1200 }. */
  channelCommissions: jsonb().$type<Record<string, number>>().notNull().default({}),
  /** Charge the first night to guaranteed bookings that never arrive (night audit). */
  chargeNoShows: boolean().notNull().default(true),
  nextBlockNumber: integer().notNull().default(1),
  nextStayNumber: integer().notNull().default(1001),
  nextFolioNumber: integer().notNull().default(1),
  ...timestamps,
});

export const roomTypes = pgTable(
  "room_types",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Short code shown on the planning: "DBL", "STE"… */
    code: varchar({ length: 12 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    description: text(),
    baseOccupancy: integer().notNull().default(2),
    maxOccupancy: integer().notNull().default(2),
    /** Best available rate per night for the base occupancy. */
    baseRateCents: money().notNull(),
    /** Per extra adult above the base occupancy, per night. */
    extraAdultCents: money().notNull().default(0),
    amenities: jsonb().$type<string[]>().notNull().default([]),
    /** Rooms that may be sold beyond the physical inventory (controlled overbooking). */
    overbookLimit: integer().notNull().default(0),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("room_types_code_uq")
      .on(t.restaurantId, sql`lower(${t.code})`)
      .where(sql`${t.deletedAt} IS NULL`),
    check("room_types_occupancy_chk", sql`${t.baseOccupancy} between 1 and ${t.maxOccupancy}`),
    check("room_types_rate_chk", sql`${t.baseRateCents} >= 0 and ${t.extraAdultCents} >= 0`),
  ],
);

/** How a room is sold: room only, breakfast, half board… with a price adjustment on the base rate. */
export const ratePlans = pgTable(
  "rate_plans",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: varchar({ length: 12 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    /** RO room only | BB breakfast | HB half board | FB full board | AI all inclusive */
    mealPlan: varchar({ length: 2 }).notNull().default("RO"),
    /** Percentage on the base rate (basis points, may be negative: -1000 = 10% off). */
    adjustBps: integer().notNull().default(0),
    /** Fixed amount per night added after the percentage (meals per person are in here). */
    adjustCents: money().notNull().default(0),
    refundable: boolean().notNull().default(true),
    /** Free cancellation until this many hours before arrival. */
    cancelHours: integer().notNull().default(24),
    minStay: integer().notNull().default(1),
    isDefault: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    /** Sold to guests on the hotel's own booking page (off for corporate or negotiated rates). */
    bookableOnline: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    uniqueIndex("rate_plans_code_uq")
      .on(t.restaurantId, sql`lower(${t.code})`)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);

/** Yield calendar: a room type's price, closure and minimum stay for one day. */
export const rateDays = pgTable(
  "rate_days",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    roomTypeId: uuid()
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    /** Overrides the base rate that day (null = base rate). */
    rateCents: money(),
    /** Stop sell: no new arrival can stay that night. */
    closed: boolean().notNull().default(false),
    minStay: integer(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.roomTypeId, t.day] }),
    index("rate_days_restaurant_day_idx").on(t.restaurantId, t.day),
  ],
);

/** Guest profile (fiche client / registration card). */
export const hotelGuests = pgTable(
  "hotel_guests",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    firstName: varchar({ length: 80 }).notNull().default(""),
    lastName: varchar({ length: 80 }).notNull(),
    /** نام پدر — asked on Iranian registration cards and by the police (Amaken) report. */
    fatherName: varchar({ length: 80 }),
    email: varchar({ length: 320 }),
    phone: varchar({ length: 24 }),
    /** ISO 3166 alpha-2. */
    nationality: varchar({ length: 2 }),
    /** passport | id_card | driving_licence */
    documentType: varchar({ length: 16 }),
    documentNumber: varchar({ length: 40 }),
    birthDate: date({ mode: "string" }),
    address: text(),
    company: varchar({ length: 120 }),
    vip: boolean().notNull().default(false),
    /** Pillow, floor, allergies… shown at every stay. */
    preferences: text(),
    notes: text(),
    /** Refused at the desk (unpaid bill, damage…). */
    blacklisted: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("hotel_guests_name_idx").on(t.restaurantId, sql`lower(${t.lastName})`),
    index("hotel_guests_phone_idx").on(t.restaurantId, t.phone),
  ],
);

/** Companies, travel agencies and booking channels billed later (the city ledger). */
export const hotelAccounts = pgTable(
  "hotel_accounts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** company | agency | ota */
    kind: varchar({ length: 8 }).notNull().default("company"),
    name: varchar({ length: 160 }).notNull(),
    taxId: varchar({ length: 40 }),
    email: varchar({ length: 320 }),
    phone: varchar({ length: 24 }),
    address: text(),
    creditLimitCents: money().notNull().default(0),
    paymentTermsDays: integer().notNull().default(30),
    /** Agency / OTA commission (basis points). */
    commissionBps: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index("hotel_accounts_restaurant_idx").on(t.restaurantId, t.name)],
);

/** A booking of a room for some nights (réservation d'hébergement), from enquiry to departure. */
export const stays = pgTable(
  "stays",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    /** Opaque code of the guest's own link (online check-in, booking status). */
    code: varchar({ length: 16 }).notNull(),
    /** tentative | confirmed | in_house | checked_out | cancelled | no_show */
    status: varchar({ length: 12 }).notNull().default("confirmed"),
    roomTypeId: uuid()
      .notNull()
      .references(() => roomTypes.id, { onDelete: "restrict" }),
    /** Assigned room (may be decided at check-in). */
    roomId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    ratePlanId: uuid().references(() => ratePlans.id, { onDelete: "set null" }),
    arrival: date({ mode: "string" }).notNull(),
    departure: date({ mode: "string" }).notNull(),
    adults: integer().notNull().default(1),
    children: integer().notNull().default(0),
    guestId: uuid()
      .notNull()
      .references(() => hotelGuests.id, { onDelete: "restrict" }),
    /** Company / agency that pays (its folio goes to the city ledger). */
    accountId: uuid().references(() => hotelAccounts.id, { onDelete: "set null" }),
    /** direct | phone | walk_in | website | email | agency | booking | expedia | airbnb | other */
    source: varchar({ length: 16 }).notNull().default("direct"),
    /** The channel's own booking reference. */
    channelRef: varchar({ length: 64 }),
    /** Group block (allotment) the room was picked up from. */
    blockId: uuid(),
    /** Online pre-check-in: when the guest filled their registration card, and their signature. */
    precheckinAt: tstz(),
    precheckinSignature: varchar({ length: 120 }),
    /** Expected time of arrival "HH:MM". */
    eta: varchar({ length: 5 }),
    /** none | card | deposit | company */
    guarantee: varchar({ length: 8 }).notNull().default("none"),
    /** Sum of the nights' rates when booked (snapshot, shown on the confirmation). */
    totalCents: money().notNull().default(0),
    notes: text(),
    checkedInAt: tstz(),
    checkedOutAt: tstz(),
    cancelledAt: tstz(),
    cancelReason: varchar({ length: 200 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("stays_number_uq").on(t.restaurantId, t.number),
    uniqueIndex("stays_code_uq").on(t.code),
    index("stays_restaurant_dates_idx").on(t.restaurantId, t.arrival, t.departure),
    index("stays_room_idx").on(t.roomId, t.arrival),
    index("stays_guest_idx").on(t.guestId),
    check("stays_dates_chk", sql`${t.departure} > ${t.arrival}`),
    check("stays_people_chk", sql`${t.adults} between 1 and 20 and ${t.children} between 0 and 20`),
  ],
);

/** Each night of a stay with its rate. The night audit posts it to the folio. */
export const stayNights = pgTable(
  "stay_nights",
  {
    stayId: uuid()
      .notNull()
      .references(() => stays.id, { onDelete: "cascade" }),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    rateCents: money().notNull(),
    postedAt: tstz(),
  },
  (t) => [
    primaryKey({ columns: [t.stayId, t.day] }),
    index("stay_nights_restaurant_day_idx").on(t.restaurantId, t.day),
  ],
);

/** A bill: the guest's (one per stay at least), a company's, or a passer-by's (no stay). */
export const folios = pgTable(
  "folios",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    stayId: uuid().references(() => stays.id, { onDelete: "set null" }),
    /** Billed to a company account (city ledger) instead of the guest. */
    accountId: uuid().references(() => hotelAccounts.id, { onDelete: "set null" }),
    guestId: uuid().references(() => hotelGuests.id, { onDelete: "set null" }),
    label: varchar({ length: 80 }),
    /** open | closed */
    status: varchar({ length: 8 }).notNull().default("open"),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("folios_number_uq").on(t.restaurantId, t.number),
    index("folios_stay_idx").on(t.stayId),
    index("folios_account_idx").on(t.accountId),
  ],
);

/**
 * One posting on a folio. Charges are positive, payments and credits negative: a folio's balance
 * is the sum of its live (not voided) lines. Lines are never deleted: a mistake is voided (with a
 * reason, audited) or corrected by an adjustment.
 */
export const folioLines = pgTable(
  "folio_lines",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    folioId: uuid()
      .notNull()
      .references(() => folios.id, { onDelete: "cascade" }),
    /** Hotel business day of the posting (night audit date). */
    businessDate: date({ mode: "string" }).notNull(),
    /** charge | payment | adjustment | transfer */
    kind: varchar({ length: 12 }).notNull(),
    /**
     * Revenue department (charges): room | fnb | room_service | minibar | spa | laundry | phone |
     * parking | transport | city_tax | misc. Payments: payment.
     */
    department: varchar({ length: 16 }).notNull(),
    description: varchar({ length: 200 }).notNull(),
    quantity: integer().notNull().default(1),
    unitCents: money().notNull(),
    /** Signed: + charge, − payment / credit. */
    amountCents: money().notNull(),
    /** VAT included in a charge. */
    taxRateBps: integer().notNull().default(0),
    taxCents: money().notNull().default(0),
    /** Payments: cash | card | transfer | online | city_ledger | deposit */
    method: varchar({ length: 16 }),
    reference: varchar({ length: 64 }),
    /** Where it came from: order | night_audit | service_booking | minibar | transfer | manual */
    sourceType: varchar({ length: 16 }).notNull().default("manual"),
    sourceId: uuid(),
    voidedAt: tstz(),
    voidReason: varchar({ length: 200 }),
    voidedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    postedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("folio_lines_folio_idx").on(t.folioId, t.createdAt),
    index("folio_lines_restaurant_date_idx").on(t.restaurantId, t.businessDate),
    // The same source is never posted twice (an order charged to the room, a night…).
    uniqueIndex("folio_lines_source_uq")
      .on(t.restaurantId, t.sourceType, t.sourceId)
      .where(sql`${t.sourceId} IS NOT NULL AND ${t.voidedAt} IS NULL AND ${t.kind} = 'charge'`),
    check("folio_lines_qty_chk", sql`${t.quantity} between 1 and 999`),
  ],
);

/** Wellness and leisure services bookable by time slot: spa, sauna, pool, massage, hammam… */
export const hotelServices = pgTable(
  "hotel_services",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** spa | sauna | pool | massage | hammam | gym | beauty | tennis | other */
    kind: varchar({ length: 12 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    description: text(),
    durationMin: integer().notNull().default(60),
    /** Price per person per session (0 = free for guests). */
    priceCents: money().notNull().default(0),
    /** People (or therapists' tables) at the same time. */
    capacity: integer().notNull().default(1),
    opensAt: varchar({ length: 5 }).notNull().default("08:00"),
    closesAt: varchar({ length: 5 }).notNull().default("21:00"),
    /** Minutes between two slot starts. */
    slotStepMin: integer().notNull().default(30),
    guestBookable: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [
    index("hotel_services_restaurant_idx").on(t.restaurantId, t.sortOrder),
    check("hotel_services_chk", sql`${t.capacity} between 1 and 500 and ${t.durationMin} between 5 and 600`),
  ],
);

export const serviceBookings = pgTable(
  "service_bookings",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    serviceId: uuid()
      .notNull()
      .references(() => hotelServices.id, { onDelete: "restrict" }),
    stayId: uuid().references(() => stays.id, { onDelete: "set null" }),
    roomLabel: varchar({ length: 48 }),
    guestName: varchar({ length: 120 }).notNull(),
    phone: varchar({ length: 24 }),
    startsAt: tstz().notNull(),
    endsAt: tstz().notNull(),
    people: integer().notNull().default(1),
    priceCents: money().notNull().default(0),
    /** booked | done | cancelled | no_show */
    status: varchar({ length: 10 }).notNull().default("booked"),
    /** staff | guest */
    source: varchar({ length: 8 }).notNull().default("staff"),
    /** Therapist / attendant. */
    staffName: varchar({ length: 80 }),
    note: varchar({ length: 300 }),
    /** Charged to the room's folio. */
    folioLineId: uuid().references(() => folioLines.id, { onDelete: "set null" }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("service_bookings_service_time_idx").on(t.serviceId, t.startsAt),
    index("service_bookings_restaurant_time_idx").on(t.restaurantId, t.startsAt),
    index("service_bookings_stay_idx").on(t.stayId),
    check("service_bookings_people_chk", sql`${t.people} between 1 and 50`),
    check("service_bookings_time_chk", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const minibarItems = pgTable(
  "minibar_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    priceCents: money().notNull(),
    /** Quantity a full minibar holds (housekeeping restocks to it). */
    parQty: integer().notNull().default(1),
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("minibar_items_restaurant_idx").on(t.restaurantId, t.sortOrder)],
);

/** One closed hotel day: what the night audit posted and the day's key figures. */
export const nightAudits = pgTable(
  "night_audits",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    businessDate: date({ mode: "string" }).notNull(),
    roomsAvailable: integer().notNull(),
    roomsSold: integer().notNull(),
    guests: integer().notNull(),
    roomRevenueCents: money().notNull(),
    totalRevenueCents: money().notNull(),
    paymentsCents: money().notNull(),
    noShows: integer().notNull().default(0),
    /** Revenue per department for the day. */
    revenue: jsonb().$type<Record<string, number>>().notNull().default({}),
    closedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [uniqueIndex("night_audits_day_uq").on(t.restaurantId, t.businessDate)],
);

/**
 * A group block (allotment): rooms of some types held for an event, a tour or a company over
 * dates, picked up as named bookings until the release date, after which the rooms left go back
 * to general sale.
 */
export const roomBlocks = pgTable(
  "room_blocks",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    name: varchar({ length: 160 }).notNull(),
    accountId: uuid().references(() => hotelAccounts.id, { onDelete: "set null" }),
    contactName: varchar({ length: 120 }),
    contactPhone: varchar({ length: 24 }),
    /** tentative | definite | released | cancelled */
    status: varchar({ length: 10 }).notNull().default("definite"),
    arrival: date({ mode: "string" }).notNull(),
    departure: date({ mode: "string" }).notNull(),
    /** Rooms not picked up by this day return to general sale (night audit). */
    releaseDate: date({ mode: "string" }).notNull(),
    ratePlanId: uuid().references(() => ratePlans.id, { onDelete: "set null" }),
    /** Group rate per room and night (null = the rate plan's price). */
    rateCents: money(),
    notes: text(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("room_blocks_number_uq").on(t.restaurantId, t.number),
    index("room_blocks_dates_idx").on(t.restaurantId, t.arrival, t.departure),
    check("room_blocks_dates_chk", sql`${t.departure} > ${t.arrival} and ${t.releaseDate} <= ${t.arrival}`),
  ],
);

/** Rooms held by a block, per room type and night. */
export const roomBlockDays = pgTable(
  "room_block_days",
  {
    blockId: uuid()
      .notNull()
      .references(() => roomBlocks.id, { onDelete: "cascade" }),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    roomTypeId: uuid()
      .notNull()
      .references(() => roomTypes.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    rooms: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockId, t.roomTypeId, t.day] }),
    index("room_block_days_type_day_idx").on(t.restaurantId, t.roomTypeId, t.day),
    check("room_block_days_rooms_chk", sql`${t.rooms} between 0 and 1000`),
  ],
);

/**
 * Revenue management: the price of a room type rises (or falls) by a percentage when its
 * occupancy for the night reaches a level, optionally only close to arrival (last minute).
 */
export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** null = every room type. */
    roomTypeId: uuid().references(() => roomTypes.id, { onDelete: "cascade" }),
    /** Occupancy of the night (on the books) from which the rule applies, 0–100. */
    minOccupancyPct: integer().notNull().default(0),
    /** Only for arrivals within this many days (null = any lead time). */
    withinDays: integer(),
    adjustBps: integer().notNull(),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("pricing_rules_restaurant_idx").on(t.restaurantId),
    check(
      "pricing_rules_chk",
      sql`${t.minOccupancyPct} between 0 and 100 and ${t.adjustBps} between -9000 and 50000`,
    ),
  ],
);

/**
 * Cheques (چک): received from guests and companies, or issued to suppliers, with their Sayad
 * id (شناسه صیادی) and due date; each status change is an event that the books journal.
 */
export const cheques = pgTable(
  "cheques",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** received | issued */
    direction: varchar({ length: 8 }).notNull(),
    sayadId: varchar({ length: 16 }),
    number: varchar({ length: 32 }),
    bank: varchar({ length: 80 }),
    /** Drawer (received) or payee (issued). */
    party: varchar({ length: 160 }).notNull(),
    amountCents: money().notNull(),
    dueDate: date({ mode: "string" }).notNull(),
    /** received: in_hand | deposited | cleared | bounced | returned | issued: issued | cleared | bounced | cancelled */
    status: varchar({ length: 10 }).notNull(),
    /** The folio payment it settled (received at the desk). */
    folioLineId: uuid().references(() => folioLines.id, { onDelete: "set null" }),
    supplierId: uuid(),
    note: varchar({ length: 300 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("cheques_due_idx").on(t.restaurantId, t.direction, t.dueDate),
    uniqueIndex("cheques_sayad_uq")
      .on(t.restaurantId, t.direction, t.sayadId)
      .where(sql`${t.sayadId} IS NOT NULL`),
    check("cheques_amount_chk", sql`${t.amountCents} > 0`),
  ],
);

export const chequeEvents = pgTable(
  "cheque_events",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    chequeId: uuid()
      .notNull()
      .references(() => cheques.id, { onDelete: "cascade" }),
    status: varchar({ length: 10 }).notNull(),
    day: date({ mode: "string" }).notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("cheque_events_cheque_idx").on(t.chequeId)],
);

/** Money paid to a supplier (settles the accounts payable left by stock purchases). */
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    supplierId: uuid().notNull(),
    amountCents: money().notNull(),
    /** cash | transfer | cheque */
    method: varchar({ length: 10 }).notNull(),
    chequeId: uuid().references(() => cheques.id, { onDelete: "set null" }),
    paidOn: date({ mode: "string" }).notNull(),
    reference: varchar({ length: 64 }),
    note: varchar({ length: 300 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("supplier_payments_idx").on(t.restaurantId, t.supplierId, t.paidOn),
    check("supplier_payments_amount_chk", sql`${t.amountCents} > 0`),
  ],
);
