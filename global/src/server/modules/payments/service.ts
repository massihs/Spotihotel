import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  notifications,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
  refunds,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { getEntitlements, hasFeature } from "@/server/entitlements";
import { AppError, conflict, forbidden, notFound, validation } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import { availableOnlineProviders, getProvider, type ProviderCode } from "@/server/infra/payments/registry";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import type { GuestContext } from "@/server/modules/guest/sessions";

/** An online checkout left unfinished for longer than this is abandoned (orders become payable again). */
export const PENDING_TTL_MINUTES = 35;

const ONLINE_CODES = ["stripe", "zarinpal", "mock_online"] as const;
const OFFLINE_CODES = ["cash", "on_site_terminal"] as const;
type OnlineCode = (typeof ONLINE_CODES)[number];
type OfflineCode = (typeof OFFLINE_CODES)[number];

const PAYABLE = sql`${orders.status} <> 'cancelled' and ${orders.paymentStatus} = 'unpaid'`;

type Tx = DbOrTx;

// ─── Payable orders ──────────────────────────────────────────────────────────

/**
 * Locks and returns the orders a payment would cover. Row locks + the `unpaid` re-check make
 * two concurrent payments (a guest online and a waiter in cash) unable to cover the same order.
 */
async function lockPayableOrders(
  tx: Tx,
  restaurantId: string,
  sessionId: string,
  participantId: string | null,
) {
  return tx
    .select({ id: orders.id, number: orders.number, totalCents: orders.totalCents, status: orders.status })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        eq(orders.tableSessionId, sessionId),
        participantId ? eq(orders.participantId, participantId) : undefined,
        PAYABLE,
      ),
    )
    .orderBy(asc(orders.placedAt))
    .for("update");
}

/** Abandoned online checkouts of a session release their orders. */
async function expireStalePending(tx: Tx, restaurantId: string, sessionId: string) {
  const stale = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.restaurantId, restaurantId),
        eq(payments.tableSessionId, sessionId),
        inArray(payments.status, ["pending", "requires_action"]),
        lt(payments.createdAt, new Date(Date.now() - PENDING_TTL_MINUTES * 60_000)),
      ),
    );
  for (const p of stale) await releasePayment(tx, p.id, "cancelled", "expired");
}

/** Marks a not-yet-succeeded payment failed/cancelled and puts its orders back to "unpaid". */
async function releasePayment(tx: Tx, paymentId: string, status: "failed" | "cancelled", reason: string) {
  const [updated] = await tx
    .update(payments)
    .set({ status, failureReason: reason.slice(0, 500) })
    .where(and(eq(payments.id, paymentId), inArray(payments.status, ["pending", "requires_action"])))
    .returning();
  if (!updated) return null;
  const alloc = await tx
    .select({ orderId: paymentAllocations.orderId })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId));
  if (alloc.length > 0) {
    await tx
      .update(orders)
      .set({ paymentStatus: "unpaid" })
      .where(
        and(
          inArray(
            orders.id,
            alloc.map((a) => a.orderId),
          ),
          eq(orders.paymentStatus, "pending"),
        ),
      );
  }
  await emitPaymentUpdate(tx, updated);
  return updated;
}

async function emitPaymentUpdate(tx: Tx, p: typeof payments.$inferSelect) {
  await emit(tx, {
    topic: topics.restaurant(p.restaurantId),
    type: "payment.updated",
    data: { paymentId: p.id, status: p.status },
  });
  if (p.participantId) {
    await emit(tx, {
      topic: topics.participant(p.participantId),
      type: "payment.updated",
      data: { paymentId: p.id, status: p.status },
    });
  }
  if (p.tableSessionId) {
    await emit(tx, { topic: topics.session(p.tableSessionId), type: "payment.updated" });
  }
}

/**
 * Applies a succeeded payment to its orders: they become "paid", and orders waiting for
 * payment (requirePaymentBeforeOrder) are released to the kitchen.
 * Returns the orders that could NOT be marked paid (already paid by someone else).
 */
