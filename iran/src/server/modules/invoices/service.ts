import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  invoiceOrders,
  invoices,
  orderItems,
  orders,
  paymentAllocations,
  payments,
  restaurantSettings,
  restaurants,
  tableSessions,
  type InvoiceParty,
  type InvoiceSnapshot,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { jalaliYear } from "@/lib/jalali";
import { taxFromGross, taxFromNet } from "@/lib/money";
import type { GuestContext } from "@/server/modules/guest/sessions";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Buyer details for a formal invoice (company / individual asking for a named invoice). */
export const buyerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nationalId: optional(20).refine((v) => !v || /^[0-9۰-۹]{10,11}$/.test(v), "invalid_national_id"),
  economicCode: optional(20).refine((v) => !v || /^[0-9۰-۹]{10,14}$/.test(v), "invalid_economic_code"),
  phone: optional(32),
  address: optional(300),
  postalCode: optional(10).refine((v) => !v || /^[0-9۰-۹]{10}$/.test(v), "invalid_postal_code"),
});
export type BuyerInput = z.input<typeof buyerSchema>;

/** Invoice numbers restart every Jalali year: 1405-000001, 1405-000002… (gap-free per restaurant). */
export function invoiceNumber(year: number, seq: number) {
  return `${year}-${String(seq).padStart(6, "0")}`;
}

type Issuer = { kind: "staff"; userId: string } | { kind: "guest" } | { kind: "system" };

/**
 * Issues the invoice of a payment. Idempotent: the payment row is locked and an existing invoice
 * is returned, so a double tap (or the guest and a waiter at once) never creates two numbers.
 * Numbering happens in the same transaction as the insert: a rolled-back issue leaves no gap.
 */
async function issueForPayment(
  db: Database,
  restaurantId: string,
  paymentId: string,
  issuer: Issuer,
  buyer: InvoiceParty | null,
) {
  return db.transaction((tx) => issueInTx(tx, restaurantId, paymentId, issuer, buyer));
}

/**
 * Same as above inside an open transaction: a sale recorded by the staff (till, table, order)
 * gets its invoice in the same transaction, so every manual sale is in the invoice list.
 */
export async function issueInvoiceInTx(
  tx: DbOrTx,
  restaurantId: string,
  paymentId: string,
  userId: string | null,
) {
  return issueInTx(
    tx,
    restaurantId,
    paymentId,
    userId ? { kind: "staff", userId } : { kind: "system" },
    null,
  );
}

async function issueInTx(
  tx: DbOrTx,
  restaurantId: string,
  paymentId: string,
  issuer: Issuer,
  buyer: InvoiceParty | null,
) {
  {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.restaurantId, restaurantId)))
      .for("update");
    if (!payment) throw notFound();
    const [existing] = await tx.select().from(invoices).where(eq(invoices.paymentId, paymentId));
    if (existing) {
      // Issued at the till without a buyer: naming it later keeps the same number.
      if (buyer && !existing.snapshot.buyer) {
        const [named] = await tx
          .update(invoices)
          .set({ snapshot: { ...existing.snapshot, buyer } })
          .where(eq(invoices.id, existing.id))
          .returning();
        return named!;
      }
      return existing;
    }
    if (payment.status === "refunded") throw conflict("payment_refunded");
    if (payment.status !== "succeeded" && payment.status !== "partially_refunded")
      throw conflict("payment_not_settled");

    const snapshot = await buildSnapshot(tx, restaurantId, payment, buyer);
    const [r] = await tx
      .select({ timezone: restaurants.timezone })
      .from(restaurants)
      .where(eq(restaurants.id, restaurantId));
    const issuedAt = new Date();
    const year = jalaliYear(issuedAt, r?.timezone ?? "Asia/Tehran");
    const seq = await nextInvoiceSeq(tx, restaurantId, year);
    const [created] = await tx
      .insert(invoices)
      .values({
        restaurantId,
        number: invoiceNumber(year, seq),
        seq,
        participantId: payment.participantId,
        tableSessionId: payment.tableSessionId,
        paymentId: payment.id,
        currency: snapshot.currency,
        totalCents: snapshot.totalCents,
        taxCents: snapshot.taxCents,
        snapshot,
        publicToken: randomToken(24),
        issuedAt,
      })
      .returning();
    const orderIds = await allocatedOrderIds(tx, payment.id);
    if (orderIds.length > 0) {
      await tx
        .insert(invoiceOrders)
        .values(orderIds.map((orderId) => ({ invoiceId: created!.id, orderId, restaurantId })));
    }
    await recordAudit(tx, {
      action: "invoice.issued",
      actorType: issuer.kind === "staff" ? "user" : issuer.kind,
      actorUserId: issuer.kind === "staff" ? issuer.userId : null,
      restaurantId,
      entityType: "invoice",
      entityId: created!.id,
      metadata: { number: created!.number, totalCents: created!.totalCents, buyer: Boolean(buyer) },
    });
    return created!;
  }
}

