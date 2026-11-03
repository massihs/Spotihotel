import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { money, pk, timestamps, tstz } from "./_helpers";
import { users } from "./platform";
import { restaurants } from "./restaurant";

/**
 * Double-entry general ledger. Every financial event (folio charge, payment, transfer to the city
 * ledger, expense, stock purchase, restaurant sale…) is journalled automatically as a balanced
 * entry; accountants add manual entries. Reports (trial balance, P&L, balance sheet, general
 * ledger, aged receivables) are computed from the journal lines only.
 */

export const ledgerAccounts = pgTable(
  "ledger_accounts",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: varchar({ length: 12 }).notNull(),
    name: varchar({ length: 120 }).notNull(),
    /** asset | liability | equity | revenue | expense */
    type: varchar({ length: 10 }).notNull(),
    /** Accounts the automatic postings use: cash, guest_ledger, revenue_room… (null = user account). */
    systemKey: varchar({ length: 32 }),
    /** Cash and bank accounts are reconciled against statements. */
    reconcilable: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ledger_accounts_code_uq").on(t.restaurantId, t.code),
    uniqueIndex("ledger_accounts_system_uq")
      .on(t.restaurantId, t.systemKey)
      .where(sql`${t.systemKey} IS NOT NULL`),
    check("ledger_accounts_type_chk", sql`${t.type} in ('asset','liability','equity','revenue','expense')`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    /** Accounting date (the hotel's business day for automatic entries). */
    date: date({ mode: "string" }).notNull(),
    memo: varchar({ length: 240 }).notNull(),
    /** folio_line | void | payment | expense | purchase | manual | reversal | opening */
    sourceType: varchar({ length: 16 }).notNull(),
    sourceId: uuid(),
    /** This entry cancels that one (reversal). */
    reversalOfId: uuid(),
    postedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("journal_entries_number_uq").on(t.restaurantId, t.number),
    // An automatic posting is journalled once, whatever retries happen.
    uniqueIndex("journal_entries_source_uq")
      .on(t.restaurantId, t.sourceType, t.sourceId)
      .where(sql`${t.sourceId} IS NOT NULL`),
    index("journal_entries_date_idx").on(t.restaurantId, t.date),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: pk(),
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    entryId: uuid()
      .notNull()
      .references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "restrict" }),
    debitCents: money().notNull().default(0),
    creditCents: money().notNull().default(0),
    /** Revenue / cost centre (USALI department): rooms, fnb, spa, minibar, other, admin… */
    department: varchar({ length: 16 }),
    description: varchar({ length: 200 }),
    /** Bank reconciliation: matched with the statement on this day. */
    reconciledAt: tstz(),
    ...timestamps,
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.restaurantId, t.accountId),
    check(
      "journal_lines_side_chk",
      sql`${t.debitCents} >= 0 and ${t.creditCents} >= 0 and (${t.debitCents} = 0) <> (${t.creditCents} = 0)`,
    ),
  ],
);

/** Monthly budget per account, to compare with actuals. */
export const ledgerBudgets = pgTable(
  "ledger_budgets",
  {
    restaurantId: uuid()
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: "cascade" }),
    /** "YYYY-MM" */
    month: varchar({ length: 7 }).notNull(),
    amountCents: money().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.accountId, t.month] })],
);

/** Books closed up to a date: no entry may be dated on or before it. */
export const ledgerSettings = pgTable("ledger_settings", {
  restaurantId: uuid()
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  lockedUntil: date({ mode: "string" }),
  nextEntryNumber: integer().notNull().default(1),
  /** First month of the fiscal year (1–12). Iran: 1 = Farvardin is handled by the calendar. */
  fiscalYearStartMonth: integer().notNull().default(1),
  ...timestamps,
});
