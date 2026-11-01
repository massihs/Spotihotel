import { notifyNewOrder, notifyOrderReady } from "@/server/modules/push/service";
import { notifyTeam } from "@/server/modules/team/sections";
import { scheduleFeedback } from "@/server/modules/feedback/service";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { assertGuestMayAct } from "@/server/modules/guest/limits";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cartItems,
  carts,
  diningTables,
  orderItems,
  orderStatusEvents,
  orders,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { sendToKitchen } from "@/server/modules/printing/service";
import { AppError, isAppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { taxFromGross, taxFromNet } from "@/lib/money";
import { touchSession, type GuestContext } from "@/server/modules/guest/sessions";
import { loadPricedProducts } from "@/server/modules/menu/public";
import { computeTotals, priceLine, type PricedLine } from "@/server/modules/pricing";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { normalizeIranMobile } from "@/lib/phone";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { sms } from "@/server/infra/sms";
import { stationsOf } from "@/server/modules/kitchen/stations";
import { nutritionOf } from "@/server/modules/nutrition/service";
import { dinerForOrder } from "@/server/modules/diners/service";
import { applyOrderToStock } from "@/server/modules/inventory/service";
import {
  commitDiscounts,
  computeDiscounts,
  linkOrderCustomer,
  onOrderCancelled,
} from "@/server/modules/customers/service";
import { canTransition, STATUS_TIMESTAMP, type OrderStatus } from "./status";

export const placeOrderSchema = z.object({
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  /** Mobile number for the "your order is ready" text; required by food courts. */
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = normalizeIranMobile(v);
      if (!n) ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return n;
    })
    .nullable()
    .optional(),
  couponCode: z.string().trim().max(32).nullable().optional(),
});

/**
 * Turns the participant's cart into an order, in one transaction:
 * - the cart row is locked: a double tap or two tabs produce a single order
 * - every price is recomputed from the database; the cart stores no price at all
 * - items are snapshotted (name, unit price, options, VAT) so history never changes
 * - the order number comes from an atomic per-restaurant counter
 */
