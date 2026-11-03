import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  chequeEvents,
  cheques,
  folioLines,
  payments,
  purchases,
  supplierPayments,
  suppliers,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { localDay } from "@/lib/period";
import { normalizeDigits } from "@/lib/money";
import { addDays, isDay, nightsBetween } from "@/server/modules/pms/calc";

const MAX = 1_000_000_000_000;
const day = z.string().refine(isDay, "invalid_date");

// ─── Cheques (چک) ────────────────────────────────────────────────────────────

/** Allowed status changes; each one is journalled (see ledger sync). */
const NEXT: Record<"received" | "issued", Record<string, string[]>> = {
  received: {
    in_hand: ["deposited", "cleared", "bounced", "returned"],
    deposited: ["cleared", "bounced"],
    bounced: ["cleared", "returned"],
  },
  issued: { issued: ["cleared", "bounced", "cancelled"], bounced: ["cleared", "cancelled"] },
};

export const chequeDetailsSchema = z.object({
  /** شناسه صیادی: 16 digits on every Iranian cheque since 1399. */
  sayadId: z
    .string()
    .transform((v) => normalizeDigits(v).replace(/\s/g, "") || null)
    .pipe(
      z
        .string()
        .regex(/^\d{16}$/, "invalid_sayad")
        .nullable(),
    )
    .nullable()
    .optional(),
  number: z
    .string()
    .trim()
    .max(32)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  bank: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  party: z.string().trim().min(2).max(160),
  dueDate: day,
});
export type ChequeDetails = z.input<typeof chequeDetailsSchema>;

/** Registers a cheque (inside the caller's transaction). */
export async function insertCheque(
  tx: DbOrTx,
  restaurantId: string,
  v: z.output<typeof chequeDetailsSchema> & {
    direction: "received" | "issued";
    amountCents: number;
    folioLineId?: string | null;
    supplierId?: string | null;
    note?: string | null;
    userId: string | null;
    today: string;
  },
) {
  const status = v.direction === "received" ? "in_hand" : "issued";
  try {
    const [row] = await tx
      .insert(cheques)
      .values({
        restaurantId,
        direction: v.direction,
        sayadId: v.sayadId ?? null,
        number: v.number ?? null,
        bank: v.bank ?? null,
        party: v.party,
        amountCents: v.amountCents,
        dueDate: v.dueDate,
        status,
        folioLineId: v.folioLineId ?? null,
        supplierId: v.supplierId ?? null,
        note: v.note ?? null,
        createdByUserId: v.userId,
      })
      .returning();
    await tx
      .insert(chequeEvents)
      .values({ restaurantId, chequeId: row!.id, status, day: v.today, userId: v.userId });
    return row!;
  } catch (e) {
    const code =
      (e as { code?: string; cause?: { code?: string } }).code ??
      (e as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw conflict("sayad_taken", { field: "sayadId" });
    throw e;
  }
}

/** Moves a cheque to its next status (deposited, cleared, bounced, returned, cancelled). */
export async function setChequeStatus(
  db: Database,
  ctx: RestaurantContext,
  chequeId: string,
  status: string,
  on?: string,
) {
  assertCan(ctx, "accounting.manage");
  if (!isUuid(chequeId)) throw notFound();
  const rid = ctx.restaurant.id;
  const when = on && isDay(on) ? on : localDay(new Date(), ctx.restaurant.timezone);
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(cheques)
      .where(and(eq(cheques.id, chequeId), eq(cheques.restaurantId, rid)))
      .for("update");
    if (!c) throw notFound();
    const allowed = NEXT[c.direction as "received" | "issued"]?.[c.status] ?? [];
    if (!allowed.includes(status)) throw conflict("invalid_transition");
    await tx.update(cheques).set({ status }).where(eq(cheques.id, c.id));
    await tx
      .insert(chequeEvents)
      .values({ restaurantId: rid, chequeId: c.id, status, day: when, userId: ctx.user.id });
    await recordAudit(tx, {
      action: "cheque.status",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "cheque",
      entityId: c.id,
      metadata: { from: c.status, to: status, amountCents: c.amountCents },
    });
  });
}

