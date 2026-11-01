import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { notifyTeam } from "@/server/modules/team/sections";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cashMovements,
  cashShifts,
  customers,
  diningTables,
  orderItems,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
  restaurantSettings,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { issueInvoiceInTx } from "@/server/modules/invoices/service";
import { emit, topics } from "@/server/infra/realtime";
import { sendToKitchen } from "@/server/modules/printing/service";
import { AppError, conflict, forbidden, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { MAX_AMOUNT_CENTS, taxFromGross, taxFromNet } from "@/lib/money";
import { normalizeIranMobile } from "@/lib/phone";
import { forChannel, loadPricedProducts } from "@/server/modules/menu/public";
import { computeTotals, priceLine, type PricedLine } from "@/server/modules/pricing";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { stationsOf } from "@/server/modules/kitchen/stations";
import { nutritionOf } from "@/server/modules/nutrition/service";
import { dinerForOrder } from "@/server/modules/diners/service";
import { applyOrderToStock } from "@/server/modules/inventory/service";
import {
  chargeAccount,
  commitDiscounts,
  computeDiscounts,
  linkOrderCustomer,
} from "@/server/modules/customers/service";
import { getZone, rememberAddress } from "@/server/modules/delivery/service";
import { emitPaymentUpdate, paymentConfig, settleAllocations } from "@/server/modules/payments/service";

const amount = z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS);

export const posOrderSchema = z.object({
  channel: z.enum(["dine_in", "takeaway", "delivery"]).default("takeaway"),
  /** Delivery: address text (snapshot), zone (fee), and whether to remember the address. */
  deliveryAddress: z.string().trim().max(500).default(""),
  deliveryZoneId: z.uuid().nullable().optional(),
  saveAddress: z.boolean().default(true),
  tableId: z.uuid().nullable().optional(),
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        optionValueIds: z.array(z.uuid()).max(50).default([]),
        quantity: z.number().int().min(1).max(99),
        note: z.string().trim().max(280).default(""),
      }),
    )
    .min(1)
    .max(100),
  note: z.string().trim().max(500).default(""),
  customerPhone: z
    .string()
    .trim()
    .max(32)
    .default("")
    .transform((v, ctx) => {
      if (!v) return null;
      const n = normalizeIranMobile(v);
      if (!n) ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return n;
    }),
  customerName: z.string().trim().max(120).default(""),
  /** Manual discount, percent of the bill. */
  discountPct: z.number().min(0).max(100).default(0),
  couponCode: z.string().trim().max(32).default(""),
  /** Loyalty points to spend (needs the customer's phone). */
  redeemPoints: z.number().int().min(0).max(1_000_000).default(0),
  /** Set → the order is paid on the spot. */
  payment: z
    .object({
      /** "account": put on the customer's house account (نسیه), within their credit limit. */
      provider: z.enum(["cash", "on_site_terminal", "account"]),
      tenderedCents: amount.nullable().optional(),
    })
    .nullable()
    .optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});
export type PosOrderInput = z.input<typeof posOrderSchema>;

/**
 * Rings up an order at the till (counter, phone, takeaway or for a table). Prices come from the
 * database exactly like a guest order; when `payment` is set the order is settled in the same
 * transaction, so a sale is never half recorded.
 */
