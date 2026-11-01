import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pk, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";
import { sessionParticipants } from "./tables";
import { diners } from "./diners";

/**
 * Web Push subscriptions (one per browser). Who it alerts: a staff member of a restaurant
 * (new orders), a seat at a table or a signed-in guest (order ready).
 */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: pk(),
    endpoint: text().notNull(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    restaurantId: uuid().references(() => restaurants.id, { onDelete: "cascade" }),
    participantId: uuid().references(() => sessionParticipants.id, { onDelete: "cascade" }),
    dinerId: uuid().references(() => diners.id, { onDelete: "cascade" }),
    createdAt: tstz().notNull().defaultNow(),
    lastSuccessAt: tstz(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_uq").on(t.endpoint),
    index("push_subscriptions_restaurant_idx").on(t.restaurantId),
    index("push_subscriptions_participant_idx").on(t.participantId),
    index("push_subscriptions_diner_idx").on(t.dinerId),
  ],
);