export async function placeOrder(
  db: Database,
  guest: GuestContext,
  raw: z.input<typeof placeOrderSchema> = {},
  opts: { dinerId?: string | null } = {},
) {
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION", "invalid_phone", { field: "phone" });
  const input = parsed.data;
  const rid = guest.restaurant.id;
  if (guest.restaurant.kind === "food_court" && !input.phone)
    throw new AppError("VALIDATION", "phone_required", { field: "phone" });

  const order = await db.transaction(async (tx) => {
    const [cart] = await tx
      .select()
      .from(carts)
      .where(eq(carts.participantId, guest.participant.id))
      .for("update");
    const items = cart
      ? await tx
          .select()
          .from(cartItems)
          .where(eq(cartItems.cartId, cart.id))
          .orderBy(asc(cartItems.createdAt))
      : [];
    if (items.length === 0) throw conflict("cart_empty");

    // The session must still be open at the moment of ordering.
    const [session] = await tx
      .select({ status: tableSessions.status, confirmedAt: tableSessions.confirmedAt })
      .from(tableSessions)
      .where(eq(tableSessions.id, guest.session.id))
      .for("update");
    if (session?.status !== "open") throw new AppError("UNAUTHENTICATED", "session_expired");
    // Anti-abuse: table confirmed by a waiter (when asked), few orders waiting at once.
    await assertGuestMayAct(
      tx,
      { ...guest, session: { ...guest.session, confirmed: session.confirmedAt != null } },
      "order",
    );

    const products = await loadPricedProducts(tx, rid, {
      productIds: [...new Set(items.map((i) => i.productId))],
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines: {
      item: (typeof items)[number];
      line: PricedLine;
      productName: string;
      categoryId: string;
      categoryName: string;
    }[] = [];
    for (const item of items) {
      const product = byId.get(item.productId);
      const priced = product ? priceLine(product, item.optionValueIds, item.quantity) : null;
      if (!product || !priced?.ok) throw conflict("cart_has_issues");
      lines.push({
        item,
        line: priced.line,
        productName: product.name,
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
    const discount = await computeDiscounts(tx, rid, {
      totalCents: totals.totalCents,
      couponCode: input.couponCode,
    });
    const totalCents = totals.totalCents - discount.discountCents;
    const taxCents =
      totals.totalCents > 0 ? Math.round(totals.taxCents * (totalCents / totals.totalCents)) : 0;
    const seq = await nextCounterValue(tx, rid, "order", 1001);
    const number = `${settings?.orderPrefix ?? "A"}-${seq}`;
    const status: OrderStatus = settings?.requirePaymentBeforeOrder ? "pending_payment" : "received";

    const [created] = await tx
      .insert(orders)
      .values({
        restaurantId: rid,
        number,
        seq,
        channel: "dine_in",
        tableId: guest.table.id,
        tableSessionId: guest.session.id,
        participantId: guest.participant.id,
        tableLabel: guest.table.label,
        placeKind: guest.table.kind === "room" ? "room" : null,
        status,
        paymentStatus: "unpaid",
        currency: guest.restaurant.currency,
        subtotalCents: totals.subtotalCents,
        discountCents: discount.discountCents,
        taxCents,
        totalCents,
        pricesIncludeTax,
        note: input.note ?? null,
        customerPhone: input.phone ?? null,
        dinerId: await dinerForOrder(tx, { dinerId: opts.dinerId, phone: input.phone }),
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
      lines.map(({ item, line, productName, categoryId, categoryName }) => ({
        restaurantId: rid,
        orderId: created!.id,
        productId: item.productId,
        categoryId,
        productName,
        categoryName,
        stationId: stations.get(item.productId) ?? null,
        nutrition: nutrition.get(item.productId) ?? null,
        unitPriceCents: line.unitPriceCents,
        optionsTotalCents: line.optionsTotalCents,
        quantity: line.quantity,
        lineTotalCents: line.lineTotalCents,
        taxRateBps: line.taxRateBps,
        // Per-line VAT is informative (analytics); the order total VAT is computed per rate.
        taxCents: pricesIncludeTax
          ? taxFromGross(line.lineTotalCents, line.taxRateBps)
          : taxFromNet(line.lineTotalCents, line.taxRateBps),
        options: line.selections,
        note: item.note,
      })),
    );
    await tx
      .insert(orderStatusEvents)
      .values({ restaurantId: rid, orderId: created!.id, fromStatus: null, toStatus: status });
    await applyOrderToStock(tx, rid, created!.id, -1);
    const customer = input.phone ? await linkOrderCustomer(tx, rid, created!.id, input.phone) : null;
    await commitDiscounts(
      tx,
      rid,
      created!.id,
      { couponId: discount.couponId, pointsRedeemed: 0, customerId: customer?.id ?? null },
      null,
    );
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart!.id));
    await touchSession(tx, guest.session.id);
    const sections = await notifyTeam(
      tx,
      {
        restaurantId: rid,
        type: "order.created",
        payload: {
          orderId: created!.id,
          number,
          tableLabel: guest.table.label,
          ...(guest.table.kind === "room" ? { place: "room" } : {}),
          totalCents,
          seq: guest.participant.seq,
        },
      },
      { orderId: created!.id },
    );
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "order.created",
      data: {
        orderId: created!.id,
        number,
        tableId: guest.table.id,
        tableLabel: guest.table.label,
        ...(guest.table.kind === "room" ? { place: "room" } : {}),
        ...(sections ? { sections } : {}),
      },
    });
    // Without acceptance at the till, a guest order goes straight to the kitchen.
    if (status === "received" && settings && !settings.cashierAcceptance)
      await sendToKitchen(tx, rid, {
        id: created!.id,
        number,
        tableLabel: guest.table.label,
        placeKind: guest.table.kind,
      });
    await emit(tx, {
      topic: topics.participant(guest.participant.id),
      type: "order.updated",
      data: { orderId: created!.id },
    });
    await recordAudit(tx, {
      action: "order.placed",
      actorType: "guest",
      restaurantId: rid,
      entityType: "order",
      entityId: created!.id,
      metadata: { number, totalCents, items: lines.length },
    });
    return created!;
  });
  notifyNewOrder(db, guest.restaurant, {
    id: order.id,
    number: order.number,
    tableLabel: order.tableLabel,
    room: order.placeKind === "room",
  });
  return order;
}

export type OrderWithItems = Awaited<ReturnType<typeof attachItems>>[number];

async function attachItems<T extends { id: string }>(db: DbOrTx, list: T[]) {
  if (list.length === 0) return [] as (T & { items: (typeof orderItems.$inferSelect)[] })[];
  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        list.map((o) => o.id),
      ),
    )
    .orderBy(asc(orderItems.createdAt));
  return list.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

/** A guest only ever sees their own orders of the current session. */
export async function listGuestOrders(db: Database, guest: GuestContext) {
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.participantId, guest.participant.id), eq(orders.tableSessionId, guest.session.id)))
    .orderBy(desc(orders.placedAt));
  return attachItems(db, list);
}

// ─── Staff side ──────────────────────────────────────────────────────────────

const participantLabel = sql<number | null>`${sessionParticipants.seq}`;