/** The cheque register, with what falls due soon and what bounced. */
export async function chequeRegister(db: DbOrTx, ctx: RestaurantContext, direction?: "received" | "issued") {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const today = localDay(new Date(), ctx.restaurant.timezone);
  const rows = await db
    .select()
    .from(cheques)
    .where(and(eq(cheques.restaurantId, rid), direction ? eq(cheques.direction, direction) : undefined))
    .orderBy(asc(cheques.dueDate))
    .limit(1000);
  const open = (c: (typeof rows)[number]) => ["in_hand", "deposited", "issued", "bounced"].includes(c.status);
  const soon = addDays(today, 7);
  return {
    today,
    rows: rows.map((c) => ({
      ...c,
      overdue: open(c) && c.dueDate < today,
      dueSoon: open(c) && c.dueDate >= today && c.dueDate <= soon,
    })),
    totals: {
      receivedOpen: rows
        .filter((c) => c.direction === "received" && ["in_hand", "deposited"].includes(c.status))
        .reduce((s, c) => s + c.amountCents, 0),
      issuedOpen: rows
        .filter((c) => c.direction === "issued" && c.status === "issued")
        .reduce((s, c) => s + c.amountCents, 0),
      bounced: rows.filter((c) => c.status === "bounced").reduce((s, c) => s + c.amountCents, 0),
      dueThisWeek: rows.filter((c) => open(c) && c.dueDate <= soon).length,
    },
  };
}

// ─── Suppliers (accounts payable) ────────────────────────────────────────────

export const supplierPaymentSchema = z
  .object({
    supplierId: z.uuid(),
    amountCents: z.coerce.number().int().min(1).max(MAX),
    method: z.enum(["cash", "transfer", "cheque"]),
    paidOn: day,
    reference: z
      .string()
      .trim()
      .max(64)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    note: z
      .string()
      .trim()
      .max(300)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    cheque: chequeDetailsSchema.omit({ party: true }).optional(),
  })
  .refine((v) => v.method !== "cheque" || !!v.cheque, { message: "cheque_required", path: ["cheque"] });

/** Pays a supplier (cash, transfer or an issued cheque). Journalled against accounts payable. */
export async function paySupplier(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof supplierPaymentSchema>,
) {
  assertCan(ctx, "accounting.manage");
  const input = supplierPaymentSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [sup] = await tx
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.restaurantId, rid), isNull(suppliers.deletedAt)),
      );
    if (!sup) throw notFound("supplier_not_found");
    const cheque =
      input.method === "cheque"
        ? await insertCheque(tx, rid, {
            ...input.cheque!,
            party: sup.name,
            direction: "issued",
            amountCents: input.amountCents,
            supplierId: sup.id,
            userId: ctx.user.id,
            today: input.paidOn,
          })
        : null;
    const [row] = await tx
      .insert(supplierPayments)
      .values({
        restaurantId: rid,
        supplierId: sup.id,
        amountCents: input.amountCents,
        method: input.method,
        chequeId: cheque?.id ?? null,
        paidOn: input.paidOn,
        reference: input.reference ?? null,
        note: input.note ?? null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await recordAudit(tx, {
      action: "supplier.paid",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "supplier",
      entityId: sup.id,
      metadata: { amountCents: input.amountCents, method: input.method },
    });
    return row!;
  });
}

