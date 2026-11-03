import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { folioLines, folios, hotelAccounts, hotelGuests, pmsSettings, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { includedTax } from "./calc";
import { getPmsSettings } from "./setup";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const MAX_CENTS = 1_000_000_000_000;

/** Revenue departments a charge can be posted to. */
export const CHARGE_DEPARTMENTS = [
  "room",
  "fnb",
  "room_service",
  "minibar",
  "spa",
  "laundry",
  "phone",
  "parking",
  "transport",
  "city_tax",
  "misc",
] as const;
export type ChargeDepartment = (typeof CHARGE_DEPARTMENTS)[number];

export const PAYMENT_METHODS = ["cash", "card", "transfer", "cheque", "online"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Live lines only: a voided line no longer counts. */
const LIVE = isNull(folioLines.voidedAt);

export async function folioBalance(db: DbOrTx, folioId: string) {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${folioLines.amountCents}), 0)::bigint` })
    .from(folioLines)
    .where(and(eq(folioLines.folioId, folioId), LIVE));
  return Number(row?.balance ?? 0);
}

async function nextFolioNumber(tx: DbOrTx, restaurantId: string) {
  const [row] = await tx
    .update(pmsSettings)
    .set({ nextFolioNumber: sql`${pmsSettings.nextFolioNumber} + 1` })
    .where(eq(pmsSettings.restaurantId, restaurantId))
    .returning({ n: sql<number>`${pmsSettings.nextFolioNumber} - 1` });
  if (!row) throw notFound("pms settings missing");
  return Number(row.n);
}

export async function createFolio(
  tx: DbOrTx,
  restaurantId: string,
  values: {
    stayId?: string | null;
    accountId?: string | null;
    guestId?: string | null;
    label?: string | null;
  },
) {
  const number = await nextFolioNumber(tx, restaurantId);
  const [row] = await tx
    .insert(folios)
    .values({
      restaurantId,
      number,
      stayId: values.stayId ?? null,
      accountId: values.accountId ?? null,
      guestId: values.guestId ?? null,
      label: values.label ?? null,
    })
    .returning();
  return row!;
}

/** The stay's first open folio (the guest's bill), created if it has none. */
export async function mainFolioOf(tx: DbOrTx, restaurantId: string, stayId: string) {
  const [existing] = await tx
    .select()
    .from(folios)
    .where(and(eq(folios.restaurantId, restaurantId), eq(folios.stayId, stayId), eq(folios.status, "open")))
    .orderBy(asc(folios.number))
    .limit(1);
  if (existing) return existing;
  const [stay] = await tx
    .select({ guestId: stays.guestId })
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.restaurantId, restaurantId)));
  if (!stay) throw notFound();
  return createFolio(tx, restaurantId, { stayId, guestId: stay.guestId });
}

/** The company account's own folio (its city-ledger statement), created if missing. */
export async function accountFolioOf(tx: DbOrTx, restaurantId: string, accountId: string) {
  const [existing] = await tx
    .select()
    .from(folios)
    .where(
      and(
        eq(folios.restaurantId, restaurantId),
        eq(folios.accountId, accountId),
        isNull(folios.stayId),
        eq(folios.status, "open"),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [acc] = await tx
    .select({ name: hotelAccounts.name })
    .from(hotelAccounts)
    .where(and(eq(hotelAccounts.id, accountId), eq(hotelAccounts.restaurantId, restaurantId)));
  if (!acc) throw notFound();
  return createFolio(tx, restaurantId, { accountId, label: acc.name });
}

async function lockOpenFolio(tx: DbOrTx, restaurantId: string, folioId: string) {
  const [f] = await tx
    .select()
    .from(folios)
    .where(and(eq(folios.id, folioId), eq(folios.restaurantId, restaurantId)))
    .for("update");
  if (!f) throw notFound();
  if (f.status !== "open") throw conflict("folio_closed");
  return f;
}

export type PostLine = {
  folioId: string;
  kind: "charge" | "payment" | "adjustment" | "transfer";
  department: string;
  description: string;
  quantity?: number;
  unitCents: number;
  amountCents: number;
  taxRateBps?: number;
  /** Exact VAT when known (an order's own tax); otherwise derived from the rate. */
  taxCents?: number;
  method?: string | null;
  reference?: string | null;
  sourceType?: string;
  sourceId?: string | null;
  userId?: string | null;
  /** Defaults to the hotel's current business day. */
  businessDate?: string;
};

/** Inserts one posting on an open folio (inside the caller's transaction). */
export async function postLine(tx: DbOrTx, restaurantId: string, timezone: string, line: PostLine) {
  await lockOpenFolio(tx, restaurantId, line.folioId);
  const businessDate = line.businessDate ?? (await getPmsSettings(tx, restaurantId, timezone)).businessDate;
  const taxRateBps = line.taxRateBps ?? 0;
  const [row] = await tx
    .insert(folioLines)
    .values({
      restaurantId,
      folioId: line.folioId,
      businessDate,
      kind: line.kind,
      department: line.department,
      description: line.description.slice(0, 200),
      quantity: line.quantity ?? 1,
      unitCents: line.unitCents,
      amountCents: line.amountCents,
      taxRateBps,
      taxCents:
        line.kind === "payment" || line.kind === "transfer"
          ? 0
          : (line.taxCents ?? includedTax(line.amountCents, taxRateBps)),
      method: line.method ?? null,
      reference: line.reference ?? null,
      sourceType: line.sourceType ?? "manual",
      sourceId: line.sourceId ?? null,
      postedByUserId: line.userId ?? null,
    })
    .returning();
  return row!;
}

// ─── Front desk operations ───────────────────────────────────────────────────

export const chargeSchema = z.object({
  department: z.enum(CHARGE_DEPARTMENTS),
  description: z.string().trim().min(1).max(200),
  quantity: z.coerce.number().int().min(1).max(999).default(1),
  unitCents: z.coerce.number().int().min(1).max(MAX_CENTS),
  /** Defaults to the hotel's rate for the department (room tax for rooms, service tax otherwise). */
  taxRateBps: z.coerce.number().int().min(0).max(5000).nullable().optional(),
});

export async function postCharge(
  db: Database,
  ctx: RestaurantContext,
  folioId: string,
  raw: z.input<typeof chargeSchema>,
) {
  assertCan(ctx, "folio.post");
  const input = chargeSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const settings = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const taxRateBps =
      input.taxRateBps ??
      (input.department === "room"
        ? settings.roomTaxBps
        : input.department === "city_tax"
          ? 0
          : settings.serviceTaxBps);
    const line = await postLine(tx, rid, ctx.restaurant.timezone, {
      folioId,
      kind: "charge",
      department: input.department,
      description: input.description,
      quantity: input.quantity,
      unitCents: input.unitCents,
      amountCents: input.unitCents * input.quantity,
      taxRateBps,
      userId: ctx.user.id,
      businessDate: settings.businessDate,
    });
    await recordAudit(tx, {
      action: "folio.charge_posted",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio",
      entityId: folioId,
      metadata: { department: input.department, amountCents: line.amountCents },
    });
    return line;
  });
}

export const paymentSchema = z.object({
  amountCents: z.coerce.number().int().min(1).max(MAX_CENTS),
  method: z.enum(PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(64)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

/** Money received on a folio (deposit before arrival, settlement at check-out, company payment). */
export async function postPayment(
  db: Database,
  ctx: RestaurantContext,
  folioId: string,
  raw: z.input<typeof paymentSchema>,
) {
  assertCan(ctx, "folio.post");
  const input = paymentSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const line = await postLine(tx, rid, ctx.restaurant.timezone, {
      folioId,
      kind: "payment",
      department: "payment",
      description: `payment:${input.method}`,
      unitCents: -input.amountCents,
      amountCents: -input.amountCents,
      method: input.method,
      reference: input.reference ?? null,
      userId: ctx.user.id,
    });
    await recordAudit(tx, {
      action: "folio.payment_posted",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio",
      entityId: folioId,
      metadata: { method: input.method, amountCents: input.amountCents },
    });
    return line;
  });
}

const reasonSchema = z.string().trim().min(2).max(200);

/** Cancels a posting (wrong room, disputed charge…). Kept on the bill, struck through, audited. */
export async function voidLine(db: Database, ctx: RestaurantContext, lineId: string, reason: string) {
  assertCan(ctx, "folio.adjust");
  const why = reasonSchema.parse(reason);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.id, lineId), eq(folioLines.restaurantId, rid)))
      .for("update");
    if (!line) throw notFound();
    if (line.voidedAt) throw conflict("already_voided");
    if (line.department === "transfer") throw conflict("transfer_not_voidable");
    await lockOpenFolio(tx, rid, line.folioId);
    await tx
      .update(folioLines)
      .set({ voidedAt: new Date(), voidReason: why, voidedByUserId: ctx.user.id })
      .where(eq(folioLines.id, line.id));
    await recordAudit(tx, {
      action: "folio.line_voided",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio_line",
      entityId: line.id,
      metadata: { amountCents: line.amountCents, department: line.department, reason: why },
    });
  });
}

export const discountSchema = z.object({
  /** The charge it reduces (its department and VAT rate are reused). */
  lineId: z.uuid(),
  amountCents: z.coerce.number().int().min(1).max(MAX_CENTS),
  reason: reasonSchema,
});

/** A commercial gesture on one charge: a negative adjustment in the same department. */
export async function discountLine(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof discountSchema>,
) {
  assertCan(ctx, "folio.adjust");
  const input = discountSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.id, input.lineId), eq(folioLines.restaurantId, rid), LIVE));
    if (!line || line.kind !== "charge") throw notFound();
    const [done] = await tx
      .select({ total: sql<number>`coalesce(sum(-${folioLines.amountCents}), 0)::bigint` })
      .from(folioLines)
      .where(
        and(
          eq(folioLines.sourceType, "discount"),
          eq(folioLines.sourceId, line.id),
          eq(folioLines.restaurantId, rid),
          LIVE,
        ),
      );
    if (Number(done?.total ?? 0) + input.amountCents > line.amountCents)
      throw validation("discount_too_high");
    const row = await postLine(tx, rid, ctx.restaurant.timezone, {
      folioId: line.folioId,
      kind: "adjustment",
      department: line.department,
      description: input.reason,
      unitCents: -input.amountCents,
      amountCents: -input.amountCents,
      taxRateBps: line.taxRateBps,
      sourceType: "discount",
      sourceId: line.id,
      userId: ctx.user.id,
    });
    await recordAudit(tx, {
      action: "folio.discount",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio_line",
      entityId: line.id,
      metadata: { amountCents: input.amountCents, reason: input.reason },
    });
    return row;
  });
}

/** Moves one charge to another open folio (the guest's company folio, another room…). */
export async function moveLine(db: Database, ctx: RestaurantContext, lineId: string, toFolioId: string) {
  assertCan(ctx, "folio.adjust");
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [line] = await tx
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.id, lineId), eq(folioLines.restaurantId, rid), LIVE))
      .for("update");
    if (!line || line.kind !== "charge") throw notFound();
    if (line.folioId === toFolioId) return line;
    await lockOpenFolio(tx, rid, line.folioId);
    await lockOpenFolio(tx, rid, toFolioId);
    await tx
      .update(folioLines)
      .set({ voidedAt: new Date(), voidReason: "moved", voidedByUserId: ctx.user.id })
      .where(eq(folioLines.id, line.id));
    const moved = await postLine(tx, rid, ctx.restaurant.timezone, {
      folioId: toFolioId,
      kind: "charge",
      department: line.department,
      description: line.description,
      quantity: line.quantity,
      unitCents: line.unitCents,
      amountCents: line.amountCents,
      taxRateBps: line.taxRateBps,
      sourceType: "move",
      sourceId: line.id,
      userId: ctx.user.id,
    });
    await recordAudit(tx, {
      action: "folio.line_moved",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio_line",
      entityId: line.id,
      metadata: { to: toFolioId, amountCents: line.amountCents },
    });
    return moved;
  });
}

/**
 * Sends a folio's balance to a company account (city ledger): the guest's bill is settled by a
 * "transfer" credit, and the company's statement receives the same amount as a debit.
 */
export async function transferToAccount(
  tx: Tx,
  ctx: RestaurantContext,
  folioId: string,
  accountId: string,
  label: string,
) {
  const rid = ctx.restaurant.id;
  const balance = await folioBalance(tx, folioId);
  if (balance <= 0) return null;
  const target = await accountFolioOf(tx, rid, accountId);
  const out = await postLine(tx, rid, ctx.restaurant.timezone, {
    folioId,
    kind: "transfer",
    department: "transfer",
    description: label,
    unitCents: -balance,
    amountCents: -balance,
    method: "city_ledger",
    sourceType: "transfer",
    userId: ctx.user.id,
  });
  await postLine(tx, rid, ctx.restaurant.timezone, {
    folioId: target.id,
    kind: "transfer",
    department: "transfer",
    description: label,
    unitCents: balance,
    amountCents: balance,
    sourceType: "transfer",
    sourceId: out.id,
    userId: ctx.user.id,
  });
  return balance;
}

export async function transferFolioToAccount(
  db: Database,
  ctx: RestaurantContext,
  folioId: string,
  accountId: string,
) {
  assertCan(ctx, "folio.adjust");
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const [f] = await tx
      .select({ id: folios.id, number: folios.number, accountId: folios.accountId, stayId: folios.stayId })
      .from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.restaurantId, rid)));
    if (!f) throw notFound();
    if (!f.stayId) throw conflict("not_a_guest_folio");
    const [acc] = await tx
      .select()
      .from(hotelAccounts)
      .where(and(eq(hotelAccounts.id, accountId), eq(hotelAccounts.restaurantId, rid)));
    if (!acc || !acc.active) throw notFound();
    const amount = await transferToAccount(tx, ctx, folioId, accountId, `Folio ${f.number}`);
    if (!amount) throw conflict("nothing_to_transfer");
    if (acc.creditLimitCents > 0) {
      const owed = await accountBalance(tx, rid, accountId);
      if (owed > acc.creditLimitCents) throw conflict("credit_limit_exceeded");
    }
    await recordAudit(tx, {
      action: "folio.transferred_to_account",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "folio",
      entityId: folioId,
      metadata: { accountId, amountCents: amount },
    });
    return amount;
  });
}

/** What a company owes (sum of its statement folios). */
export async function accountBalance(db: DbOrTx, restaurantId: string, accountId: string) {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${folioLines.amountCents}), 0)::bigint` })
    .from(folioLines)
    .innerJoin(folios, eq(folios.id, folioLines.folioId))
    .where(
      and(
        eq(folios.restaurantId, restaurantId),
        eq(folios.accountId, accountId),
        isNull(folios.stayId),
        LIVE,
      ),
    );
  return Number(row?.balance ?? 0);
}

