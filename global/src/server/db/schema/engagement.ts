import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { complaintCategory, complaintStatus, emailStatus } from "./enums";
import { orders } from "./orders";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { sessionParticipants, tableSessions } from "./tables";

export const reviews = pgTable(
  "reviews",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    tableSessionId: uuid().references(() => tableSessions.id, { onDelete: "set null" }),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "set null" }),
    rating: integer().notNull(),
    comment: text(),
    isPublished: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("reviews_restaurant_created_idx").on(t.restaurantId, t.createdAt),
    check("reviews_rating_chk", sql`${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const complaints = pgTable(
  "complaints",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid().references(() => orders.id, { onDelete: "set null" }),
    tableSessionId: uuid().references(() => tableSessions.id, { onDelete: "set null" }),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "set null" }),
    category: complaintCategory().notNull(),
    subject: varchar({ length: 160 }).notNull(),
    message: text().notNull(),
    rating: integer(),
    contactEmail: varchar({ length: 320 }),
    status: complaintStatus().notNull().default("new"),
    assignedToUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    resolutionNote: text(),
    resolvedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("complaints_restaurant_status_idx").on(t.restaurantId, t.status, t.createdAt),
    check("complaints_rating_chk", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 5`),
  ],
);

export const complaintAttachments = pgTable(
  "complaint_attachments",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    complaintId: uuid()
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    storageKey: text().notNull(),
    contentType: varchar({ length: 64 }).notNull(),
    sizeBytes: integer().notNull(),
    width: integer(),
    height: integer(),
    createdAt: timestamps.createdAt,
  },
  (t) => [index("complaint_attachments_complaint_idx").on(t.complaintId)],
);

/** In-app notifications. userId null = visible to every member of the restaurant. */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    restaurantId: uuid().references(() => restaurants.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    type: varchar({ length: 48 }).notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: tstz(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("notifications_restaurant_created_idx").on(t.restaurantId, t.createdAt),
    index("notifications_user_unread_idx")
      .on(t.userId, t.createdAt)
      .where(sql`${t.readAt} IS NULL`),
  ],
);

/** Transactional email queue: sent asynchronously, retryable, auditable. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: pk(),
    restaurantId: uuid().references(() => restaurants.id, { onDelete: "cascade" }),
    to: varchar({ length: 320 }).notNull(),
    template: varchar({ length: 48 }).notNull(),
    locale: varchar({ length: 8 }).notNull().default("fr"),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: emailStatus().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    providerRef: varchar({ length: 191 }),
    sendAfter: tstz().notNull().defaultNow(),
    sentAt: tstz(),
    ...timestamps,
  },
  (t) => [index("email_outbox_pending_idx").on(t.status, t.sendAfter)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: pk(),
    restaurantId: uuid().references(() => restaurants.id, { onDelete: "set null" }),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** 'user' | 'guest' | 'system' */
    actorType: varchar({ length: 16 }).notNull(),
    action: varchar({ length: 64 }).notNull(),
    entityType: varchar({ length: 48 }),
    entityId: uuid(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ip: varchar({ length: 64 }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("audit_logs_restaurant_created_idx").on(t.restaurantId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorUserId, t.createdAt),
  ],
);