export async function listActiveOrders(
  db: Database,
  ctx: RestaurantContext,
  opts: { includeRecentMinutes?: number } = {},
) {
  assertCan(ctx, "orders.view");
  const recent = new Date(Date.now() - (opts.includeRecentMinutes ?? 120) * 60_000);
  const list = await db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      tableLabel: orders.tableLabel,
      placeKind: orders.placeKind,
      tableId: orders.tableId,
      totalCents: orders.totalCents,
      currency: orders.currency,
      note: orders.note,
      placedAt: orders.placedAt,
      acceptedAt: orders.acceptedAt,
      readyAt: orders.readyAt,
      servedAt: orders.servedAt,
      channel: orders.channel,
      customerPhone: orders.customerPhone,
      participantSeq: participantLabel,
      participantName: sessionParticipants.displayName,
    })
    .from(orders)
    .leftJoin(sessionParticipants, eq(sessionParticipants.id, orders.participantId))
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        sql`(${orders.status} in ('pending_payment','received','accepted','preparing','ready') or ${orders.updatedAt} >= ${recent})`,
      ),
    )
    .orderBy(asc(orders.placedAt));
  return attachItems(db, list);
}

/**
 * "Accept all": every new order (status `received`, or only `orderIds` among them) goes to the
 * kitchen, one by one through the same transition as a single accept (tickets, guest updates).
 * Orders someone else moved meanwhile are skipped.
 */
export async function acceptAllOrders(
  db: Database,
  ctx: RestaurantContext,
  opts: { orderIds?: string[]; from?: "received" | "accepted"; to?: "accepted" | "preparing" } = {},
) {
  assertCan(ctx, "orders.update_status");
  const from = opts.from ?? "received";
  const to = opts.to ?? (from === "received" ? "accepted" : "preparing");
  const ids = opts.orderIds?.filter(isUuid);
  const list = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        eq(orders.status, from),
        ids ? inArray(orders.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : undefined,
      ),
    )
    .orderBy(asc(orders.placedAt));
  let done = 0;
  for (const o of list) {
    try {
      await updateOrderStatus(db, ctx, o.id, to);
      done++;
    } catch (e) {
      if (!(isAppError(e) && e.code === "CONFLICT")) throw e;
    }
  }
  return { done, skipped: list.length - done };
}

/**
 * Moves an order along the workflow. The UPDATE is conditional on the current status,
 * so two staff members tapping at once cannot both apply a transition.
 */
export async function updateOrderStatus(
  db: Database,
  ctx: RestaurantContext,
  orderId: string,
  to: OrderStatus,
  opts: { reason?: string } = {},
) {
  assertCan(ctx, to === "cancelled" ? "orders.cancel" : "orders.update_status");
  if (!isUuid(orderId)) throw notFound();
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.restaurantId, ctx.restaurant.id)));
    if (!current) throw notFound();
    if (!canTransition(current.status, to))
      throw conflict("invalid_transition", { from: current.status, to });

    const now = new Date();
    const stamps: Partial<Record<(typeof STATUS_TIMESTAMP)[keyof typeof STATUS_TIMESTAMP], Date>> = {};
    if (to === "cancelled") stamps.cancelledAt = now;
    else {
      // Skipped steps (e.g. received → served) get the same timestamp, so durations stay consistent.
      const steps = ["accepted", "preparing", "ready", "served"] as const;
      for (const step of steps.slice(0, steps.indexOf(to as (typeof steps)[number]) + 1)) {
        const col = STATUS_TIMESTAMP[step];
        if (!current[col]) stamps[col] = now;
      }
    }
    const [updated] = await tx
      .update(orders)
      .set({
        status: to,
        ...stamps,
        ...(to === "cancelled" ? { cancelReason: opts.reason?.slice(0, 500) ?? null } : {}),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, current.status)))
      .returning();
    if (!updated) throw conflict("status_changed"); // someone else moved it first

    await tx.insert(orderStatusEvents).values({
      restaurantId: ctx.restaurant.id,
      orderId,
      fromStatus: current.status,
      toStatus: to,
      actorUserId: ctx.user.id,
    });
    await emit(tx, {
      topic: topics.restaurant(ctx.restaurant.id),
      type: "order.updated",
      data: { orderId, status: to, tableId: current.tableId },
    });
    if (current.participantId) {
      await emit(tx, {
        topic: topics.participant(current.participantId),
        type: "order.updated",
        data: { orderId, status: to, number: current.number },
      });
    }
    // First time past "received": the order leaves the till for the kitchen and bar.
    if (!current.acceptedAt && to !== "cancelled") await sendToKitchen(tx, ctx.restaurant.id, current);
    if (to === "ready") {
      await notifyTeam(
        tx,
        {
          restaurantId: ctx.restaurant.id,
          type: "order.ready",
          payload: {
            orderId,
            number: current.number,
            tableLabel: current.tableLabel,
            ...(current.placeKind === "room" ? { place: "room" } : {}),
          },
        },
        { orderId },
      );
    }
    if (to === "served")
      await scheduleFeedback(tx, {
        id: orderId,
        restaurantId: ctx.restaurant.id,
        customerPhone: updated.customerPhone,
      });
    if (to === "cancelled") {
      await applyOrderToStock(tx, ctx.restaurant.id, orderId, 1);
      await onOrderCancelled(tx, ctx.restaurant.id, orderId);
      await recordAudit(tx, {
        action: "order.cancelled",
        actorUserId: ctx.user.id,
        restaurantId: ctx.restaurant.id,
        entityType: "order",
        entityId: orderId,
        metadata: { from: current.status, reason: opts.reason ?? null, totalCents: current.totalCents },
      });
    }
    return updated;
  });
  if (to === "ready")
    notifyOrderReady(db, ctx.restaurant, {
      id: updated.id,
      number: updated.number,
      participantId: updated.participantId,
      dinerId: updated.dinerId,
    });
  // Food courts text the guest; after the commit, and a failed SMS never blocks the kitchen.
  if (to === "ready" && ctx.restaurant.kind === "food_court" && updated.customerPhone)
    await sendReadySms(db, ctx, updated).catch((e) => console.error("[sms] order ready", e));
  return updated;
}

