import { index, integer, jsonb, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, timestamps, tstz } from "./_helpers";
import { restaurants } from "./restaurant";

/**
 * Games between guests of the same restaurant (backgammon). Players are guest devices
 * (`guests.id`), so a player can leave the game screen — or close the app — and come back.
 */
export const games = pgTable(
  "games",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    kind: varchar({ length: 16 }).notNull().default("backgammon"),
    /** open (waiting for an opponent) → playing → finished | cancelled | abandoned */
    status: varchar({ length: 12 }).notNull().default("open"),
    /** Match length: first to 3 or 5 points. */
    targetPoints: integer().notNull(),
    whiteGuestId: uuid().notNull(),
    whiteName: varchar({ length: 60 }).notNull(),
    whiteTable: varchar({ length: 30 }),
    blackGuestId: uuid(),
    blackName: varchar({ length: 60 }),
    blackTable: varchar({ length: 30 }),
    /** Board, dice, turn, score, strikes… (see modules/games/service.ts). */
    state: jsonb().$type<Record<string, unknown>>().notNull(),
    /** When the player to move is played automatically (15 s of inactivity). */
    turnDeadline: tstz(),
    whiteSeenAt: tstz(),
    blackSeenAt: tstz(),
    winnerGuestId: uuid(),
    /** points | forfeit | resign */
    finishReason: varchar({ length: 12 }),
    finishedAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("games_restaurant_status_idx").on(t.restaurantId, t.status, t.createdAt),
    index("games_winner_idx").on(t.restaurantId, t.winnerGuestId),
  ],
);