async function settleAllocations(tx: Tx, p: typeof payments.$inferSelect, actorUserId: string | null) {
  const alloc = await tx
    .select({ orderId: paymentAllocations.orderId })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, p.id));
  const ids = alloc.map((a) => a.orderId);
  if (ids.length === 0) return [];
  const settled = await tx
    .update(orders)
    .set({ paymentStatus: "paid" })
    .where(and(inArray(orders.id, ids), inArray(orders.paymentStatus, ["unpaid", "pending"])))
    .returning({
      id: orders.id,
      status: orders.status,
      participantId: orders.participantId,
      tableId: orders.tableId,
    });

  for (const o of settled) {
    if (o.status === "pending_payment") {
      await tx
        .update(orders)
        .set({ status: "received" })
        .where(and(eq(orders.id, o.id), eq(orders.status, "pending_payment")));
      await tx.insert(orderStatusEvents).values({
        restaurantId: p.restaurantId,
        orderId: o.id,
        fromStatus: "pending_payment",
        toStatus: "received",
        actorUserId,
      });
    }
    await emit(tx, {
      topic: topics.restaurant(p.restaurantId),
      type: "order.updated",
      data: { orderId: o.id, tableId: o.tableId },
    });
    if (o.participantId) {
      await emit(tx, {
        topic: topics.participant(o.participantId),
        type: "order.updated",
        data: { orderId: o.id },
      });
    }
  }
  const settledIds = new Set(settled.map((o) => o.id));
  return ids.filter((id) => !settledIds.has(id));
}

async function tableLabelOf(tx: Tx, sessionId: string | null) {
  if (!sessionId) return null;
  const [row] = await tx
    .select({ label: diningTables.label })
    .from(tableSessions)
    .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
    .where(eq(tableSessions.id, sessionId));
  return row?.label ?? null;
}

async function notifyPayment(
  tx: Tx,
  p: typeof payments.$inferSelect,
  type: "payment.received" | "payment.needs_review",
  extra: Record<string, unknown> = {},
) {
  await tx.insert(notifications).values({
    restaurantId: p.restaurantId,
    type,
    payload: {
      paymentId: p.id,
      provider: p.provider,
      amountCents: p.amountCents,
      currency: p.currency,
      tableLabel: await tableLabelOf(tx, p.tableSessionId),
      ...extra,
    },
  });
  await emit(tx, { topic: topics.restaurant(p.restaurantId), type: "notification.created" });
}

// ─── Guest side ──────────────────────────────────────────────────────────────

async function paymentConfig(db: DbOrTx, restaurantId: string) {
  const [settings] = await db
    .select({
      onlinePaymentEnabled: restaurantSettings.onlinePaymentEnabled,
      enabledPaymentProviders: restaurantSettings.enabledPaymentProviders,
      requirePaymentBeforeOrder: restaurantSettings.requirePaymentBeforeOrder,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  const entitlements = await getEntitlements(db, restaurantId);
  const enabled = settings?.enabledPaymentProviders ?? ["cash", "on_site_terminal"];
  const deployment = availableOnlineProviders();
  const onlineAllowed =
    Boolean(settings?.onlinePaymentEnabled) && hasFeature(entitlements, "online_payments");
  const online = onlineAllowed
    ? ONLINE_CODES.filter((c) => enabled.includes(c) && deployment.includes(c))
    : [];
  return {
    online: online as OnlineCode[],
    offline: OFFLINE_CODES.filter((c) => enabled.includes(c)) as OfflineCode[],
    payLater: enabled.includes("pay_later"),
    requirePaymentBeforeOrder: settings?.requirePaymentBeforeOrder ?? false,
  };
}

/** What the guest owes and how they can pay. Amounts are always computed here, never by the client. */
export async function getGuestPaymentState(db: Database, guest: GuestContext) {
  const [config, rows, pending, history] = await Promise.all([
    paymentConfig(db, guest.restaurant.id),
    db
      .select({
        id: orders.id,
        number: orders.number,
        totalCents: orders.totalCents,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(
        and(
          eq(orders.participantId, guest.participant.id),
          eq(orders.tableSessionId, guest.session.id),
          sql`${orders.status} <> 'cancelled'`,
        ),
      ),
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.participantId, guest.participant.id),
          inArray(payments.status, ["pending", "requires_action"]),
          sql`${payments.createdAt} >= ${new Date(Date.now() - PENDING_TTL_MINUTES * 60_000)}`,
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1),
    db
      .select({
        id: payments.id,
        provider: payments.provider,
        status: payments.status,
        amountCents: payments.amountCents,
        refundedCents: payments.refundedCents,
        succeededAt: payments.succeededAt,
      })
      .from(payments)
      .where(
        and(
          eq(payments.tableSessionId, guest.session.id),
          eq(payments.participantId, guest.participant.id),
          inArray(payments.status, ["succeeded", "partially_refunded", "refunded"]),
        ),
      )
      .orderBy(desc(payments.succeededAt)),
  ]);
  const dueCents = rows.filter((o) => o.paymentStatus === "unpaid").reduce((s, o) => s + o.totalCents, 0);
  const pendingPayment = pending[0]
    ? {
        id: pending[0].id,
        amountCents: pending[0].amountCents,
        redirectUrl: (pending[0].metadata.redirectUrl as string | undefined) ?? null,
      }
    : null;
  return {
    dueCents,
    pendingCents: rows.filter((o) => o.paymentStatus === "pending").reduce((s, o) => s + o.totalCents, 0),
    paidCents: history.reduce((s, p) => s + p.amountCents - p.refundedCents, 0),
    pending: pendingPayment,
    history,
    methods: config,
  };
}

/** Status of one of the guest's payments (return page after the PSP). */
export async function getGuestPaymentStatus(db: Database, guest: GuestContext, paymentId: string) {
  if (!isUuid(paymentId)) return null;
  const [p] = await db
    .select({ id: payments.id, status: payments.status, amountCents: payments.amountCents })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.participantId, guest.participant.id)));
  return p ?? null;
}

