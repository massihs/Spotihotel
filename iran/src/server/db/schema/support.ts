import { boolean, index, integer, jsonb, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { restaurants } from "./restaurant";
import { users } from "./platform";

/**
 * Live support. Two channels:
 * - "platform": a hotel's / restaurant's staff ↔ the Spotihotel team
 * - "guest":    a guest's phone (after the QR scan) ↔ the hotel's front desk / the restaurant
 * Each conversation starts with the assistant (status "bot"); "open" once a person must answer.
 */
export const supportThreads = pgTable(
  "support_threads",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** "platform" | "guest" */
    channel: varchar({ length: 10 }).notNull(),
    /** "bot" | "open" | "closed" */
    status: varchar({ length: 8 }).notNull().default("bot"),
    /** Platform channel: the member of staff who wrote. */
    requesterUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** Guest channel: the device and the seat (table session participant) that wrote. */
    guestId: uuid(),
    participantId: uuid(),
    /** Guest channel: room / table label and the name the guest gave, for the desk. */
    place: varchar({ length: 48 }),
    guestName: varchar({ length: 80 }),
    lastMessageAt: tstz().notNull().defaultNow(),
    /** Last time each side read the conversation (unread = messages from the other side after it). */
    requesterReadAt: tstz(),
    agentReadAt: tstz(),
    assigneeUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    closedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("support_threads_restaurant_idx").on(t.restaurantId, t.channel, t.lastMessageAt),
    index("support_threads_participant_idx").on(t.participantId),
    index("support_threads_channel_idx").on(t.channel, t.status, t.lastMessageAt),
  ],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: pk(),
    threadId: uuid()
      .notNull()
      .references(() => supportThreads.id, { onDelete: "cascade" }),
    /** "requester" | "agent" | "bot" | "system" */
    author: varchar({ length: 10 }).notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull().default(""),
    /** Private image (screenshot, photo), served only to the conversation's two sides. */
    imageKey: varchar({ length: 200 }),
    /** Assistant replies: suggested articles, diagnostics, actions offered. */
    data: jsonb().$type<SupportMessageData>(),
    createdAt: tstz().notNull().defaultNow(),
  },
  (t) => [index("support_messages_thread_idx").on(t.threadId, t.createdAt)],
);

export type SupportMessageData = {
  /** What the assistant / system says, shown in the reader's language ("found", "handover_desk"…). */
  code?: string;
  articles?: { slug: string; title: string; body: string; href: string | null }[];
  /** A check of the hotel's setup or a fact (Wi-Fi), as a message code with its values. */
  checks?: { ok: boolean; code: string; values?: Record<string, string | number> }[];
  /** Buttons under the assistant's reply. */
  offer?: ("helpful" | "human")[];
};

/** Help articles the assistant answers with; edited by the platform team. Texts per language. */
export const supportArticles = pgTable(
  "support_articles",
  {
    id: pk(),
    slug: varchar({ length: 60 }).notNull().unique(),
    /** "staff" (hotels, restaurants) | "guest" (after the QR scan) */
    audience: varchar({ length: 8 }).notNull(),
    title: jsonb().$type<Record<string, string>>().notNull(),
    body: jsonb().$type<Record<string, string>>().notNull(),
    /** Words and phrases that bring this article up, any language, separated by commas. */
    keywords: text().notNull().default(""),
    /** A dashboard page (`{base}/frontdesk`) or guest page (`/table/stay`) to open. */
    href: varchar({ length: 200 }),
    sortOrder: integer().notNull().default(0),
    published: boolean().notNull().default(true),
    /** How many times it answered, and how many times it helped. */
    shown: integer().notNull().default(0),
    helped: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index("support_articles_audience_idx").on(t.audience, t.published)],
);
