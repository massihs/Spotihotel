import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  journalEntries,
  journalLines,
  ledgerAccounts,
  ledgerBudgets,
  ledgerSettings,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { localDay } from "@/lib/period";
import { isDay } from "@/server/modules/pms/calc";
import { ensureChart } from "./chart";
import { postEntry, reverseEntryInTx, syncLedger } from "./sync";

const MAX = 1_000_000_000_000;
const day = z.string().refine(isDay, "invalid_date");

/** Prepares the books (chart, settings) and journals everything pending. */
export async function openBooks(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "accounting.manage");
  await ensureChart(db, ctx.restaurant.id, ctx.restaurant.defaultLocale);
  await syncLedger(db, ctx.restaurant);
}

export async function ledgerState(db: DbOrTx, restaurantId: string) {
  const [s] = await db.select().from(ledgerSettings).where(eq(ledgerSettings.restaurantId, restaurantId));
  return s ?? null;
}

// ─── Chart of accounts ───────────────────────────────────────────────────────

export async function listLedgerAccounts(db: DbOrTx, restaurantId: string) {
  return db
    .select()
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.restaurantId, restaurantId))
    .orderBy(asc(ledgerAccounts.code));
}

export const accountSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z.-]{1,12}$/),
  name: z.string().trim().min(1).max(120),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  reconcilable: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
});

export async function saveLedgerAccount(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof accountSchema>,
) {
  assertCan(ctx, "accounting.manage");
  const input = accountSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const [dup] = await db
    .select({ id: ledgerAccounts.id })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.restaurantId, rid), eq(ledgerAccounts.code, input.code)));
  if (dup && dup.id !== id) throw conflict("code_taken", { field: "code" });
  if (!id) {
    const [row] = await db
      .insert(ledgerAccounts)
      .values({ ...input, restaurantId: rid })
      .returning();
    return row!;
  }
  const [current] = await db
    .select()
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.id, id), eq(ledgerAccounts.restaurantId, rid)));
  if (!current) throw notFound();
  // The automatic postings rely on a system account's nature.
  if (current.systemKey && (input.type !== current.type || !input.active)) throw conflict("system_account");
  const [row] = await db.update(ledgerAccounts).set(input).where(eq(ledgerAccounts.id, id)).returning();
  return row!;
}

// ─── Manual entries ──────────────────────────────────────────────────────────

export const manualEntrySchema = z
  .object({
    date: day,
    memo: z.string().trim().min(2).max(240),
    lines: z
      .array(
        z.object({
          accountId: z.uuid(),
          debitCents: z.coerce.number().int().min(0).max(MAX).default(0),
          creditCents: z.coerce.number().int().min(0).max(MAX).default(0),
          department: z
            .string()
            .trim()
            .max(16)
            .transform((v) => v || null)
            .nullable()
            .optional(),
          description: z
            .string()
            .trim()
            .max(200)
            .transform((v) => v || null)
            .nullable()
            .optional(),
        }),
      )
      .min(2)
      .max(100),
  })
  .refine((v) => v.lines.every((l) => l.debitCents > 0 !== l.creditCents > 0), {
    message: "line_one_side",
    path: ["lines"],
  })
  .refine((v) => v.lines.reduce((s, l) => s + l.debitCents - l.creditCents, 0) === 0, {
    message: "entry_unbalanced",
    path: ["lines"],
  });

/** An accountant's entry (opening balances, payroll, depreciation, supplier payment…). */
export async function createManualEntry(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof manualEntrySchema>,
) {
  assertCan(ctx, "accounting.manage");
  const input = manualEntrySchema.parse(raw);
  const rid = ctx.restaurant.id;
  await ensureChart(db, rid, ctx.restaurant.defaultLocale);
  return db.transaction(async (tx) => {
    const ids = [...new Set(input.lines.map((l) => l.accountId))];
    const accounts = await tx
      .select({ id: ledgerAccounts.id, active: ledgerAccounts.active })
      .from(ledgerAccounts)
      .where(and(eq(ledgerAccounts.restaurantId, rid), inArray(ledgerAccounts.id, ids)));
    if (accounts.length !== ids.length || accounts.some((a) => !a.active))
      throw notFound("account_not_found");
    const entry = await postEntry(tx, rid, {
      date: input.date,
      memo: input.memo,
      sourceType: "manual",
      userId: ctx.user.id,
      lines: input.lines,
    });
    await recordAudit(tx, {
      action: "ledger.entry_created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "journal_entry",
      entityId: entry!.id,
      metadata: { number: entry!.number, date: input.date },
    });
    return entry!;
  });
}

