import { index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * A cash drawer session (شیفت صندوق): opened with a float, closed with a count. The expected
 * amount is computed from the cash payments and drawer movements of the period.
 */
export const cashShifts = pgTable(
  "cash_shifts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    openedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    openedAt: tstz().notNull().defaultNow(),
    openingFloatCents: money().notNull().default(0),
    closedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    closedAt: tstz(),
    /** Snapshot at closing time. */
    expectedCashCents: money(),
    countedCashCents: money(),
    note: text(),
    ...timestamps,
  },
  (t) => [
    index("cash_shifts_restaurant_idx").on(t.restaurantId, t.openedAt),
    // One open drawer per restaurant.
    uniqueIndex("cash_shifts_one_open_uq")
      .on(t.restaurantId)
      .where(sql`${t.closedAt} IS NULL`),
  ],
);

/** Money put into or taken out of the drawer outside of sales (change top-up, small purchase). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    shiftId: uuid()
      .notNull()
      .references(() => cashShifts.id, { onDelete: "cascade" }),
    /** in | out */
    direction: varchar({ length: 3 }).notNull(),
    amountCents: money().notNull(),
    reason: varchar({ length: 200 }).notNull(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("cash_movements_shift_idx").on(t.shiftId)],
);
