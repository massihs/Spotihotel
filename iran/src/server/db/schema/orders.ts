import { sql } from "drizzle-orm";
import type { Nutrition } from "@/lib/nutrition";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { pk, timestamps, tstz, money } from "./_helpers";
import { orderChannel, orderPaymentStatus, orderStatus, paymentStatus, refundStatus } from "./enums";
import { products } from "./menu";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { diningTables, sessionParticipants, tableSessions } from "./tables";

/** One active cart per participant. Carts never hold prices: totals are always recomputed server-side. */
export const carts = pgTable(
  "carts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableSessionId: uuid()
      .notNull()
      .references(() => tableSessions.id, { onDelete: "cascade" }),
    participantId: uuid()
      .notNull()
      .references(() => sessionParticipants.id, { onDelete: "cascade" }),
    note: text(),
    ...timestamps,
  },
  (t) => [uniqueIndex("carts_participant_uq").on(t.participantId)],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer().notNull(),
    optionValueIds: uuid()
      .array()
      .notNull()
      .default(sql`ARRAY[]::uuid[]`),
    note: varchar({ length: 280 }),
    ...timestamps,
  },
  (t) => [
    index("cart_items_cart_idx").on(t.cartId),
    check("cart_items_qty_chk", sql`${t.quantity} > 0 AND ${t.quantity} <= 99`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Human number, unique per restaurant: "B-1048". */
    number: varchar({ length: 24 }).notNull(),
    seq: integer().notNull(),
    channel: orderChannel().notNull().default("dine_in"),
    tableId: uuid().references(() => diningTables.id, { onDelete: "set null" }),
    tableSessionId: uuid().references(() => tableSessions.id, { onDelete: "set null" }),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "set null" }),
    /** Snapshot of the table label at order time. */
    tableLabel: varchar({ length: 48 }),
    /** "room" when ordered from a hotel room (room service); null = a table or no place. */
    placeKind: varchar({ length: 8 }),
    status: orderStatus().notNull(),
    paymentStatus: orderPaymentStatus().notNull().default("unpaid"),
    currency: varchar({ length: 3 }).notNull(),
    subtotalCents: money().notNull(),
    discountCents: money().notNull().default(0),
    taxCents: money().notNull(),
    totalCents: money().notNull(),
    pricesIncludeTax: boolean().notNull().default(true),
    note: text(),
    customerEmail: varchar({ length: 320 }),
    /** Mobile number given at checkout (food courts text it when the order is ready). */
    customerPhone: varchar({ length: 20 }),
    readySmsSentAt: tstz(),
    /** Customer file entry (linked from the phone number). */
    customerId: uuid(),
    couponId: uuid(),
    /** Loyalty points spent on this order (part of discountCents). */
    pointsRedeemed: integer().notNull().default(0),
    /** Delivery (channel "delivery"): snapshot address, zone, fee (part of totalCents), courier. */
    deliveryAddress: text(),
    deliveryZoneId: uuid(),
    deliveryFeeCents: money().notNull().default(0),
    courierId: uuid(),
    dispatchedAt: tstz(),
    deliveredAt: tstz(),
    /** The courier handed the collected money to the till. */
    courierSettledAt: tstz(),
    /** Staff member who rang it up at the till (null = ordered by the guest). */
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    placedAt: tstz().notNull().defaultNow(),
    acceptedAt: tstz(),
    preparingAt: tstz(),
    readyAt: tstz(),
    servedAt: tstz(),
    cancelledAt: tstz(),
    cancelReason: text(),
    /** The diner's Spotifood account, when they were signed in or gave their verified mobile. */
    dinerId: uuid(),
    /** Taken on the desktop app while the internet was down: the device's id for it (sync key). */
    offlineRef: uuid(),
    /** Number printed on the offline tickets ("L-12"), kept to match paper and screen. */
    offlineNumber: varchar({ length: 24 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("orders_restaurant_number_uq").on(t.restaurantId, t.number),
    index("orders_diner_placed_idx").on(t.dinerId, t.placedAt),
    uniqueIndex("orders_offline_ref_uq")
      .on(t.restaurantId, t.offlineRef)
      .where(sql`${t.offlineRef} is not null`),
    index("orders_restaurant_placed_idx").on(t.restaurantId, t.placedAt),
    index("orders_restaurant_status_idx").on(t.restaurantId, t.status),
    index("orders_session_idx").on(t.tableSessionId),
    index("orders_participant_idx").on(t.participantId),
    check(
      "orders_amounts_chk",
      sql`${t.subtotalCents} >= 0 AND ${t.discountCents} >= 0 AND ${t.taxCents} >= 0 AND ${t.totalCents} >= 0`,
    ),
  ],
);

export type OrderItemOptionSnapshot = {
  groupId: string;
  groupName: string;
  valueId: string;
  valueName: string;
  priceDeltaCents: number;
};