/** For the simulated PSP page: no guest cookie there, access is granted by the signed link. */
export async function getPaymentForCheckout(db: Database, paymentId: string) {
  if (!isUuid(paymentId)) return null;
  const [p] = await db
    .select({
      id: payments.id,
      status: payments.status,
      provider: payments.provider,
      amountCents: payments.amountCents,
      currency: payments.currency,
      restaurantName: sql<string>`(select r.name from restaurants r where r.id = ${payments.restaurantId})`,
    })
    .from(payments)
    .where(eq(payments.id, paymentId));
  return p ?? null;
}

export const startOnlinePaymentSchema = z.object({
  provider: z.enum(ONLINE_CODES),
  /** Generated when the pay button is rendered: a double tap reuses the same checkout. */
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/**
 * Starts an online payment for everything the participant owes.
 * 1. (tx) lock the participant's unpaid orders, create the payment + allocations, mark orders "pending"
 * 2. call the PSP outside the transaction (no lock held during a network call)
 * 3. store the PSP reference/redirect, or release the orders if the PSP refused
 */
export async function startOnlinePayment(
  db: Database,
  guest: GuestContext,
  raw: z.input<typeof startOnlinePaymentSchema>,
  opts: { returnUrl: string },
) {
  const input = startOnlinePaymentSchema.parse(raw);
  const rid = guest.restaurant.id;
  const config = await paymentConfig(db, rid);
  if (!config.online.includes(input.provider)) throw forbidden("online_payment_unavailable");
  const provider = getProvider(input.provider);
  if (!provider || provider.kind !== "online") throw forbidden("online_payment_unavailable");

  // Same key again (double tap, refresh): hand back the existing checkout.
  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.restaurantId, rid), eq(payments.idempotencyKey, input.idempotencyKey)));
  if (existing) {
    if (existing.participantId !== guest.participant.id) throw notFound();
    const redirectUrl = existing.metadata.redirectUrl as string | undefined;
    if (redirectUrl && (existing.status === "pending" || existing.status === "requires_action"))
      return { paymentId: existing.id, redirectUrl };
    throw conflict("payment_already_processed", { status: existing.status });
  }

  const payment = await db.transaction(async (tx) => {
    await expireStalePending(tx, rid, guest.session.id);
    const due = await lockPayableOrders(tx, rid, guest.session.id, guest.participant.id);
    const amountCents = due.reduce((s, o) => s + o.totalCents, 0);
    if (amountCents <= 0) throw conflict("nothing_to_pay");

    const [created] = await tx
      .insert(payments)
      .values({
        restaurantId: rid,
        tableSessionId: guest.session.id,
        participantId: guest.participant.id,
        provider: input.provider,
        status: "pending",
        amountCents,
        currency: guest.restaurant.currency,
        idempotencyKey: input.idempotencyKey,
        metadata: { merchantAccount: null },
      })
      .returning();
    await tx.insert(paymentAllocations).values(
      due.map((o) => ({
        restaurantId: rid,
        paymentId: created!.id,
        orderId: o.id,
        amountCents: o.totalCents,
      })),
    );
    await tx
      .update(orders)
      .set({ paymentStatus: "pending" })
      .where(
        inArray(
          orders.id,
          due.map((o) => o.id),
        ),
      );
    await recordAudit(tx, {
      action: "payment.started",
      actorType: "guest",
      restaurantId: rid,
      entityType: "payment",
      entityId: created!.id,
      metadata: { provider: input.provider, amountCents, orders: due.map((o) => o.number) },
    });
    return { ...created!, orderNumbers: due.map((o) => o.number) };
  });

  const returnUrl = new URL(opts.returnUrl);
  returnUrl.searchParams.set("payment", payment.id);
  const callbackUrl = new URL(`/api/v1/payments/return/${input.provider}`, returnUrl.origin);
  callbackUrl.searchParams.set("payment", payment.id);
  try {
    const result = await provider.createPayment({
      paymentId: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      description:
        `${guest.restaurant.name} · ${guest.table.label} · ${payment.orderNumbers.join(", ")}`.slice(0, 250),
      returnUrl: returnUrl.toString(),
      callbackUrl: callbackUrl.toString(),
      idempotencyKey: `create_${payment.id}`,
      merchantAccount: null,
    });
    if (result.status === "succeeded") {
      await confirmPayment(db, {
        paymentId: payment.id,
        provider: input.provider,
        providerRef: result.providerRef ?? null,
      });
      return { paymentId: payment.id, redirectUrl: returnUrl.toString() };
    }
    await db
      .update(payments)
      .set({
        status: "requires_action",
        providerRef: result.providerRef,
        metadata: { ...payment.metadata, redirectUrl: result.redirectUrl, returnUrl: returnUrl.toString() },
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
    return { paymentId: payment.id, redirectUrl: result.redirectUrl };
  } catch (err) {
    await db.transaction((tx) => releasePayment(tx, payment.id, "failed", "provider_error"));
    throw new AppError("CONFLICT", "payment_provider_error", {
      cause: err instanceof Error ? err.message : "unknown",
    });
  }
}

/** The guest gives up on a checkout in progress: their orders become payable again. */
export async function cancelGuestPayment(db: Database, guest: GuestContext, paymentId: string) {
  if (!isUuid(paymentId)) throw notFound();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.participantId, guest.participant.id)));
    if (!p) throw notFound();
    const released = await releasePayment(tx, paymentId, "cancelled", "cancelled_by_guest");
    if (!released) throw conflict("payment_already_processed");
    return released;
  });
}