export async function createPosOrder(db: Database, ctx: RestaurantContext, raw: PosOrderInput) {
  assertCan(ctx, "orders.create");
  const input = posOrderSchema.parse(raw);
  if (input.payment) assertCan(ctx, "payments.record");
  const rid = ctx.restaurant.id;
  if (input.payment) {
    const config = await paymentConfig(db, rid);
    if (input.payment.provider === "account") {
      if (!input.customerPhone) throw new AppError("VALIDATION", "phone_required", { field: "phone" });
    } else if (!config.offline.includes(input.payment.provider)) throw forbidden("payment_method_disabled");
  }

  if (input.channel === "delivery") {
    if (!input.customerPhone) throw new AppError("VALIDATION", "phone_required", { field: "phone" });
    if (input.deliveryAddress.length < 5)
      throw new AppError("VALIDATION", "address_required", { field: "address" });
  }

  return db.transaction(async (tx) => {
    let table: { id: string; label: string; kind: string } | null = null;
    let sessionId: string | null = null;
    if (input.channel === "dine_in" && input.tableId) {
      const [t] = await tx
        .select({ id: diningTables.id, label: diningTables.label, kind: diningTables.kind })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.id, input.tableId),
            eq(diningTables.restaurantId, rid),
            isNull(diningTables.deletedAt),
          ),
        );
      if (!t) throw notFound();
      table = t;
      sessionId = await seatTable(tx, rid, t.id);
    }

    const products = await loadPricedProducts(tx, rid, {
      productIds: [...new Set(input.lines.map((l) => l.productId))],
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines: {
      item: (typeof input.lines)[number];
      line: PricedLine;
      name: string;
      categoryId: string;
      categoryName: string;
    }[] = [];
    for (const item of input.lines) {
      const base = byId.get(item.productId);
      const product = base ? forChannel(base, input.channel) : undefined;
      const priced = product ? priceLine(product, item.optionValueIds, item.quantity) : null;
      if (!product || !priced?.ok) throw conflict("product_unavailable", { productId: item.productId });
      lines.push({
        item,
        line: priced.line,
        name: product.name,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
      });
    }

    const [settings] = await tx
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, rid));
    const pricesIncludeTax = settings?.pricesIncludeTax ?? true;
    const totals = computeTotals(
      lines.map((l) => l.line),
      pricesIncludeTax,
    );
    const manualCents = Math.round(totals.totalCents * (input.discountPct / 100));
    const [known] = input.customerPhone
      ? await tx
          .select({ id: customers.id, points: customers.points })
          .from(customers)
          .where(and(eq(customers.restaurantId, rid), eq(customers.phone, input.customerPhone)))
      : [];
    const extra = await computeDiscounts(tx, rid, {
      totalCents: totals.totalCents - manualCents,
      couponCode: input.couponCode,
      redeemPoints: input.redeemPoints,
      customer: known ?? null,
    });
    const discountCents = manualCents + extra.discountCents;
    const zone =
      input.channel === "delivery" && input.deliveryZoneId
        ? await getZone(tx, rid, input.deliveryZoneId)
        : null;
    if (zone && totals.totalCents - discountCents < zone.minOrderCents)
      throw new AppError("VALIDATION", "below_zone_minimum", { amountCents: zone.minOrderCents });
    const deliveryFeeCents = zone?.feeCents ?? 0;
    const totalCents = totals.totalCents - discountCents + deliveryFeeCents;
    const taxCents =
      totals.totalCents > 0
        ? Math.round(totals.taxCents * ((totalCents - deliveryFeeCents) / totals.totalCents))
        : 0;
    const seq = await nextCounterValue(tx, rid, "order", 1001);
    const number = `${settings?.orderPrefix ?? "A"}-${seq}`;
    const now = new Date();

    const [order] = await tx
      .insert(orders)
      .values({
        restaurantId: rid,
        number,
        seq,
        channel: input.channel,
        tableId: table?.id ?? null,
        tableSessionId: sessionId,
        tableLabel: table?.label ?? null,
        placeKind: table?.kind === "room" ? "room" : null,
        status: "accepted",
        acceptedAt: now,
        paymentStatus: "unpaid",
        currency: ctx.restaurant.currency,
        subtotalCents: totals.subtotalCents,
        discountCents,
        taxCents,
        totalCents,
        pricesIncludeTax,
        note: input.note || null,
        customerPhone: input.customerPhone,
        dinerId: await dinerForOrder(tx, { phone: input.customerPhone }),
        createdByUserId: ctx.user.id,
        ...(input.channel === "delivery"
          ? { deliveryAddress: input.deliveryAddress, deliveryZoneId: zone?.id ?? null, deliveryFeeCents }
          : {}),
      })
      .returning();

    const stations = await stationsOf(
      tx,
      rid,
      lines.map((l) => l.item.productId),
    );
    const nutrition = await nutritionOf(
      tx,
      rid,
      lines.map((l) => l.item.productId),
    );
    await tx.insert(orderItems).values(
      lines.map(({ item, line, name, categoryId, categoryName }) => ({
        restaurantId: rid,
        orderId: order!.id,
        productId: item.productId,
        categoryId,
        productName: name,
        categoryName,
        stationId: stations.get(item.productId) ?? null,
        nutrition: nutrition.get(item.productId) ?? null,
        unitPriceCents: line.unitPriceCents,
        optionsTotalCents: line.optionsTotalCents,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents,
        taxRateBps: line.taxRateBps,
        taxCents: pricesIncludeTax
          ? taxFromGross(line.lineTotalCents, line.taxRateBps)
          : taxFromNet(line.lineTotalCents, line.taxRateBps),
        options: line.selections,
        note: item.note || null,
      })),
    );
    await tx.insert(orderStatusEvents).values({
      restaurantId: rid,
      orderId: order!.id,
      fromStatus: null,
      toStatus: "accepted",
      actorUserId: ctx.user.id,
    });
    await applyOrderToStock(tx, rid, order!.id, -1);
    const customer = input.customerPhone
      ? await linkOrderCustomer(tx, rid, order!.id, input.customerPhone, input.customerName)
      : null;
    if (customer && input.channel === "delivery" && input.saveAddress)
      await rememberAddress(tx, rid, customer.id, input.deliveryAddress, zone?.id ?? null);
    await commitDiscounts(
      tx,
      rid,
      order!.id,
      { couponId: extra.couponId, pointsRedeemed: extra.pointsRedeemed, customerId: customer?.id ?? null },
      ctx.user.id,
    );

    let payment: typeof payments.$inferSelect | null = null;
    if (input.payment && totalCents > 0) {
      const tendered = input.payment.tenderedCents ?? null;
      if (input.payment.provider === "cash" && tendered != null && tendered < totalCents)
        throw new AppError("VALIDATION", "tendered_too_low", { amountCents: totalCents });
      if (input.payment.provider === "account")
        await chargeAccount(tx, rid, customer!.id, order!.id, totalCents, ctx.user.id);
      [payment] = await tx
        .insert(payments)
        .values({
          restaurantId: rid,
          tableSessionId: sessionId,
          provider: input.payment.provider,
          status: "succeeded",
          succeededAt: now,
          amountCents: totalCents,
          currency: ctx.restaurant.currency,
          idempotencyKey: input.idempotencyKey,
          recordedByUserId: ctx.user.id,
          metadata: { pos: true, ...(tendered != null ? { tenderedCents: tendered } : {}) },
        })
        .returning();
      await tx.insert(paymentAllocations).values({
        restaurantId: rid,
        paymentId: payment!.id,
        orderId: order!.id,
        amountCents: totalCents,
      });
      await settleAllocations(tx, payment!, ctx.user.id);
      await emitPaymentUpdate(tx, payment!);
      // Every sale at the till has its invoice (Invoices page), nameable later.
      await issueInvoiceInTx(tx, rid, payment!.id, ctx.user.id);
    }

    await notifyTeam(
      tx,
      {
        restaurantId: rid,
        type: "order.created",
        payload: {
          orderId: order!.id,
          number,
          tableLabel: table?.label ?? null,
          ...(table?.kind === "room" ? { place: "room" } : {}),
          totalCents,
          source: "pos",
        },
      },
      { orderId: order!.id },
    );
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "order.created",
      data: {
        orderId: order!.id,
        number,
        tableId: table?.id ?? null,
        tableLabel: table?.label ?? "",
        source: "pos",
      },
    });
    // Rung up at the till: already accepted, straight to the kitchen and bar.
    await sendToKitchen(tx, rid, {
      id: order!.id,
      number,
      tableLabel: table?.label ?? null,
      placeKind: table?.kind,
    });
    await recordAudit(tx, {
      action: "order.pos_created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "order",
      entityId: order!.id,
      metadata: {
        number,
        totalCents,
        discountCents,
        paid: Boolean(payment),
        provider: input.payment?.provider ?? null,
      },
    });
    return { order: order!, payment };
  });
}