/** A folio with its lines and balance (bill screen, guest portal, printed invoice). */
export async function folioView(db: DbOrTx, restaurantId: string, folioId: string) {
  const [f] = await db
    .select({
      id: folios.id,
      number: folios.number,
      status: folios.status,
      label: folios.label,
      stayId: folios.stayId,
      accountId: folios.accountId,
      accountName: hotelAccounts.name,
      guestFirst: hotelGuests.firstName,
      guestLast: hotelGuests.lastName,
      closedAt: folios.closedAt,
      createdAt: folios.createdAt,
    })
    .from(folios)
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, folios.accountId))
    .leftJoin(hotelGuests, eq(hotelGuests.id, folios.guestId))
    .where(and(eq(folios.id, folioId), eq(folios.restaurantId, restaurantId)));
  if (!f) throw notFound();
  const lines = await db
    .select()
    .from(folioLines)
    .where(eq(folioLines.folioId, folioId))
    .orderBy(asc(folioLines.businessDate), asc(folioLines.createdAt));
  const live = lines.filter((l) => !l.voidedAt);
  const charges = live.filter((l) => l.amountCents > 0).reduce((s, l) => s + l.amountCents, 0);
  const credits = live.filter((l) => l.amountCents < 0).reduce((s, l) => s + l.amountCents, 0);
  const tax = new Map<number, { baseCents: number; taxCents: number }>();
  for (const l of live) {
    if (l.kind === "payment" || l.kind === "transfer" || !l.taxRateBps) continue;
    const cur = tax.get(l.taxRateBps) ?? { baseCents: 0, taxCents: 0 };
    cur.baseCents += l.amountCents - l.taxCents;
    cur.taxCents += l.taxCents;
    tax.set(l.taxRateBps, cur);
  }
  return {
    ...f,
    lines,
    chargesCents: charges,
    creditsCents: -credits,
    balanceCents: charges + credits,
    taxes: [...tax.entries()].map(([rateBps, v]) => ({ rateBps, ...v })),
  };
}

/** Every folio of a stay with balances. */
export async function stayFolios(db: DbOrTx, restaurantId: string, stayId: string) {
  const list = await db
    .select({ id: folios.id })
    .from(folios)
    .where(and(eq(folios.restaurantId, restaurantId), eq(folios.stayId, stayId)))
    .orderBy(asc(folios.number));
  return Promise.all(list.map((f) => folioView(db, restaurantId, f.id)));
}

export async function closeFolios(tx: DbOrTx, restaurantId: string, ids: string[]) {
  if (!ids.length) return;
  await tx
    .update(folios)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(folios.restaurantId, restaurantId), inArray(folios.id, ids), eq(folios.status, "open")));
}
