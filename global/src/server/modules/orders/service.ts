import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  cartItems,
  carts,
  diningTables,
  notifications,
  orderItems,
  orderStatusEvents,
  orders,
  restaurantSettings,
  sessionParticipants,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { taxFromGross, taxFromNet } from "@/lib/money";
import { touchSession, type GuestContext } from "@/server/modules/guest/sessions";
import { loadPricedProducts } from "@/server/modules/menu/public";
import { computeTotals, priceLine, type PricedLine } from "@/server/modules/pricing";
import { nextCounterValue } from "@/server/modules/restaurants/service";
import { canTransition, STATUS_TIMESTAMP, type OrderStatus } from "./status";

export const placeOrderSchema = z.object({
  note: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
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
) {
  const input = placeOrderSchema.parse(raw);
  const rid = guest.restaurant.id;

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
      .select({ status: tableSessions.status })
      .from(tableSessions)
      .where(eq(tableSessions.id, guest.session.id))
      .for("update");
    if (session?.status !== "open") throw new AppError("UNAUTHENTICATED", "session_expired");

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
        status,
        paymentStatus: "unpaid",
        currency: guest.restaurant.currency,
        subtotalCents: totals.subtotalCents,
        discountCents: 0,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        pricesIncludeTax,
        note: input.note ?? null,
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map(({ item, line, productName, categoryId, categoryName }) => ({
        restaurantId: rid,
        orderId: created!.id,
        productId: item.productId,
        categoryId,
        productName,
        categoryName,
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
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart!.id));
    await touchSession(tx, guest.session.id);
    await tx.insert(notifications).values({
      restaurantId: rid,
      type: "order.created",
      payload: {
        orderId: created!.id,
        number,
        tableLabel: guest.table.label,
        totalCents: totals.totalCents,
        seq: guest.participant.seq,
      },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    await emit(tx, {
      topic: topics.restaurant(rid),
      type: "order.created",
      data: { orderId: created!.id, number, tableId: guest.table.id },
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
      metadata: { number, totalCents: totals.totalCents, items: lines.length },
    });
    return created!;
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
      tableId: orders.tableId,
      totalCents: orders.totalCents,
      currency: orders.currency,
      note: orders.note,
      placedAt: orders.placedAt,
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
  return db.transaction(async (tx) => {
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
        data: { orderId, status: to },
      });
    }
    if (to === "ready") {
      await tx.insert(notifications).values({
        restaurantId: ctx.restaurant.id,
        type: "order.ready",
        payload: { orderId, number: current.number, tableLabel: current.tableLabel },
      });
      await emit(tx, { topic: topics.restaurant(ctx.restaurant.id), type: "notification.created" });
    }
    if (to === "cancelled") {
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
