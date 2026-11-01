import { index, integer, pgTable, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { organizations, plans, users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * A restaurant paying Spotifood for its plan (Zarinpal, to the platform's own merchant), or a
 * period granted by the admin ('manual'). Paid rows carry the invoice number.
 */
export const billingPayments = pgTable(
  "billing_payments",
  {
    id: pk(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The restaurant the owner paid from (invoice heading, return page). */
    restaurantId: uuid().references(() => restaurants.id, { onDelete: "set null" }),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    months: integer().notNull(),
    amountCents: money().notNull(),
    currency: varchar({ length: 3 }).notNull(),
    /** 'pending' | 'paid' | 'failed' */
    status: varchar({ length: 16 }).notNull().default("pending"),
    /** 'zarinpal' | 'manual' */
    provider: varchar({ length: 16 }).notNull(),
    providerRef: varchar({ length: 128 }),
    refId: varchar({ length: 64 }),
    cardPan: varchar({ length: 32 }),
    failureReason: varchar({ length: 200 }),
    /** "SF-1405-000001", given when paid. */
    invoiceNumber: varchar({ length: 32 }),
    periodStart: tstz(),
    periodEnd: tstz(),
    paidAt: tstz(),
    createdByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("billing_payments_org_idx").on(t.organizationId, t.createdAt),
    uniqueIndex("billing_payments_invoice_uq").on(t.invoiceNumber),
  ],
);
