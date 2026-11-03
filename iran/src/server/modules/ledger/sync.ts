import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  expenses,
  folioLines,
  folios,
  journalEntries,
  journalLines,
  ledgerSettings,
  orders,
  paymentAllocations,
  payments,
  purchases,
  refunds,
} from "@/server/db/schema";
import { conflict, validation } from "@/server/errors";
import { localDay } from "@/lib/period";
import { addDays } from "@/server/modules/pms/calc";
import { ensureChart, moneyAccountOf, revenueOf, systemAccounts, type SystemKey } from "./chart";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type EntryLine = {
  accountId: string;
  debitCents?: number;
  creditCents?: number;
  department?: string | null;
  description?: string | null;
};

export type NewEntry = {
  date: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  reversalOfId?: string | null;
  userId?: string | null;
  lines: EntryLine[];
};

/**
 * Writes one balanced journal entry. Lines with a zero amount are dropped; a negative amount is
 * moved to the other side. Refuses an unbalanced entry and a date inside closed books unless
 * `lateToOpen` (automatic postings move to the first open day instead).
 */
export async function postEntry(
  tx: DbOrTx,
  restaurantId: string,
  e: NewEntry,
  opts: { lateToOpen?: boolean } = {},
) {
  const lines = e.lines
    .map((l) => {
      const net = (l.debitCents ?? 0) - (l.creditCents ?? 0);
      return { ...l, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 };
    })
    .filter((l) => l.debitCents || l.creditCents);
  if (!lines.length) return null;
  const debit = lines.reduce((s, l) => s + l.debitCents, 0);
  const credit = lines.reduce((s, l) => s + l.creditCents, 0);
  if (debit !== credit) throw validation("entry_unbalanced", { debit, credit });

  const [settings] = await tx
    .update(ledgerSettings)
    .set({ nextEntryNumber: sql`${ledgerSettings.nextEntryNumber} + 1` })
    .where(eq(ledgerSettings.restaurantId, restaurantId))
    .returning({
      n: sql<number>`${ledgerSettings.nextEntryNumber} - 1`,
      lockedUntil: ledgerSettings.lockedUntil,
    });
  if (!settings) throw new Error("ledger settings missing");
  let date = e.date;
  if (settings.lockedUntil && date <= settings.lockedUntil) {
    if (!opts.lateToOpen) throw conflict("period_locked", { lockedUntil: settings.lockedUntil });
    date = addDays(settings.lockedUntil, 1);
  }
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      restaurantId,
      number: Number(settings.n),
      date,
      memo: e.memo.slice(0, 240),
      sourceType: e.sourceType,
      sourceId: e.sourceId ?? null,
      reversalOfId: e.reversalOfId ?? null,
      postedByUserId: e.userId ?? null,
    })
    .returning();
  await tx.insert(journalLines).values(
    lines.map((l) => ({
      restaurantId,
      entryId: entry!.id,
      accountId: l.accountId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      department: l.department ?? null,
      description: l.description?.slice(0, 200) ?? null,
    })),
  );
  return entry!;
}

/** Posts the mirror image of an entry (same accounts, sides swapped). */
export async function reverseEntryInTx(
  tx: DbOrTx,
  restaurantId: string,
  entryId: string,
  meta: { date: string; memo: string; sourceType: string; sourceId?: string | null; userId?: string | null },
  opts: { lateToOpen?: boolean } = {},
) {
  const lines = await tx.select().from(journalLines).where(eq(journalLines.entryId, entryId));
  return postEntry(
    tx,
    restaurantId,
    {
      ...meta,
      reversalOfId: entryId,
      lines: lines.map((l) => ({
        accountId: l.accountId,
        debitCents: l.creditCents,
        creditCents: l.debitCents,
        department: l.department,
        description: l.description,
      })),
    },
    opts,
  );
}

const EXPENSE_KEYS: Record<string, SystemKey> = {
  rent: "expense_rent",
  salaries: "expense_salaries",
  utilities: "expense_utilities",
  supplies: "expense_supplies",
  marketing: "expense_marketing",
  maintenance: "expense_maintenance",
  taxes: "expense_taxes",
  other: "expense_other",
};

/** Source ids already journalled for a source type. */
async function journalled(tx: DbOrTx, restaurantId: string, sourceType: string) {
  const rows = await tx
    .select({ id: journalEntries.sourceId, entryId: journalEntries.id })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.restaurantId, restaurantId),
        eq(journalEntries.sourceType, sourceType),
        isNotNull(journalEntries.sourceId),
      ),
    );
  return new Map(rows.map((r) => [r.id!, r.entryId]));
}

/**
 * Brings the general ledger up to date with everything that happened in the hotel: folio postings
 * and their voids, restaurant payments and refunds, expenses, stock purchases. Idempotent (each
 * source is journalled once, enforced by a unique index), safe to call before every report.
 */
