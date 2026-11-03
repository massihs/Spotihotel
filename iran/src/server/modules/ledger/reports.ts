import { and, asc, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  folioLines,
  folios,
  hotelAccounts,
  hotelGuests,
  journalEntries,
  journalLines,
  ledgerAccounts,
  stays,
} from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays, nightsBetween } from "@/server/modules/pms/calc";
import { toJalali } from "@/lib/jalali-calendar";
import { budgetsFor } from "./service";
import { fiscalYearStart, monthKeyOf, monthsBetween, seasonOf } from "./periods";

/** Debit-nature accounts grow with debits; the others with credits. */
const debitNature = (type: string) => type === "asset" || type === "expense";

/** Sum of debits and credits per account over a date range (inclusive; open ends allowed). */
async function totals(db: DbOrTx, restaurantId: string, from: string | null, to: string | null) {
  return db
    .select({
      accountId: journalLines.accountId,
      debit: sql<number>`coalesce(sum(${journalLines.debitCents}),0)::bigint`.mapWith(Number),
      credit: sql<number>`coalesce(sum(${journalLines.creditCents}),0)::bigint`.mapWith(Number),
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(
        eq(journalLines.restaurantId, restaurantId),
        from ? gte(journalEntries.date, from) : undefined,
        to ? lte(journalEntries.date, to) : undefined,
      ),
    )
    .groupBy(journalLines.accountId);
}

async function accounts(db: DbOrTx, restaurantId: string) {
  return db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.restaurantId, restaurantId))
    .orderBy(asc(ledgerAccounts.code));
}

/** Trial balance (balance générale) on a day: every account's debits, credits and balance. */
export async function trialBalance(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [list, opening, period] = await Promise.all([
    accounts(db, rid),
    totals(db, rid, null, addDays(from, -1)),
    totals(db, rid, from, to),
  ]);
  const o = new Map(opening.map((t) => [t.accountId, t]));
  const p = new Map(period.map((t) => [t.accountId, t]));
  const rows = list
    .map((a) => {
      const op = o.get(a.id);
      const pe = p.get(a.id);
      const openingNet = (op?.debit ?? 0) - (op?.credit ?? 0);
      const debit = pe?.debit ?? 0;
      const credit = pe?.credit ?? 0;
      const closingNet = openingNet + debit - credit;
      return { id: a.id, code: a.code, name: a.name, type: a.type, openingNet, debit, credit, closingNet };
    })
    .filter((r) => r.openingNet || r.debit || r.credit);
  return {
    rows,
    totals: {
      debit: rows.reduce((s, r) => s + r.debit, 0),
      credit: rows.reduce((s, r) => s + r.credit, 0),
      closingDebit: rows.reduce((s, r) => s + Math.max(0, r.closingNet), 0),
      closingCredit: rows.reduce((s, r) => s + Math.max(0, -r.closingNet), 0),
    },
  };
}

/**
 * Income statement (compte de résultat) by USALI department, compared with the budget and with
 * the previous period of the same length.
 */