/** What the hotel owes each supplier, by age of the invoices (payments settle the oldest first). */
export async function payablesAging(db: DbOrTx, ctx: RestaurantContext, asOf: string) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const [list, bought, paid] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name, phone: suppliers.phone })
      .from(suppliers)
      .where(and(eq(suppliers.restaurantId, rid), isNull(suppliers.deletedAt)))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        supplierId: purchases.supplierId,
        totalCents: purchases.totalCents,
        at: purchases.purchasedAt,
      })
      .from(purchases)
      .where(eq(purchases.restaurantId, rid))
      .orderBy(asc(purchases.purchasedAt)),
    db
      .select({
        supplierId: supplierPayments.supplierId,
        total: sql<number>`coalesce(sum(${supplierPayments.amountCents}),0)::bigint`.mapWith(Number),
      })
      .from(supplierPayments)
      .where(and(eq(supplierPayments.restaurantId, rid), lte(supplierPayments.paidOn, asOf)))
      .groupBy(supplierPayments.supplierId),
  ]);
  const paidBy = new Map(paid.map((p) => [p.supplierId, p.total]));
  const rows = list.map((s) => {
    let credit = paidBy.get(s.id) ?? 0;
    const b = { current: 0, d30: 0, d60: 0, d90: 0 };
    let invoiced = 0;
    for (const p of bought.filter((x) => x.supplierId === s.id)) {
      const d = localDay(p.at, tz);
      if (d > asOf) continue;
      invoiced += p.totalCents;
      const left = Math.max(0, p.totalCents - credit);
      credit = Math.max(0, credit - p.totalCents);
      if (!left) continue;
      const age = nightsBetween(d, asOf);
      if (age <= 30) b.current += left;
      else if (age <= 60) b.d30 += left;
      else if (age <= 90) b.d60 += left;
      else b.d90 += left;
    }
    return {
      ...s,
      invoiced,
      paid: paidBy.get(s.id) ?? 0,
      ...b,
      advance: credit,
      total: b.current + b.d30 + b.d60 + b.d90 - credit,
    };
  });
  const recent = await db
    .select({ p: supplierPayments, name: suppliers.name })
    .from(supplierPayments)
    .innerJoin(suppliers, eq(suppliers.id, supplierPayments.supplierId))
    .where(eq(supplierPayments.restaurantId, rid))
    .orderBy(desc(supplierPayments.paidOn), desc(supplierPayments.createdAt))
    .limit(50);
  return {
    rows: rows.filter((r) => r.invoiced || r.paid),
    suppliers: list,
    recent: recent.map((r) => ({ ...r.p, supplier: r.name })),
    total: rows.reduce((s, r) => s + r.total, 0),
  };
}

// ─── Cashier report (گزارش صندوق) ────────────────────────────────────────────

/**
 * Money taken on a business day by each person and method: front desk payments on folios and
 * restaurant / bar payments. What each cashier must hand over at the end of the shift.
 */
export async function cashierReport(db: DbOrTx, ctx: RestaurantContext, businessDate: string) {
  const all = ctx.permissions.has("accounting.manage");
  if (!all) assertCan(ctx, "folio.post");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const [desk, restaurant] = await Promise.all([
    db
      .select({
        userId: folioLines.postedByUserId,
        name: users.fullName,
        method: folioLines.method,
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(-${folioLines.amountCents}),0)::bigint`.mapWith(Number),
      })
      .from(folioLines)
      .leftJoin(users, eq(users.id, folioLines.postedByUserId))
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          eq(folioLines.kind, "payment"),
          eq(folioLines.businessDate, businessDate),
          isNull(folioLines.voidedAt),
          all ? undefined : eq(folioLines.postedByUserId, ctx.user.id),
        ),
      )
      .groupBy(folioLines.postedByUserId, users.fullName, folioLines.method),
    db
      .select({
        userId: payments.recordedByUserId,
        name: users.fullName,
        method: payments.provider,
        count: sql<number>`count(*)::int`,
        total:
          sql<number>`coalesce(sum(${payments.amountCents} - ${payments.refundedCents}),0)::bigint`.mapWith(
            Number,
          ),
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.recordedByUserId))
      .where(
        and(
          eq(payments.restaurantId, rid),
          eq(payments.status, "succeeded"),
          inArray(payments.provider, ["cash", "on_site_terminal"]),
          sql`(${payments.succeededAt} at time zone ${tz})::date = ${businessDate}::date`,
          all ? undefined : eq(payments.recordedByUserId, ctx.user.id),
        ),
      )
      .groupBy(payments.recordedByUserId, users.fullName, payments.provider),
  ]);
  const norm = (m: string | null) => (m === "on_site_terminal" ? "card" : (m ?? "cash"));
  const byUser = new Map<
    string,
    { name: string; lines: Record<string, { count: number; total: number }>; total: number }
  >();
  for (const r of [...desk, ...restaurant]) {
    const key = r.userId ?? "system";
    const cur = byUser.get(key) ?? { name: r.name ?? "—", lines: {}, total: 0 };
    const m = norm(r.method);
    const l = cur.lines[m] ?? { count: 0, total: 0 };
    l.count += r.count;
    l.total += r.total;
    cur.lines[m] = l;
    cur.total += r.total;
    byUser.set(key, cur);
  }
  const people = [...byUser.entries()].map(([id, v]) => ({ id, ...v }));
  const methods: Record<string, number> = {};
  for (const p of people)
    for (const [m, l] of Object.entries(p.lines)) methods[m] = (methods[m] ?? 0) + l.total;
  return { businessDate, people, methods, total: people.reduce((s, p) => s + p.total, 0) };
}