export const requestPaymentSchema = z.object({
  method: z.enum(["cash", "card", "any"]).default("any"),
});

/** "Pay at the table": notifies the team that this guest wants to pay (bill / terminal / cash). */
export async function requestPaymentAtTable(
  db: Database,
  guest: GuestContext,
  raw: z.input<typeof requestPaymentSchema> = {},
) {
  const input = requestPaymentSchema.parse(raw);
  const state = await getGuestPaymentState(db, guest);
  if (state.dueCents <= 0) throw conflict("nothing_to_pay");
  await db.transaction(async (tx) => {
    await tx.insert(notifications).values({
      restaurantId: guest.restaurant.id,
      type: "payment.requested",
      payload: {
        tableId: guest.table.id,
        tableLabel: guest.table.label,
        seq: guest.participant.seq,
        displayName: guest.participant.displayName,
        amountCents: state.dueCents,
        currency: guest.restaurant.currency,
        method: input.method,
      },
    });
    await emit(tx, { topic: topics.restaurant(guest.restaurant.id), type: "notification.created" });
  });
  return { dueCents: state.dueCents };
}

// ─── PSP callbacks (webhooks, mock page) ─────────────────────────────────────

/**
 * Marks a payment succeeded. Idempotent: a webhook delivered twice (or the redirect racing
 * the webhook) applies once, thanks to the conditional UPDATE on the payment status.
 * A late success on an expired/cancelled checkout is still accepted (the money was taken);
 * orders already paid meanwhile are reported to the team for a refund.
 */