export async function incomeStatement(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const length = nightsBetween(from, to) + 1;
  const prevFrom = addDays(from, -length);
  const prevTo = addDays(from, -1);
  const span = monthsBetween(from, to);
  const [list, current, previous, budgets, byDept] = await Promise.all([
    accounts(db, rid),
    totals(db, rid, from, to),
    totals(db, rid, prevFrom, prevTo),
    budgetsFor(db, rid, span[0]!, span[span.length - 1]!),
    db
      .select({
        department: journalLines.department,
        type: ledgerAccounts.type,
        net: sql<number>`coalesce(sum(${journalLines.creditCents} - ${journalLines.debitCents}),0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
      .where(
        and(
          eq(journalLines.restaurantId, rid),
          gte(journalEntries.date, from),
          lte(journalEntries.date, to),
          sql`${ledgerAccounts.type} in ('revenue','expense')`,
        ),
      )
      .groupBy(journalLines.department, ledgerAccounts.type),
  ]);
  const cur = new Map(current.map((t) => [t.accountId, t]));
  const prev = new Map(previous.map((t) => [t.accountId, t]));
  const budget = new Map<string, number>();
  for (const b of budgets) budget.set(b.accountId, (budget.get(b.accountId) ?? 0) + b.amountCents);
  const line = (a: (typeof list)[number]) => {
    const sign = a.type === "revenue" ? -1 : 1;
    const c = cur.get(a.id);
    const p = prev.get(a.id);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      amount: sign * ((c?.debit ?? 0) - (c?.credit ?? 0)),
      previous: sign * ((p?.debit ?? 0) - (p?.credit ?? 0)),
      budget: budget.get(a.id) ?? null,
    };
  };
  const revenue = list
    .filter((a) => a.type === "revenue")
    .map(line)
    .filter((l) => l.amount || l.previous || l.budget);
  const expense = list
    .filter((a) => a.type === "expense")
    .map(line)
    .filter((l) => l.amount || l.previous || l.budget);
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const sumPrev = (xs: { previous: number }[]) => xs.reduce((s, x) => s + x.previous, 0);
  const departments = new Map<string, { revenue: number; expense: number }>();
  for (const d of byDept) {
    const key = d.department ?? "admin";
    const cur2 = departments.get(key) ?? { revenue: 0, expense: 0 };
    if (d.type === "revenue") cur2.revenue += d.net;
    else cur2.expense += -d.net;
    departments.set(key, cur2);
  }
  return {
    from,
    to,
    previousFrom: prevFrom,
    previousTo: prevTo,
    revenue,
    expense,
    totals: {
      revenue: sum(revenue),
      expense: sum(expense),
      net: sum(revenue) - sum(expense),
      previousRevenue: sumPrev(revenue),
      previousExpense: sumPrev(expense),
      previousNet: sumPrev(revenue) - sumPrev(expense),
      budgetRevenue: revenue.reduce((s, x) => s + (x.budget ?? 0), 0),
      budgetExpense: expense.reduce((s, x) => s + (x.budget ?? 0), 0),
    },
    departments: [...departments.entries()]
      .map(([department, v]) => ({ department, ...v, profit: v.revenue - v.expense }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

/** Balance sheet (bilan) on a day; the year's result is shown inside equity. */
export async function balanceSheet(db: DbOrTx, ctx: RestaurantContext, asOf: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const fyStart = fiscalYearStart(asOf);
  const [list, all, before] = await Promise.all([
    accounts(db, rid),
    totals(db, rid, null, asOf),
    totals(db, rid, null, addDays(fyStart, -1)),
  ]);
  const t = new Map(all.map((x) => [x.accountId, x]));
  const b = new Map(before.map((x) => [x.accountId, x]));
  const signedOf = (a: (typeof list)[number], m: typeof t) => {
    const x = m.get(a.id);
    const net = (x?.debit ?? 0) - (x?.credit ?? 0);
    return debitNature(a.type) ? net : -net;
  };
  const balanceOf = (a: (typeof list)[number]) => signedOf(a, t);
  // Results of earlier fiscal years not yet closed into retained earnings.
  const priorResult =
    list.filter((a) => a.type === "revenue").reduce((s, a) => s + signedOf(a, b), 0) -
    list.filter((a) => a.type === "expense").reduce((s, a) => s + signedOf(a, b), 0);
  const section = (type: string) =>
    list
      .filter((a) => a.type === type)
      .map((a) => ({ id: a.id, code: a.code, name: a.name, amount: balanceOf(a) }))
      .filter((r) => r.amount);
  const assets = section("asset");
  const liabilities = section("liability");
  const equity = section("equity");
  const result =
    list.filter((a) => a.type === "revenue").reduce((s, a) => s + balanceOf(a), 0) -
    list.filter((a) => a.type === "expense").reduce((s, a) => s + balanceOf(a), 0) -
    priorResult;
  const total = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return {
    asOf,
    assets,
    liabilities,
    equity,
    fiscalYearStart: fyStart,
    priorResult,
    result,
    totals: {
      assets: total(assets),
      liabilities: total(liabilities),
      equity: total(equity) + priorResult + result,
    },
    balanced: total(assets) === total(liabilities) + total(equity) + priorResult + result,
  };
}

/** General ledger of one account: opening balance, movements with running balance. */
export async function generalLedger(
  db: DbOrTx,
  ctx: RestaurantContext,
  accountId: string,
  from: string,
  to: string,
) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [a] = await db
    .select()
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.id, accountId), eq(ledgerAccounts.restaurantId, rid)));
  if (!a) throw notFound();
  const [[opening], rows] = await Promise.all([
    db
      .select({
        net: sql<number>`coalesce(sum(${journalLines.debitCents} - ${journalLines.creditCents}),0)::bigint`.mapWith(
          Number,
        ),
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalLines.accountId, a.id), lt(journalEntries.date, from))),
    db
      .select({
        id: journalLines.id,
        entryId: journalEntries.id,
        date: journalEntries.date,
        number: journalEntries.number,
        memo: journalEntries.memo,
        sourceType: journalEntries.sourceType,
        description: journalLines.description,
        department: journalLines.department,
        debitCents: journalLines.debitCents,
        creditCents: journalLines.creditCents,
        reconciledAt: journalLines.reconciledAt,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(
        and(eq(journalLines.accountId, a.id), gte(journalEntries.date, from), lte(journalEntries.date, to)),
      )
      .orderBy(asc(journalEntries.date), asc(journalEntries.number))
      .limit(5000),
  ]);
  let running = opening?.net ?? 0;
  return {
    account: a,
    openingNet: opening?.net ?? 0,
    lines: rows.map((r) => {
      running += r.debitCents - r.creditCents;
      return { ...r, runningNet: running };
    }),
    closingNet: running,
  };
}

/**
 * Receivables (balance âgée): what each company owes, by age of the debt (0–30, 31–60, 61–90,
 * 90+ days after the posting), and the guests' open balances in house.
 */
export async function agedReceivables(db: DbOrTx, ctx: RestaurantContext, asOf: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const lines = await db
    .select({
      accountId: folios.accountId,
      name: hotelAccounts.name,
      terms: hotelAccounts.paymentTermsDays,
      creditLimit: hotelAccounts.creditLimitCents,
      date: folioLines.businessDate,
      amount: folioLines.amountCents,
    })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .innerJoin(hotelAccounts, eq(hotelAccounts.id, folios.accountId))
    .where(
      and(
        eq(folioLines.restaurantId, rid),
        isNull(folios.stayId),
        isNull(folioLines.voidedAt),
        lte(folioLines.businessDate, asOf),
      ),
    )
    .orderBy(asc(folioLines.businessDate));
  // Payments settle the oldest debts first (FIFO).
  const byAccount = new Map<
    string,
    {
      name: string;
      terms: number;
      creditLimit: number;
      debts: { date: string; amount: number }[];
      credit: number;
    }
  >();
  for (const l of lines) {
    const cur = byAccount.get(l.accountId!) ?? {
      name: l.name,
      terms: l.terms,
      creditLimit: l.creditLimit,
      debts: [],
      credit: 0,
    };
    if (l.amount > 0) cur.debts.push({ date: l.date, amount: l.amount });
    else cur.credit += -l.amount;
    byAccount.set(l.accountId!, cur);
  }
  const rows = [...byAccount.entries()].map(([id, a]) => {
    let credit = a.credit;
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0 };
    let overdue = 0;
    for (const d of a.debts) {
      const left = Math.max(0, d.amount - credit);
      credit = Math.max(0, credit - d.amount);
      if (!left) continue;
      const age = nightsBetween(d.date, asOf);
      if (age <= 30) buckets.current += left;
      else if (age <= 60) buckets.d30 += left;
      else if (age <= 90) buckets.d60 += left;
      else buckets.d90 += left;
      if (age > a.terms) overdue += left;
    }
    const total = buckets.current + buckets.d30 + buckets.d60 + buckets.d90 - credit;
    return { id, name: a.name, ...buckets, unapplied: credit, total, overdue, creditLimit: a.creditLimit };
  });
  const guests = await db
    .select({
      stayId: stays.id,
      number: stays.number,
      status: stays.status,
      lastName: hotelGuests.lastName,
      firstName: hotelGuests.firstName,
      balance: sql<number>`coalesce(sum(${folioLines.amountCents}),0)::bigint`.mapWith(Number),
    })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .innerJoin(stays, eq(stays.id, folios.stayId))
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(and(eq(folioLines.restaurantId, rid), isNull(folioLines.voidedAt), eq(folios.status, "open")))
    .groupBy(stays.id, stays.number, stays.status, hotelGuests.lastName, hotelGuests.firstName)
    .having(sql`sum(${folioLines.amountCents}) <> 0`);
  return {
    asOf,
    accounts: rows.filter((r) => r.total !== 0).sort((a, b) => b.total - a.total),
    guests,
    totals: {
      cityLedger: rows.reduce((s, r) => s + r.total, 0),
      guestLedger: guests.reduce((s, g) => s + g.balance, 0),
    },
  };
}

/**
 * VAT and levies collected per month of the hotel's calendar (Jalali months in Iran, with the
 * season of the quarterly VAT return).
 */
export async function taxReport(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      day: journalEntries.date,
      key: ledgerAccounts.systemKey,
      collected:
        sql<number>`coalesce(sum(${journalLines.creditCents} - ${journalLines.debitCents}),0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      and(
        eq(journalLines.restaurantId, rid),
        gte(journalEntries.date, from),
        lte(journalEntries.date, to),
        sql`${ledgerAccounts.systemKey} in ('vat_payable','city_tax_payable')`,
        // Payments of the tax to the state are not "collected".
        sql`${journalEntries.sourceType} <> 'manual' or ${journalLines.creditCents} > 0`,
      ),
    )
    .groupBy(journalEntries.date, ledgerAccounts.systemKey);
  const byMonth = new Map<string, { vat: number; cityTax: number }>();
  for (const r of rows) {
    const month = monthKeyOf(r.day);
    const cur = byMonth.get(month) ?? { vat: 0, cityTax: 0 };
    if (r.key === "vat_payable") cur.vat += r.collected;
    else cur.cityTax += r.collected;
    byMonth.set(month, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, season: seasonOf(month), ...v }));
}

/** Cash and bank: what came in and went out per account over the period. */
export async function cashSummary(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const list = (await accounts(db, rid)).filter((a) => a.reconcilable);
  const [opening, period] = await Promise.all([
    totals(db, rid, null, addDays(from, -1)),
    totals(db, rid, from, to),
  ]);
  const o = new Map(opening.map((t) => [t.accountId, t.debit - t.credit]));
  const p = new Map(period.map((t) => [t.accountId, t]));
  return list.map((a) => {
    const open = o.get(a.id) ?? 0;
    const pe = p.get(a.id);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      opening: open,
      inflow: pe?.debit ?? 0,
      outflow: pe?.credit ?? 0,
      closing: open + (pe?.debit ?? 0) - (pe?.credit ?? 0),
    };
  });
}

/**
 * Journal export in the French FEC layout (Fichier des Écritures Comptables, tab-separated), which
 * every accounting package imports. Amounts use a comma decimal separator.
 */
export async function exportFec(db: DbOrTx, ctx: RestaurantContext, from: string, to: string, decimals = 2) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      number: journalEntries.number,
      date: journalEntries.date,
      memo: journalEntries.memo,
      sourceType: journalEntries.sourceType,
      created: journalEntries.createdAt,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      debit: journalLines.debitCents,
      credit: journalLines.creditCents,
      description: journalLines.description,
      reconciledAt: journalLines.reconciledAt,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      and(eq(journalLines.restaurantId, rid), gte(journalEntries.date, from), lte(journalEntries.date, to)),
    )
    .orderBy(asc(journalEntries.number), sql`${journalLines.debitCents} = 0`);
  const journal = (s: string) =>
    s === "folio_line" || s === "void"
      ? ["VE", "Ventes hôtel"]
      : s === "payment" || s === "refund"
        ? ["CA", "Caisse"]
        : s === "purchase"
          ? ["AC", "Achats"]
          : s === "expense" || s === "expense_del"
            ? ["BQ", "Banque"]
            : ["OD", "Opérations diverses"];
  const d = (s: string) => s.replace(/-/g, "");
  const amount = (c: number) => (c / 10 ** decimals).toFixed(decimals).replace(".", ",");
  const clean = (s: string | null) => (s ?? "").replace(/[\t\r\n|]/g, " ");
  const header = [
    "JournalCode",
    "JournalLib",
    "EcritureNum",
    "EcritureDate",
    "CompteNum",
    "CompteLib",
    "CompAuxNum",
    "CompAuxLib",
    "PieceRef",
    "PieceDate",
    "EcritureLib",
    "Debit",
    "Credit",
    "EcritureLet",
    "DateLet",
    "ValidDate",
    "Montantdevise",
    "Idevise",
  ];
  const lines = rows.map((r) => {
    const [jc, jl] = journal(r.sourceType);
    return [
      jc,
      jl,
      String(r.number),
      d(r.date),
      r.code,
      clean(r.name),
      "",
      "",
      String(r.number),
      d(r.date),
      clean(r.description ?? r.memo),
      amount(r.debit),
      amount(r.credit),
      r.reconciledAt ? "R" : "",
      r.reconciledAt ? r.reconciledAt.toISOString().slice(0, 10).replace(/-/g, "") : "",
      d(r.created.toISOString().slice(0, 10)),
      "",
      "",
    ].join("\t");
  });
  return [header.join("\t"), ...lines].join("\r\n");
}