/** Immutable snapshot of what was ordered, at the price of the moment. */
export const orderItems = pgTable(
  "order_items",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    /** Kept for analytics/stock even though the product may later change or be deleted. */
    productId: uuid().references(() => products.id, { onDelete: "set null" }),
    categoryId: uuid(),
    productName: varchar({ length: 120 }).notNull(),
    categoryName: varchar({ length: 80 }),
    /** Nutrition of one portion as served, fixed when ordered (the diner's history keeps it). */
    nutrition: jsonb().$type<Nutrition>(),
    /** Station the line was sent to, fixed when ordered (dish's station, else its category's). */
    stationId: uuid(),
    unitPriceCents: money().notNull(),
    optionsTotalCents: money().notNull().default(0),
    quantity: integer().notNull(),
    lineTotalCents: money().notNull(),
    taxRateBps: integer().notNull().default(0),
    taxCents: money().notNull().default(0),
    options: jsonb().$type<OrderItemOptionSnapshot[]>().notNull().default([]),
    note: varchar({ length: 280 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_restaurant_product_idx").on(t.restaurantId, t.productId),
    check("order_items_qty_chk", sql`${t.quantity} > 0`),
  ],
);

export const orderStatusEvents = pgTable(
  "order_status_events",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("order_status_events_order_idx").on(t.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tableSessionId: uuid().references(() => tableSessions.id, { onDelete: "set null" }),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "set null" }),
    /** cash | on_site_terminal | pay_later | stripe | mock_online ... */
    provider: varchar({ length: 32 }).notNull(),
    providerRef: varchar({ length: 191 }),
    status: paymentStatus().notNull().default("pending"),
    amountCents: money().notNull(),
    refundedCents: money().notNull().default(0),
    currency: varchar({ length: 3 }).notNull(),
    idempotencyKey: varchar({ length: 64 }).notNull(),
    failureReason: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    recordedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    succeededAt: tstz(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_idempotency_uq").on(t.restaurantId, t.idempotencyKey),
    uniqueIndex("payments_provider_ref_uq")
      .on(t.provider, t.providerRef)
      .where(sql`${t.providerRef} IS NOT NULL`),
    index("payments_restaurant_created_idx").on(t.restaurantId, t.createdAt),
    index("payments_session_idx").on(t.tableSessionId),
    check(
      "payments_amounts_chk",
      sql`${t.amountCents} > 0 AND ${t.refundedCents} >= 0 AND ${t.refundedCents} <= ${t.amountCents}`,
    ),
  ],
);

/** A payment can cover several orders (and later, part of someone else's bill). */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    amountCents: money().notNull(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("payment_allocations_payment_order_uq").on(t.paymentId, t.orderId),
    index("payment_allocations_order_idx").on(t.orderId),
    check("payment_allocations_amount_chk", sql`${t.amountCents} > 0`),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    amountCents: money().notNull(),
    status: refundStatus().notNull().default("pending"),
    reason: text(),
    providerRef: varchar({ length: 191 }),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("refunds_restaurant_created_idx").on(t.restaurantId, t.createdAt),
    check("refunds_amount_chk", sql`${t.amountCents} > 0`),
  ],
);

/**
 * Everything printed on an invoice, frozen at issue time: later changes to the menu, the
 * restaurant's legal details or the orders never alter an issued invoice.
 * Field set follows Iranian sales invoices (صورتحساب فروش کالا و خدمات), so it can later be
 * submitted to the tax system (سامانه مودیان) without missing data.
 */
export type InvoiceParty = {
  name: string;
  /** شناسه ملی (legal entity) or کد ملی (individual). */
  nationalId?: string | null;
  /** کد اقتصادی */
  economicCode?: string | null;
  /** شماره ثبت */
  registrationNumber?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

export type InvoiceSnapshot = {
  version: 2;
  seller: InvoiceParty & { tradeName: string };
  buyer: InvoiceParty | null;
  tableLabel: string | null;
  orders: { number: string; placedAt: string }[];
  lines: {
    name: string;
    options: string[];
    quantity: number;
    /** Unit price including options. */
    unitPriceCents: number;
    lineTotalCents: number;
    taxRateBps: number;
  }[];
  pricesIncludeTax: boolean;
  taxes: { rateBps: number; baseCents: number; taxCents: number }[];
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  payments: { provider: string; amountCents: number; at: string; reference: string | null }[];
  notes: string | null;
};

/** Immutable once issued. Numbered gap-free per restaurant. */
export const invoices = pgTable(
  "invoices",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: varchar({ length: 32 }).notNull(),
    seq: integer().notNull(),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "set null" }),
    tableSessionId: uuid().references(() => tableSessions.id, { onDelete: "set null" }),
    paymentId: uuid().references(() => payments.id, { onDelete: "set null" }),
    currency: varchar({ length: 3 }).notNull(),
    totalCents: money().notNull(),
    taxCents: money().notNull(),
    snapshot: jsonb().$type<InvoiceSnapshot>().notNull(),
    pdfStorageKey: text(),
    /** Token for the customer-facing link (/invoices/{publicToken}). */
    publicToken: varchar({ length: 32 }).notNull(),
    emailedTo: varchar({ length: 320 }),
    emailedAt: tstz(),
    issuedAt: tstz().notNull().defaultNow(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex("invoices_restaurant_number_uq").on(t.restaurantId, t.number),
    uniqueIndex("invoices_public_token_uq").on(t.publicToken),
    // One invoice per payment: issuing twice (double tap, guest + staff) returns the same one.
    uniqueIndex("invoices_payment_uq")
      .on(t.paymentId)
      .where(sql`${t.paymentId} IS NOT NULL`),
    index("invoices_restaurant_issued_idx").on(t.restaurantId, t.issuedAt),
  ],
);

export const invoiceOrders = pgTable(
  "invoice_orders",
  {
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("invoice_orders_uq").on(t.invoiceId, t.orderId),
    index("invoice_orders_order_idx").on(t.orderId),
  ],
);