export async function confirmPayment(
  db: Database,
  input: {
    paymentId: string;
    provider: string;
    providerRef: string | null;
    amountCents?: number;
    extra?: Record<string, string>;
  },
) {
  if (!isUuid(input.paymentId)) throw notFound();
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
    if (!current || current.provider !== input.provider) throw notFound();
    if (
      current.status === "succeeded" ||
      current.status === "refunded" ||
      current.status === "partially_refunded"
    )
      return { payment: current, applied: false };
    if (input.amountCents !== undefined && input.amountCents !== current.amountCents) {
      await notifyPayment(tx, current, "payment.needs_review", {
        reason: "amount_mismatch",
        capturedCents: input.amountCents,
      });
      await recordAudit(tx, {
        action: "payment.amount_mismatch",
        restaurantId: current.restaurantId,
        entityType: "payment",
        entityId: current.id,
        metadata: { expected: current.amountCents, captured: input.amountCents },
      });
      return { payment: current, applied: false };
    }

    const [updated] = await tx
      .update(payments)
      .set({
        status: "succeeded",
        succeededAt: new Date(),
        failureReason: null,
        providerRef: input.providerRef ?? current.providerRef,
        metadata: { ...current.metadata, ...(input.extra ?? {}) },
      })
      .where(and(eq(payments.id, current.id), eq(payments.status, current.status)))
      .returning();
    if (!updated) return { payment: current, applied: false };

    const unsettled = await settleAllocations(tx, updated, null);
    await notifyPayment(tx, updated, "payment.received");
    if (unsettled.length > 0) {
      await notifyPayment(tx, updated, "payment.needs_review", {
        reason: "already_paid",
        orders: unsettled.length,
      });
    }
    await emitPaymentUpdate(tx, updated);
    await recordAudit(tx, {
      action: "payment.succeeded",
      restaurantId: updated.restaurantId,
      entityType: "payment",
      entityId: updated.id,
      metadata: { provider: updated.provider, amountCents: updated.amountCents, lateFrom: current.status },
    });
    return { payment: updated, applied: true };
  });
}

export async function failPayment(
  db: Database,
  input: { paymentId: string; provider: string; reason?: string },
) {
  if (!isUuid(input.paymentId)) throw notFound();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ provider: payments.provider })
      .from(payments)
      .where(eq(payments.id, input.paymentId));
    if (!current || current.provider !== input.provider) throw notFound();
    return releasePayment(tx, input.paymentId, "failed", input.reason ?? "failed");
  });
}

/**
 * Redirect-based PSPs (Zarinpal): the guest comes back to our callback; the provider confirms
 * the outcome server-to-server, then we apply it. Returns where to send the guest.
 * Safe to hit twice (refresh): confirmation is idempotent and a settled payment is not re-verified.
 */
export async function handlePaymentReturn(db: Database, providerCode: string, query: URLSearchParams) {
  const provider = getProvider(providerCode);
  const paymentId = query.get("payment") ?? "";
  if (!provider?.verifyReturn || !isUuid(paymentId)) throw notFound();
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p || p.provider !== providerCode) throw notFound();
  const returnUrl = typeof p.metadata.returnUrl === "string" ? p.metadata.returnUrl : null;
  if (p.status === "pending" || p.status === "requires_action") {
    const event = await provider.verifyReturn({
      query,
      payment: { id: p.id, amountCents: p.amountCents, currency: p.currency, providerRef: p.providerRef },
    });
    if (event.type === "payment.succeeded") {
      await confirmPayment(db, {
        paymentId: p.id,
        provider: providerCode,
        providerRef: event.providerRef,
        amountCents: event.amountCents,
        extra: event.extra,
      });
    } else if (event.type === "payment.failed") {
      await failPayment(db, { paymentId: p.id, provider: providerCode, reason: event.reason });
    }
  }
  return { paymentId: p.id, returnUrl };
}

/** Normalized webhook handling for any provider: verify → parse → apply. */
export async function handleWebhook(db: Database, providerCode: string, rawBody: string, headers: Headers) {
  const provider = getProvider(providerCode);
  if (!provider?.parseWebhook) throw notFound();
  let event;
  try {
    event = await provider.parseWebhook(rawBody, headers);
  } catch {
    throw new AppError("UNAUTHENTICATED", "invalid_signature");
  }
  if (event.type === "ignored") return { handled: false };
  try {
    if (event.type === "payment.succeeded") {
      await confirmPayment(db, {
        paymentId: event.paymentId,
        provider: providerCode,
        providerRef: event.providerRef,
        amountCents: event.amountCents,
        extra: event.extra,
      });
    } else {
      await failPayment(db, { paymentId: event.paymentId, provider: providerCode, reason: event.reason });
    }
  } catch (err) {
    // Unknown payment id (other environment sharing the PSP account): acknowledge, do not retry forever.
    if (err instanceof AppError && err.code === "NOT_FOUND") return { handled: false };
    throw err;
  }
  return { handled: true };
}