/**
 * Journal export for Iranian accountants (opens in Excel): voucher number, Jalali date, account code
 * and name, description, debit and credit in rials (the legal unit; amounts are stored in hundredths
 * of a rial).
 */
export async function exportJournalCsv(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      number: journalEntries.number,
      date: journalEntries.date,
      memo: journalEntries.memo,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      debit: journalLines.debitCents,
      credit: journalLines.creditCents,
      description: journalLines.description,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      and(eq(journalLines.restaurantId, rid), gte(journalEntries.date, from), lte(journalEntries.date, to)),
    )
    .orderBy(asc(journalEntries.number), sql`${journalLines.debitCents} = 0`);
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const jdate = (d: string) => {
    const j = toJalali(d);
    return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
  };
  const rial = (c: number) => Math.round(c / 100);
  const header = ["شماره سند", "تاریخ", "کد حساب", "نام حساب", "شرح", "بدهکار (ریال)", "بستانکار (ریال)"];
  const lines = rows.map((r) =>
    [r.number, jdate(r.date), r.code, r.name, r.description ?? r.memo, rial(r.debit), rial(r.credit)]
      .map(cell)
      .join(","),
  );
  const totalD = rows.reduce((s, r) => s + rial(r.debit), 0);
  const totalC = rows.reduce((s, r) => s + rial(r.credit), 0);
  return [header.join(","), ...lines, ["", "", "", "", "جمع", totalD, totalC].map(cell).join(",")].join(
    "\r\n",
  );
}