export async function syncLedger(
  db: Database,
  restaurant: { id: string; timezone: string; defaultLocale: string },
) {
  const rid = restaurant.id;
  const tz = restaurant.timezone;
  await ensureChart(db, rid, restaurant.defaultLocale);
  return db.transaction(async (tx) => {
    // One sync at a time per hotel.
    await tx.select().from(ledgerSettings).where(eq(ledgerSettings.restaurantId, rid)).for("update");
    const acc = await systemAccounts(tx, rid);
    let posted = 0;
    posted += await syncFolioLines(tx, rid, acc, tz);
    posted += await syncPayments(tx, rid, acc, tz);
    posted += await syncExpenses(tx, rid, acc, tz);
    posted += await syncPurchases(tx, rid, acc, tz);
    return posted;
  });
}

type Acc = Awaited<ReturnType<typeof systemAccounts>>;

async function syncFolioLines(tx: Tx, rid: string, acc: Acc, tz: string) {
  let n = 0;
  const done = await journalled(tx, rid, "folio_line");
  const voided = await journalled(tx, rid, "void");
  const rows = await tx
    .select({ line: folioLines, folioStay: folios.stayId, folioAccount: folios.accountId })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .where(eq(folioLines.restaurantId, rid))
    .orderBy(folioLines.createdAt);
  const ledgerById = new Map(
    rows.map((r) => [r.line.id, !r.folioStay && r.folioAccount ? acc("city_ledger") : acc("guest_ledger")]),
  );
  for (const { line } of rows) {
    const ledger = ledgerById.get(line.id)!;
    const entryId = done.get(line.id);
    if (!line.voidedAt && !entryId) {
      const e = folioEntry(line, ledger, acc, ledgerById);
      if (e) {
        await postEntry(tx, rid, e, { lateToOpen: true });
        n++;
      }
    } else if (line.voidedAt && entryId && !voided.has(line.id)) {
      await reverseEntryInTx(
        tx,
        rid,
        entryId,
        {
          date: localDay(line.voidedAt, tz),
          memo: `void:${line.description}`,
          sourceType: "void",
          sourceId: line.id,
          userId: line.voidedByUserId,
        },
        { lateToOpen: true },
      );
      n++;
    }
  }
  return n;
}

function folioEntry(
  line: typeof folioLines.$inferSelect,
  ledger: string,
  acc: Acc,
  ledgerById: Map<string, string>,
): NewEntry | null {
  const base = {
    date: line.businessDate,
    memo: line.description,
    sourceType: "folio_line",
    sourceId: line.id,
    userId: line.postedByUserId,
  };
  if (line.kind === "charge" || line.kind === "adjustment") {
    const { key, dept } = revenueOf(line.department);
    const net = line.amountCents - line.taxCents;
    return {
      ...base,
      lines: [
        { accountId: ledger, debitCents: line.amountCents, department: dept },
        { accountId: acc(key), creditCents: net, department: dept },
        { accountId: acc("vat_payable"), creditCents: line.taxCents, department: dept },
      ],
    };
  }
  if (line.kind === "payment") {
    return {
      ...base,
      lines: [
        { accountId: acc(moneyAccountOf(line.method)), debitCents: -line.amountCents },
        { accountId: ledger, creditCents: -line.amountCents },
      ],
    };
  }
  // Transfers: the receiving side journals both ledgers; the sending side has no entry.
  if (line.kind === "transfer" && line.amountCents > 0 && line.sourceId) {
    const from = ledgerById.get(line.sourceId) ?? acc("guest_ledger");
    if (from === ledger) return null;
    return {
      ...base,
      lines: [
        { accountId: ledger, debitCents: line.amountCents },
        { accountId: from, creditCents: line.amountCents },
      ],
    };
  }
  return null;
}