/** Sends the "order ready" text once per order: the row is claimed before sending. */
export async function sendReadySms(
  db: Database,
  ctx: RestaurantContext,
  order: { id: string; number: string; customerPhone: string | null },
) {
  if (!order.customerPhone) return false;
  const [claimed] = await db
    .update(orders)
    .set({ readySmsSentAt: new Date() })
    .where(and(eq(orders.id, order.id), isNull(orders.readySmsSentAt)))
    .returning({ id: orders.id });
  if (!claimed) return false;
  const locale = isLocale(ctx.restaurant.defaultLocale) ? ctx.restaurant.defaultLocale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "sms" });
  try {
    const res = await sms().send(
      order.customerPhone,
      t("orderReady", { restaurant: ctx.restaurant.name, number: order.number }),
    );
    await recordAudit(db, {
      action: "order.ready_sms_sent",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "order",
      entityId: order.id,
      metadata: { provider: sms().name, ref: res.ref },
    });
    return true;
  } catch (e) {
    // Release the claim so a later "ready" (or a retry) can send it.
    await db.update(orders).set({ readySmsSentAt: null }).where(eq(orders.id, order.id));
    throw e;
  }
}

/** Table view for staff: open session, its participants and their orders/totals. */
export async function getTableOverview(db: Database, ctx: RestaurantContext, tableId: string) {
  assertCan(ctx, "tables.view");
  if (!isUuid(tableId)) throw notFound();
  const [table] = await db
    .select()
    .from(diningTables)
    .where(
      and(
        eq(diningTables.id, tableId),
        eq(diningTables.restaurantId, ctx.restaurant.id),
        isNull(diningTables.deletedAt),
      ),
    );
  if (!table) throw notFound();
  const [session] = await db
    .select()
    .from(tableSessions)
    .where(and(eq(tableSessions.tableId, tableId), eq(tableSessions.status, "open")));
  if (!session) return { table, session: null, participants: [], tableTotalCents: 0, unpaidCents: 0 };

  const [people, list] = await Promise.all([
    db
      .select()
      .from(sessionParticipants)
      .where(eq(sessionParticipants.tableSessionId, session.id))
      .orderBy(asc(sessionParticipants.seq)),
    db.select().from(orders).where(eq(orders.tableSessionId, session.id)).orderBy(asc(orders.placedAt)),
  ]);
  const withItems = await attachItems(db, list);
  const counted = (o: (typeof list)[number]) => o.status !== "cancelled";
  const participants = people.map((p) => {
    const own = withItems.filter((o) => o.participantId === p.id);
    return {
      id: p.id,
      seq: p.seq,
      displayName: p.displayName,
      orders: own,
      totalCents: own.filter(counted).reduce((s, o) => s + o.totalCents, 0),
      unpaidCents: own
        .filter((o) => counted(o) && (o.paymentStatus === "unpaid" || o.paymentStatus === "pending"))
        .reduce((s, o) => s + o.totalCents, 0),
    };
  });
  return {
    table,
    session,
    participants,
    tableTotalCents: participants.reduce((s, p) => s + p.totalCents, 0),
    unpaidCents: participants.reduce((s, p) => s + p.unpaidCents, 0),
  };
}

/** Orders waiting for the team to accept them (badge on the Orders / Kitchen tabs). */
export async function countNewOrders(db: DbOrTx, ctx: RestaurantContext) {
  if (!ctx.permissions.has("orders.view")) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, ctx.restaurant.id),
        inArray(orders.status, ["received", "pending_payment"]),
      ),
    );
  return row?.n ?? 0;
}