/**
 * The table's open session, opened when the waiter or the till orders for a free table: the
 * table shows as occupied, and its bill gathers every round until it is closed.
 */
export async function seatTable(tx: DbOrTx, restaurantId: string, tableId: string) {
  const current = async () =>
    (
      await tx
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.status, "open")))
    )[0]?.id ?? null;
  const open = await current();
  if (open) {
    // The staff seating a table also lets a guest-opened one order (anti-abuse option).
    await tx
      .update(tableSessions)
      .set({ lastActivityAt: new Date(), confirmedAt: sql`coalesce(${tableSessions.confirmedAt}, now())` })
      .where(eq(tableSessions.id, open));
    return open;
  }
  // A guest scanning the QR at the same instant may win the one-open-session index.
  const [created] = await tx
    .insert(tableSessions)
    .values({ restaurantId, tableId })
    .onConflictDoNothing()
    .returning({ id: tableSessions.id });
  if (created)
    await emit(tx, { topic: topics.restaurant(restaurantId), type: "session.opened", data: { tableId } });
  return created?.id ?? (await current());
}

// ─── Cash drawer ─────────────────────────────────────────────────────────────

export async function getOpenShift(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const [shift] = await db
    .select()
    .from(cashShifts)
    .where(and(eq(cashShifts.restaurantId, ctx.restaurant.id), isNull(cashShifts.closedAt)));
  return shift ?? null;
}