/** Restaurant / bar sales paid directly (not on a room bill), and their refunds. */
async function syncPayments(tx: Tx, rid: string, acc: Acc, tz: string) {
  let n = 0;
  const done = await journalled(tx, rid, "payment");
  const list = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.restaurantId, rid),
        eq(payments.status, "succeeded"),
        ne(payments.provider, "room_charge"),
        isNotNull(payments.succeededAt),
      ),
    );
  const todo = list.filter((p) => !done.has(p.id));
  const taxOf = await paymentTax(
    tx,
    todo.map((p) => p.id),
  );
  for (const p of todo) {
    const tax = taxOf.get(p.id) ?? 0;
    await postEntry(
      tx,
      rid,
      {
        date: localDay(p.succeededAt!, tz),
        memo: `sale:${p.provider}`,
        sourceType: "payment",
        sourceId: p.id,
        userId: p.recordedByUserId,
        lines: [
          { accountId: acc(moneyAccountOf(p.provider)), debitCents: p.amountCents },
          { accountId: acc("revenue_fnb"), creditCents: p.amountCents - tax, department: "fnb" },
          { accountId: acc("vat_payable"), creditCents: tax, department: "fnb" },
        ],
      },
      { lateToOpen: true },
    );
    n++;
  }
  const refunded = await journalled(tx, rid, "refund");
  const refundRows = await tx
    .select({ r: refunds, provider: payments.provider, amount: payments.amountCents, paymentId: payments.id })
    .from(refunds)
    .innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(
      and(
        eq(refunds.restaurantId, rid),
        eq(refunds.status, "succeeded"),
        ne(payments.provider, "room_charge"),
      ),
    );
  const refundTax = await paymentTax(
    tx,
    refundRows.map((r) => r.paymentId),
  );
  for (const { r, provider, amount, paymentId } of refundRows) {
    if (refunded.has(r.id)) continue;
    const tax = amount ? Math.round(((refundTax.get(paymentId) ?? 0) * r.amountCents) / amount) : 0;
    await postEntry(
      tx,
      rid,
      {
        date: localDay(r.updatedAt, tz),
        memo: `refund:${provider}`,
        sourceType: "refund",
        sourceId: r.id,
        userId: r.createdByUserId,
        lines: [
          { accountId: acc("revenue_fnb"), debitCents: r.amountCents - tax, department: "fnb" },
          { accountId: acc("vat_payable"), debitCents: tax, department: "fnb" },
          { accountId: acc(moneyAccountOf(provider)), creditCents: r.amountCents },
        ],
      },
      { lateToOpen: true },
    );
    n++;
  }
  return n;
}

/** VAT contained in each payment, from the orders it paid (pro rata of the amount allocated). */
async function paymentTax(tx: DbOrTx, paymentIds: string[]) {
  if (!paymentIds.length) return new Map<string, number>();
  const rows = await tx
    .select({
      paymentId: paymentAllocations.paymentId,
      tax: sql<number>`coalesce(sum(case when ${orders.totalCents} > 0 then round(${orders.taxCents}::numeric * ${paymentAllocations.amountCents} / ${orders.totalCents}) else 0 end),0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(paymentAllocations)
    .innerJoin(orders, eq(orders.id, paymentAllocations.orderId))
    .where(inArray(paymentAllocations.paymentId, paymentIds))
    .groupBy(paymentAllocations.paymentId);
  return new Map(rows.map((r) => [r.paymentId, r.tax]));
}

async function syncExpenses(tx: Tx, rid: string, acc: Acc, tz: string) {
  let n = 0;
  const done = await journalled(tx, rid, "expense");
  const removed = await journalled(tx, rid, "expense_del");
  const list = await tx.select().from(expenses).where(eq(expenses.restaurantId, rid));
  const live = new Set(list.map((e) => e.id));
  for (const e of list) {
    if (done.has(e.id)) continue;
    await postEntry(
      tx,
      rid,
      {
        date: localDay(e.paidAt, tz),
        memo: e.description ?? `expense:${e.category}`,
        sourceType: "expense",
        sourceId: e.id,
        userId: e.createdByUserId,
        lines: [
          {
            accountId: acc(EXPENSE_KEYS[e.category] ?? "expense_other"),
            debitCents: e.amountCents,
            department: "admin",
          },
          { accountId: acc(e.method === "cash" ? "cash" : "bank"), creditCents: e.amountCents },
        ],
      },
      { lateToOpen: true },
    );
    n++;
  }
  // An expense deleted after it was journalled is reversed, never erased.
  for (const [sourceId, entryId] of done) {
    if (live.has(sourceId) || removed.has(sourceId)) continue;
    await reverseEntryInTx(
      tx,
      rid,
      entryId,
      {
        date: localDay(new Date(), tz),
        memo: "expense_deleted",
        sourceType: "expense_del",
        sourceId,
      },
      { lateToOpen: true },
    );
    n++;
  }
  return n;
}

/** Supplier invoices (stock purchases): cost of sales against accounts payable. */
async function syncPurchases(tx: Tx, rid: string, acc: Acc, tz: string) {
  let n = 0;
  const done = await journalled(tx, rid, "purchase");
  const list = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.restaurantId, rid), sql`${purchases.totalCents} > 0`));
  for (const p of list) {
    if (done.has(p.id)) continue;
    await postEntry(
      tx,
      rid,
      {
        date: localDay(p.purchasedAt, tz),
        memo: p.reference ? `purchase:${p.reference}` : "purchase",
        sourceType: "purchase",
        sourceId: p.id,
        userId: p.userId,
        lines: [
          { accountId: acc("cogs"), debitCents: p.totalCents, department: "fnb" },
          { accountId: acc("accounts_payable"), creditCents: p.totalCents },
        ],
      },
      { lateToOpen: true },
    );
    n++;
  }
  return n;
}