async function nextInvoiceSeq(tx: DbOrTx, restaurantId: string, year: number) {
  const result = await tx.execute<{ value: string }>(sql`
    INSERT INTO counters (restaurant_id, name, value) VALUES (${restaurantId}, ${`invoice:${year}`}, 1)
    ON CONFLICT (restaurant_id, name) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  return Number(result.rows[0]!.value);
}

async function allocatedOrderIds(tx: DbOrTx, paymentId: string) {
  const rows = await tx
    .select({ orderId: paymentAllocations.orderId })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId));
  return rows.map((r) => r.orderId);
}

async function buildSnapshot(
  tx: DbOrTx,
  restaurantId: string,
  payment: typeof payments.$inferSelect,
  buyer: InvoiceParty | null,
): Promise<InvoiceSnapshot> {
  const [rs] = await tx
    .select({ r: restaurants, s: restaurantSettings })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(restaurants.id, restaurantId));
  const orderIds = await allocatedOrderIds(tx, payment.id);
  const orderRows = orderIds.length
    ? await tx
        .select()
        .from(orders)
        .where(and(inArray(orders.id, orderIds), sql`${orders.status} <> 'cancelled'`))
        .orderBy(asc(orders.placedAt))
    : [];
  const items = orderRows.length
    ? await tx
        .select()
        .from(orderItems)
        .where(
          inArray(
            orderItems.orderId,
            orderRows.map((o) => o.id),
          ),
        )
        .orderBy(asc(orderItems.createdAt))
    : [];
  const [table] = payment.tableSessionId
    ? await tx
        .select({ label: diningTables.label })
        .from(tableSessions)
        .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
        .where(eq(tableSessions.id, payment.tableSessionId))
    : [];

  // VAT per order and per rate, exactly like the order totals were computed, then summed:
  // the invoice total always equals what was paid.
  const byRate = new Map<number, { base: number; tax: number }>();
  for (const o of orderRows) {
    const lines = items.filter((i) => i.orderId === o.id);
    const gross = new Map<number, number>();
    for (const l of lines) gross.set(l.taxRateBps, (gross.get(l.taxRateBps) ?? 0) + l.lineTotalCents);
    // A discount (till, coupon, points) lowers every rate's base in proportion.
    const linesTotal = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const factor = o.discountCents > 0 && linesTotal > 0 ? (linesTotal - o.discountCents) / linesTotal : 1;
    for (const [rate, full] of gross) {
      const amount = Math.round(full * factor);
      const tax = o.pricesIncludeTax ? taxFromGross(amount, rate) : taxFromNet(amount, rate);
      const base = o.pricesIncludeTax ? amount - tax : amount;
      const acc = byRate.get(rate) ?? { base: 0, tax: 0 };
      byRate.set(rate, { base: acc.base + base, tax: acc.tax + tax });
    }
  }
  const taxes = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBps, v]) => ({ rateBps, baseCents: v.base, taxCents: v.tax }));
  const taxCents = taxes.reduce((s, t) => s + t.taxCents, 0);
  const totalCents = orderRows.reduce((s, o) => s + o.totalCents, 0);
  const r = rs!.r;
  const st = rs!.s;
  return {
    version: 2,
    seller: {
      tradeName: r.name,
      name: st.legalName || r.name,
      nationalId: st.legalId,
      economicCode: st.vatNumber,
      registrationNumber: st.registrationNumber,
      address: [r.addressLine1, r.addressLine2].filter(Boolean).join("، ") || null,
      city: r.city,
      postalCode: r.postalCode,
      phone: r.phone,
    },
    buyer,
    tableLabel: table?.label ?? null,
    orders: orderRows.map((o) => ({ number: o.number, placedAt: o.placedAt.toISOString() })),
    lines: items.map((i) => ({
      name: i.productName,
      options: i.options.map((x) => x.valueName),
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents + i.optionsTotalCents,
      lineTotalCents: i.lineTotalCents,
      taxRateBps: i.taxRateBps,
    })),
    pricesIncludeTax: orderRows.every((o) => o.pricesIncludeTax),
    taxes,
    subtotalCents: items.reduce((s, i) => s + i.lineTotalCents, 0),
    discountCents: orderRows.reduce((sum, o) => sum + o.discountCents, 0),
    taxCents,
    totalCents,
    currency: payment.currency,
    payments: [
      {
        provider: payment.provider,
        amountCents: payment.amountCents,
        at: (payment.succeededAt ?? payment.createdAt).toISOString(),
        reference: typeof payment.metadata.refId === "string" ? payment.metadata.refId : null,
      },
    ],
    notes: st.legalNotice,
  };
}

/** Staff issues (or reopens) the invoice of a payment, optionally addressed to a named buyer. */
export async function issueInvoiceAsStaff(
  db: Database,
  ctx: RestaurantContext,
  paymentId: string,
  rawBuyer?: BuyerInput | null,
) {
  assertCan(ctx, "invoices.view");
  if (!isUuid(paymentId)) throw notFound();
  const buyer = rawBuyer ? buyerSchema.parse(rawBuyer) : null;
  return issueForPayment(db, ctx.restaurant.id, paymentId, { kind: "staff", userId: ctx.user.id }, buyer);
}

/** A guest gets the invoice of one of their own payments. */
export async function issueInvoiceAsGuest(db: Database, guest: GuestContext, paymentId: string) {
  if (!isUuid(paymentId)) throw notFound();
  const [p] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.participantId, guest.participant.id)));
  if (!p) throw notFound();
  return issueForPayment(db, guest.restaurant.id, paymentId, { kind: "guest" }, null);
}

/** Public, unguessable link (QR on the receipt, shared by the guest). */
export async function getInvoiceByToken(db: Database, token: string) {
  if (!/^[0-9A-Za-z]{16,32}$/.test(token)) return null;
  const [row] = await db
    .select({
      invoice: invoices,
      timezone: restaurants.timezone,
    })
    .from(invoices)
    .innerJoin(restaurants, eq(restaurants.id, invoices.restaurantId))
    .where(eq(invoices.publicToken, token));
  return row ?? null;
}

export async function listInvoices(db: Database, ctx: RestaurantContext, opts: { limit?: number } = {}) {
  assertCan(ctx, "invoices.view");
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      totalCents: invoices.totalCents,
      taxCents: invoices.taxCents,
      currency: invoices.currency,
      issuedAt: invoices.issuedAt,
      publicToken: invoices.publicToken,
      paymentId: invoices.paymentId,
      tableLabel: sql<string | null>`${invoices.snapshot}->>'tableLabel'`,
      buyerName: sql<string | null>`${invoices.snapshot}->'buyer'->>'name'`,
    })
    .from(invoices)
    .where(eq(invoices.restaurantId, ctx.restaurant.id))
    .orderBy(desc(invoices.issuedAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}

/** Invoice numbers already issued for a set of payments (payments page). */
export async function invoicesForPayments(db: Database, ctx: RestaurantContext, paymentIds: string[]) {
  assertCan(ctx, "payments.view");
  if (paymentIds.length === 0) return new Map<string, { number: string; publicToken: string }>();
  const rows = await db
    .select({ paymentId: invoices.paymentId, number: invoices.number, publicToken: invoices.publicToken })
    .from(invoices)
    .where(and(eq(invoices.restaurantId, ctx.restaurant.id), inArray(invoices.paymentId, paymentIds)));
  return new Map(rows.map((r) => [r.paymentId!, { number: r.number, publicToken: r.publicToken }]));
}