// ─── Staff side ──────────────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  tableSessionId: z.uuid(),
  /** Omitted → the whole table pays (every participant's unpaid orders). */
  participantId: z.uuid().nullable().optional(),
  provider: z.enum(OFFLINE_CODES),
  /** Cash handed over, for the change shown on screen. Informational. */
  tenderedCents: z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS).nullable().optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

/** A waiter collected cash / a terminal payment for a guest (or the whole table). */
export async function recordStaffPayment(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof recordPaymentSchema>,
) {
  assertCan(ctx, "payments.record");
  const input = recordPaymentSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const config = await paymentConfig(db, rid);
  if (!config.offline.includes(input.provider)) throw forbidden("payment_method_disabled");

  const [existing] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.restaurantId, rid), eq(payments.idempotencyKey, input.idempotencyKey)));
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({ id: tableSessions.id, restaurantId: tableSessions.restaurantId })
      .from(tableSessions)
      .where(and(eq(tableSessions.id, input.tableSessionId), eq(tableSessions.restaurantId, rid)));
    if (!session) throw notFound();
    if (input.participantId) {
      const [p] = await tx
        .select({ id: sessionParticipants.id })
        .from(sessionParticipants)
        .where(
          and(
            eq(sessionParticipants.id, input.participantId),
            eq(sessionParticipants.tableSessionId, session.id),
          ),
        );
      if (!p) throw notFound();
    }
    await expireStalePending(tx, rid, session.id);
    const due = await lockPayableOrders(tx, rid, session.id, input.participantId ?? null);
    const amountCents = due.reduce((s, o) => s + o.totalCents, 0);
    if (amountCents <= 0) throw conflict("nothing_to_pay");
    if (input.provider === "cash" && input.tenderedCents != null && input.tenderedCents < amountCents)
      throw validation("tendered_too_low", { amountCents });

    const [created] = await tx
      .insert(payments)
      .values({
        restaurantId: rid,
        tableSessionId: session.id,
        participantId: input.participantId ?? null,
        provider: input.provider,
        status: "succeeded",
        succeededAt: new Date(),
        amountCents,
        currency: ctx.restaurant.currency,
        idempotencyKey: input.idempotencyKey,
        recordedByUserId: ctx.user.id,
        metadata: input.tenderedCents != null ? { tenderedCents: input.tenderedCents } : {},
      })
      .returning();
    await tx.insert(paymentAllocations).values(
      due.map((o) => ({
        restaurantId: rid,
        paymentId: created!.id,
        orderId: o.id,
        amountCents: o.totalCents,
      })),
    );
    await settleAllocations(tx, created!, ctx.user.id);
    await emitPaymentUpdate(tx, created!);
    await recordAudit(tx, {
      action: "payment.recorded",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "payment",
      entityId: created!.id,
      metadata: {
        provider: input.provider,
        amountCents,
        scope: input.participantId ? "participant" : "table",
        orders: due.map((o) => o.number),
      },
    });
    return created!;
  });
}

/** Staff can abort an online checkout that is stuck (guest left), releasing the orders. */
export async function cancelPendingPayment(db: Database, ctx: RestaurantContext, paymentId: string) {
  assertCan(ctx, "payments.record");
  if (!isUuid(paymentId)) throw notFound();
  return db.transaction(async (tx) => {
    const [p] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.restaurantId, ctx.restaurant.id)));
    if (!p) throw notFound();
    const released = await releasePayment(tx, paymentId, "cancelled", "cancelled_by_staff");
    if (!released) throw conflict("payment_already_processed");
    await recordAudit(tx, {
      action: "payment.cancelled",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "payment",
      entityId: paymentId,
    });
    return released;
  });
}

export const refundSchema = z.object({
  amountCents: z.coerce.number().int().min(1).max(MAX_AMOUNT_CENTS),
  reason: z.string().trim().max(500).optional(),
});

/**
 * Partial or total refund.
 * 1. (tx) lock the payment, check the refundable balance, reserve it (refunded_cents) with a pending refund
 * 2. call the PSP (offline: money handed back in person)
 * 3. (tx) mark the refund succeeded and update statuses — or roll the reservation back
 * The reservation makes two concurrent refunds unable to exceed the amount paid.
 */