/** Sales and drawer movements of a shift, and the cash that should be in the drawer. */
export async function shiftSummary(db: DbOrTx, shift: typeof cashShifts.$inferSelect, until = new Date()) {
  const end = shift.closedAt ?? until;
  const byProvider = await db
    .select({
      provider: payments.provider,
      total: sql<number>`coalesce(sum(${payments.amountCents} - ${payments.refundedCents}), 0)`.mapWith(
        Number,
      ),
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.restaurantId, shift.restaurantId),
        sql`${payments.status} in ('succeeded', 'partially_refunded', 'refunded')`,
        gte(payments.succeededAt, shift.openedAt),
        lte(payments.succeededAt, end),
      ),
    )
    .groupBy(payments.provider);
  const moves = await db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.shiftId, shift.id))
    .orderBy(desc(cashMovements.createdAt));
  const cashSales = byProvider.find((p) => p.provider === "cash")?.total ?? 0;
  const moveIn = moves.filter((m) => m.direction === "in").reduce((s, m) => s + m.amountCents, 0);
  const moveOut = moves.filter((m) => m.direction === "out").reduce((s, m) => s + m.amountCents, 0);
  return {
    byProvider,
    cashSales,
    totalSales: byProvider.reduce((s, p) => s + p.total, 0),
    movements: moves,
    moveIn,
    moveOut,
    expectedCash: shift.openingFloatCents + cashSales + moveIn - moveOut,
  };
}

export async function openShift(db: Database, ctx: RestaurantContext, raw: { openingFloatCents: number }) {
  assertCan(ctx, "cash.manage");
  const floatCents = amount.parse(raw.openingFloatCents);
  if (await getOpenShift(db, ctx)) throw conflict("shift_already_open");
  const [shift] = await db
    .insert(cashShifts)
    .values({ restaurantId: ctx.restaurant.id, openedByUserId: ctx.user.id, openingFloatCents: floatCents })
    .returning();
  await recordAudit(db, {
    action: "cash.shift_opened",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "cash_shift",
    entityId: shift!.id,
    metadata: { openingFloatCents: floatCents },
  });
  return shift!;
}

export const movementSchema = z.object({
  direction: z.enum(["in", "out"]),
  amountCents: amount.refine((v) => v > 0),
  reason: z.string().trim().min(2).max(200),
});

export async function addCashMovement(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof movementSchema>,
) {
  assertCan(ctx, "cash.manage");
  const input = movementSchema.parse(raw);
  const shift = await getOpenShift(db, ctx);
  if (!shift) throw conflict("no_open_shift");
  const [m] = await db
    .insert(cashMovements)
    .values({ restaurantId: ctx.restaurant.id, shiftId: shift.id, userId: ctx.user.id, ...input })
    .returning();
  return m!;
}

export async function closeShift(
  db: Database,
  ctx: RestaurantContext,
  raw: { countedCashCents: number; note?: string },
) {
  assertCan(ctx, "cash.manage");
  const counted = amount.parse(raw.countedCashCents);
  return db.transaction(async (tx) => {
    const [shift] = await tx
      .select()
      .from(cashShifts)
      .where(and(eq(cashShifts.restaurantId, ctx.restaurant.id), isNull(cashShifts.closedAt)))
      .for("update");
    if (!shift) throw conflict("no_open_shift");
    const now = new Date();
    const summary = await shiftSummary(tx, shift, now);
    const [closed] = await tx
      .update(cashShifts)
      .set({
        closedAt: now,
        closedByUserId: ctx.user.id,
        expectedCashCents: summary.expectedCash,
        countedCashCents: counted,
        note: raw.note?.trim().slice(0, 500) || null,
      })
      .where(eq(cashShifts.id, shift.id))
      .returning();
    await recordAudit(tx, {
      action: "cash.shift_closed",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "cash_shift",
      entityId: shift.id,
      metadata: { expected: summary.expectedCash, counted, difference: counted - summary.expectedCash },
    });
    return { shift: closed!, summary };
  });
}

export async function listShifts(db: Database, ctx: RestaurantContext, limit = 20) {
  assertCan(ctx, "cash.manage");
  return db
    .select()
    .from(cashShifts)
    .where(eq(cashShifts.restaurantId, ctx.restaurant.id))
    .orderBy(desc(cashShifts.openedAt))
    .limit(limit);
}