/** Cancels an entry by its mirror image (entries are never edited nor deleted). */
export async function reverseEntry(db: Database, ctx: RestaurantContext, entryId: string, date?: string) {
  assertCan(ctx, "accounting.manage");
  if (!isUuid(entryId)) throw notFound();
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [e] = await tx
      .select()
      .from(journalEntries)
      .where(and(eq(journalEntries.id, entryId), eq(journalEntries.restaurantId, rid)))
      .for("update");
    if (!e) throw notFound();
    if (e.reversalOfId) throw conflict("is_reversal");
    const [already] = await tx
      .select({ id: journalEntries.id })
      .from(journalEntries)
      .where(and(eq(journalEntries.restaurantId, rid), eq(journalEntries.reversalOfId, e.id)));
    if (already) throw conflict("already_reversed");
    // Automatic postings are corrected at their source (void the folio line, delete the expense).
    if (e.sourceType !== "manual") throw conflict("automatic_entry");
    const when = date && isDay(date) ? date : localDay(new Date(), ctx.restaurant.timezone);
    const rev = await reverseEntryInTx(tx, rid, e.id, {
      date: when,
      memo: `reversal #${e.number}`,
      sourceType: "reversal",
      sourceId: e.id,
      userId: ctx.user.id,
    });
    await recordAudit(tx, {
      action: "ledger.entry_reversed",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "journal_entry",
      entityId: e.id,
      metadata: { number: e.number },
    });
    return rev!;
  });
}

/** Journal: entries with their lines, newest first. */
export async function listEntries(
  db: DbOrTx,
  ctx: RestaurantContext,
  f: { from: string; to: string; sourceType?: string; limit?: number },
) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const entries = await db
    .select()
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.restaurantId, rid),
        gte(journalEntries.date, f.from),
        lte(journalEntries.date, f.to),
        f.sourceType ? eq(journalEntries.sourceType, f.sourceType) : undefined,
      ),
    )
    .orderBy(desc(journalEntries.date), desc(journalEntries.number))
    .limit(Math.min(f.limit ?? 300, 2000));
  if (!entries.length) return [];
  const lines = await db
    .select({
      entryId: journalLines.entryId,
      accountId: journalLines.accountId,
      code: ledgerAccounts.code,
      name: ledgerAccounts.name,
      debitCents: journalLines.debitCents,
      creditCents: journalLines.creditCents,
      department: journalLines.department,
      description: journalLines.description,
    })
    .from(journalLines)
    .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, journalLines.accountId))
    .where(
      inArray(
        journalLines.entryId,
        entries.map((e) => e.id),
      ),
    )
    .orderBy(sql`${journalLines.debitCents} = 0`, asc(ledgerAccounts.code));
  const byEntry = new Map<string, typeof lines>();
  for (const l of lines) byEntry.set(l.entryId, [...(byEntry.get(l.entryId) ?? []), l]);
  return entries.map((e) => ({ ...e, lines: byEntry.get(e.id) ?? [] }));
}

// ─── Period closing ──────────────────────────────────────────────────────────