export async function refundPayment(
  db: Database,
  ctx: RestaurantContext,
  paymentId: string,
  raw: z.input<typeof refundSchema>,
) {
  assertCan(ctx, "payments.refund");
  if (!isUuid(paymentId)) throw notFound();
  const input = refundSchema.parse(raw);
  const rid = ctx.restaurant.id;

  const { payment, refund } = await db.transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.restaurantId, rid)))
      .for("update");
    if (!p) throw notFound();
    if (p.status !== "succeeded" && p.status !== "partially_refunded")
      throw conflict("payment_not_refundable");
    const refundable = p.amountCents - p.refundedCents;
    if (input.amountCents > refundable)
      throw validation("refund_exceeds_balance", { refundableCents: refundable });
    await tx
      .update(payments)
      .set({ refundedCents: p.refundedCents + input.amountCents })
      .where(eq(payments.id, p.id));
    const [r] = await tx
      .insert(refunds)
      .values({
        restaurantId: rid,
        paymentId: p.id,
        amountCents: input.amountCents,
        status: "pending",
        reason: input.reason || null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    return { payment: p, refund: r! };
  });

  const provider = getProvider(payment.provider);
  let providerRef: string | undefined;
  try {
    if (!provider) throw new Error(`Unknown provider ${payment.provider}`);
    ({ providerRef } = await provider.refund({
      providerRef: payment.providerRef,
      metadata: payment.metadata,
      amountCents: input.amountCents,
      idempotencyKey: `refund_${refund.id}`,
    }));
  } catch (err) {
    await db.transaction(async (tx) => {
      await tx.update(refunds).set({ status: "failed" }).where(eq(refunds.id, refund.id));
      await tx
        .update(payments)
        .set({ refundedCents: sql`${payments.refundedCents} - ${input.amountCents}` })
        .where(eq(payments.id, payment.id));
      await recordAudit(tx, {
        action: "payment.refund_failed",
        actorUserId: ctx.user.id,
        restaurantId: rid,
        entityType: "payment",
        entityId: payment.id,
        metadata: { amountCents: input.amountCents, error: err instanceof Error ? err.message : "unknown" },
      });
    });
    throw new AppError("CONFLICT", "refund_provider_error");
  }

  return db.transaction(async (tx) => {
    await tx
      .update(refunds)
      .set({ status: "succeeded", providerRef: providerRef ?? null })
      .where(eq(refunds.id, refund.id));
    const [updated] = await tx
      .update(payments)
      .set({
        status: sql`case when ${payments.refundedCents} >= ${payments.amountCents} then 'refunded' else 'partially_refunded' end::payment_status`,
      })
      .where(eq(payments.id, payment.id))
      .returning();
    const full = updated!.status === "refunded";
    const alloc = await tx
      .select({ orderId: paymentAllocations.orderId })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.paymentId, payment.id));
    if (alloc.length > 0) {
      await tx
        .update(orders)
        .set({ paymentStatus: full ? "refunded" : "partially_refunded" })
        .where(
          and(
            inArray(
              orders.id,
              alloc.map((a) => a.orderId),
            ),
            inArray(orders.paymentStatus, ["paid", "partially_refunded"]),
          ),
        );
    }
    await emitPaymentUpdate(tx, updated!);
    await recordAudit(tx, {
      action: "payment.refunded",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "payment",
      entityId: payment.id,
      metadata: { amountCents: input.amountCents, reason: input.reason ?? null, full },
    });
    return { payment: updated!, refund: { ...refund, status: "succeeded" as const } };
  });
}

export const PAYMENT_STATUSES = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

