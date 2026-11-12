import { boolean, index, integer, pgTable, uuid, varchar } from "drizzle-orm/pg-core";
import { pk, softDelete, timestamps } from "./_helpers";
import { restaurants } from "./restaurant";

/**
 * A point of sale inside the establishment: a hotel's restaurants, cafés, bars, pool bar…
 * Each has its own tables (and their QR codes), its own part of the menu and its own sales.
 */
export const outlets = pgTable(
  "outlets",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    name: varchar({ length: 80 }).notNull(),
    /** restaurant | cafe | bar | lounge | pool_bar | pastry */
    kind: varchar({ length: 16 }).notNull().default("restaurant"),
    /** Where it is ("طبقه همکف", "Roof", "Lobby"): shown to the team and on the outlet's card. */
    location: varchar({ length: 80 }),
    /** "07:00–23:00" style free text. */
    hours: varchar({ length: 40 }),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    /** Hotel rooms may order from it (room service); on by default for every outlet. */
    roomService: boolean().notNull().default(true),
    ...timestamps,
    ...softDelete,
  },
  (t) => [index("outlets_restaurant_idx").on(t.restaurantId, t.sortOrder)],
);
