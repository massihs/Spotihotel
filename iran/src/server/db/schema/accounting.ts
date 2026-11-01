import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/** Operating expenses (هزینه‌ها): rent, salaries, bills… Stock purchases live in `purchases`. */
export const expenses = pgTable(
  "expenses",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** rent | salaries | utilities | supplies | marketing | maintenance | taxes | other */
    category: varchar({ length: 24 }).notNull(),
    amountCents: money().notNull(),
    description: text(),
    /** cash | card | transfer */
    method: varchar({ length: 16 }).notNull().default("cash"),
    paidAt: tstz().notNull().defaultNow(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("expenses_restaurant_paid_idx").on(t.restaurantId, t.paidAt),
    check("expenses_amount_chk", sql`${t.amountCents} > 0`),
  ],
);