export const listPaymentsSchema = z.object({
  statuses: z.array(z.enum(PAYMENT_STATUSES)).optional(),
  provider: z.string().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listPayments(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof listPaymentsSchema> = {},
) {
  assertCan(ctx, "payments.view");
  const input = listPaymentsSchema.parse(raw);
  const list = await db
    .select({
      id: payments.id,
      provider: payments.provider,
      status: payments.status,
      amountCents: payments.amountCents,
      refundedCents: payments.refundedCents,
      currency: payments.currency,
      createdAt: payments.createdAt,
      succeededAt: payments.succeededAt,
      failureReason: payments.failureReason,
      participantId: payments.participantId,
      participantSeq: sessionParticipants.seq,
      participantName: sessionParticipants.displayName,
      tableLabel: diningTables.label,
    })
    .from(payments)
    .leftJoin(sessionParticipants, eq(sessionParticipants.id, payments.participantId))
    .leftJoin(tableSessions, eq(tableSessions.id, payments.tableSessionId))
    .leftJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
    .where(
      and(
        eq(payments.restaurantId, ctx.restaurant.id),
        input.statuses?.length ? inArray(payments.status, input.statuses) : undefined,
        input.provider ? eq(payments.provider, input.provider) : undefined,
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(input.limit);
  if (list.length === 0) return [];
  const ids = list.map((p) => p.id);
  const [allocs, refundRows] = await Promise.all([
    db
      .select({ paymentId: paymentAllocations.paymentId, number: orders.number })
      .from(paymentAllocations)
      .innerJoin(orders, eq(orders.id, paymentAllocations.orderId))
      .where(inArray(paymentAllocations.paymentId, ids)),
    db.select().from(refunds).where(inArray(refunds.paymentId, ids)).orderBy(asc(refunds.createdAt)),
  ]);
  return list.map((p) => ({
    ...p,
    orderNumbers: allocs.filter((a) => a.paymentId === p.id).map((a) => a.number),
    refunds: refundRows.filter((r) => r.paymentId === p.id),
  }));
}

/** Payments of an open table session, for the staff table view. */
export async function listSessionPayments(db: Database, ctx: RestaurantContext, sessionId: string) {
  assertCan(ctx, "payments.view");
  if (!isUuid(sessionId)) throw notFound();
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.restaurantId, ctx.restaurant.id), eq(payments.tableSessionId, sessionId)))
    .orderBy(desc(payments.createdAt));
}

export const paymentSettingsSchema = z.object({
  onlinePaymentEnabled: z.boolean(),
  /** Providers the restaurant accepts. Unknown codes are rejected. */
  enabledPaymentProviders: z.array(z.enum(["cash", "on_site_terminal", "pay_later", ...ONLINE_CODES])).max(8),
  requirePaymentBeforeOrder: z.boolean(),
});

/** Settings view: what the restaurant enabled + what the plan and the deployment allow. */
export async function getPaymentSettingsView(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const [settings] = await db
    .select({
      onlinePaymentEnabled: restaurantSettings.onlinePaymentEnabled,
      enabledPaymentProviders: restaurantSettings.enabledPaymentProviders,
      requirePaymentBeforeOrder: restaurantSettings.requirePaymentBeforeOrder,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  const entitlements = await getEntitlements(db, ctx.restaurant.id);
  return {
    ...settings!,
    planAllowsOnline: hasFeature(entitlements, "online_payments"),
    availableOnline: availableOnlineProviders().filter((c): c is OnlineCode =>
      (ONLINE_CODES as readonly string[]).includes(c),
    ),
  };
}

export async function updatePaymentSettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof paymentSettingsSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const input = paymentSettingsSchema.parse(raw);
  const providers = [...new Set(input.enabledPaymentProviders)];
  if (input.onlinePaymentEnabled) {
    const entitlements = await getEntitlements(db, ctx.restaurant.id);
    if (!hasFeature(entitlements, "online_payments"))
      throw new AppError("PLAN_LIMIT", "plan_feature_online_payments");
    const deployment = availableOnlineProviders();
    if (
      !providers.some(
        (c) => (ONLINE_CODES as readonly string[]).includes(c) && deployment.includes(c as OnlineCode),
      )
    )
      throw validation("online_provider_required", { field: "onlinePaymentEnabled" });
  }
  const canBePaid =
    input.onlinePaymentEnabled || providers.some((c) => (OFFLINE_CODES as readonly string[]).includes(c));
  if (!canBePaid) throw validation("payment_method_required");
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(restaurantSettings)
      .set({ ...input, enabledPaymentProviders: providers })
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id))
      .returning();
    await recordAudit(tx, {
      action: "restaurant.payment_settings_updated",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      metadata: { ...input, enabledPaymentProviders: providers },
    });
    return updated!;
  });
}

export async function getPaymentMethods(db: Database, restaurantId: string) {
  return paymentConfig(db, restaurantId);
}

export const newIdempotencyKey = () => randomToken(24);

export type { ProviderCode };
