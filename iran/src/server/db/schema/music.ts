import { boolean, index, integer, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, softDelete, timestamps, tstz } from "./_helpers";
import { musicPlan, musicSubscriptionStatus } from "./enums";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * A music theme (Jazz, Lounge, traditional…): a pool of tracks that feeds both the
 * subscribers' rotating playlists and its own live radio station.
 */
export const musicThemes = pgTable(
  "music_themes",
  {
    id: pk(),
    slug: varchar({ length: 64 }).notNull(),
    name: varchar({ length: 80 }).notNull(),
    description: text(),
    /** Accent colour of the station artwork (hex). */
    color: varchar({ length: 7 }).notNull().default("#16a34a"),
    /** Station artwork (public storage key, square webp). */
    coverKey: text(),
    isActive: boolean().notNull().default(true),
    /** The radio is on air (public station page). */
    radioEnabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps,
    ...softDelete,
  },
  (t) => [uniqueIndex("music_themes_slug_uq").on(t.slug)],
);

export const musicTracks = pgTable(
  "music_tracks",
  {
    id: pk(),
    themeId: uuid()
      .notNull()
      .references(() => musicThemes.id, { onDelete: "cascade" }),
    title: varchar({ length: 160 }).notNull(),
    artist: varchar({ length: 160 }),
    storageKey: text().notNull(),
    mimeType: varchar({ length: 64 }).notNull(),
    sizeBytes: integer().notNull(),
    /** Seconds, measured in the browser at upload; drives the radio clock. */
    durationSec: integer().notNull(),
    /** Album art: extracted from the file's tags at upload, or uploaded by the admin. */
    coverKey: text(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    uploadedByUserId: uuid().references(() => users.id),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("music_tracks_theme_idx").on(t.themeId, t.sortOrder)],
);

/** A restaurant's music subscription: one theme, a playlist renewed weekly or monthly. */
export const musicSubscriptions = pgTable(
  "music_subscriptions",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    themeId: uuid()
      .notNull()
      .references(() => musicThemes.id),
    plan: musicPlan().notNull(),
    status: musicSubscriptionStatus().notNull().default("pending"),
    /** Monthly price at request time, platform currency minor units. */
    priceCents: money().notNull(),
    startsAt: tstz(),
    endsAt: tstz(),
    requestedByUserId: uuid().references(() => users.id),
    activatedByUserId: uuid().references(() => users.id),
    note: text(),
    ...timestamps,
  },
  (t) => [index("music_subscriptions_restaurant_idx").on(t.restaurantId, t.status)],
);

/**
 * What a restaurant's in-house player is playing, reported by the dashboard player, so guests
 * at the tables can see the song and its cover. `startedAt` is when the track's second 0 was.
 */
export const musicNowPlaying = pgTable("music_now_playing", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  trackId: uuid().references(() => musicTracks.id, { onDelete: "set null" }),
  isPlaying: boolean().notNull().default(false),
  startedAt: tstz(),
  updatedAt: tstz().notNull().defaultNow(),
});