/** Closes the books up to a day: nothing can be dated on or before it afterwards. */
export async function lockBooks(db: Database, ctx: RestaurantContext, until: string | null) {
  assertCan(ctx, "accounting.manage");
  if (until !== null && !isDay(until)) throw validation("invalid_date");
  const rid = ctx.restaurant.id;
  await ensureChart(db, rid, ctx.restaurant.defaultLocale);
  // Reopening is the owner's decision only.
  const current = await ledgerState(db, rid);
  if (current?.lockedUntil && (until === null || until < current.lockedUntil) && ctx.role !== "owner")
    throw conflict("owner_only");
  // Everything up to that day is journalled before the door closes.
  await syncLedger(db, ctx.restaurant);
  await db.update(ledgerSettings).set({ lockedUntil: until }).where(eq(ledgerSettings.restaurantId, rid));
  await recordAudit(db, {
    action: "ledger.locked",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    metadata: { until, previous: current?.lockedUntil ?? null },
  });
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export const budgetSchema = z.object({
  accountId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  amountCents: z.coerce.number().int().min(0).max(MAX),
});

export async function setBudget(db: Database, ctx: RestaurantContext, raw: z.input<typeof budgetSchema>) {
  assertCan(ctx, "accounting.manage");
  const input = budgetSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const [a] = await db
    .select({ id: ledgerAccounts.id, type: ledgerAccounts.type })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.id, input.accountId), eq(ledgerAccounts.restaurantId, rid)));
  if (!a) throw notFound();
  if (a.type !== "revenue" && a.type !== "expense") throw validation("budget_pl_only");
  if (input.amountCents === 0) {
    await db
      .delete(ledgerBudgets)
      .where(and(eq(ledgerBudgets.accountId, a.id), eq(ledgerBudgets.month, input.month)));
    return;
  }
  await db
    .insert(ledgerBudgets)
    .values({ restaurantId: rid, accountId: a.id, month: input.month, amountCents: input.amountCents })
    .onConflictDoUpdate({
      target: [ledgerBudgets.accountId, ledgerBudgets.month],
      set: { amountCents: input.amountCents },
    });
}

export async function budgetsFor(db: DbOrTx, restaurantId: string, fromMonth: string, toMonth: string) {
  return db
    .select()
    .from(ledgerBudgets)
    .where(
      and(
        eq(ledgerBudgets.restaurantId, restaurantId),
        gte(ledgerBudgets.month, fromMonth),
        lte(ledgerBudgets.month, toMonth),
      ),
    );
}

// ─── Bank reconciliation ─────────────────────────────────────────────────────

/** Movements of a cash / bank account still to tick against the statement. */
export async function unreconciled(db: DbOrTx, ctx: RestaurantContext, accountId: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const [a] = await db
    .select()
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.id, accountId), eq(ledgerAccounts.restaurantId, rid)));
  if (!a || !a.reconcilable) throw notFound();
  const [rows, [cleared]] = await Promise.all([
    db
      .select({
        id: journalLines.id,
        date: journalEntries.date,
        number: journalEntries.number,
        memo: journalEntries.memo,
        debitCents: journalLines.debitCents,
        creditCents: journalLines.creditCents,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
      .where(and(eq(journalLines.accountId, a.id), isNull(journalLines.reconciledAt)))
      .orderBy(asc(journalEntries.date), asc(journalEntries.number))
      .limit(1000),
    db
      .select({
        balance:
          sql<number>`coalesce(sum(${journalLines.debitCents} - ${journalLines.creditCents}),0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(journalLines)
      .where(and(eq(journalLines.accountId, a.id), sql`${journalLines.reconciledAt} is not null`)),
  ]);
  return { account: a, lines: rows, clearedBalanceCents: cleared?.balance ?? 0 };
}

/** Ticks movements as matched with the bank statement (or unticks them). */
export async function reconcile(
  db: Database,
  ctx: RestaurantContext,
  accountId: string,
  lineIds: string[],
  matched = true,
) {
  assertCan(ctx, "accounting.manage");
  const ids = z.array(z.uuid()).max(1000).parse(lineIds);
  if (!ids.length) return 0;
  const rows = await db
    .update(journalLines)
    .set({ reconciledAt: matched ? new Date() : null })
    .where(
      and(
        eq(journalLines.restaurantId, ctx.restaurant.id),
        eq(journalLines.accountId, accountId),
        inArray(journalLines.id, ids),
      ),
    )
    .returning({ id: journalLines.id });
  await recordAudit(db, {
    action: matched ? "ledger.reconciled" : "ledger.unreconciled",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { accountId, lines: rows.length },
  });
  return rows.length;
}
