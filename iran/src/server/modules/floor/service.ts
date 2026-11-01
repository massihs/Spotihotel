import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { carts, diningTables, orders, tableSessions } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { AppError, notFound } from "@/server/errors";
import { emit, topics } from "@/server/infra/realtime";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";

/** 🟢 free · 🟡 order in progress in the kitchen · 🔴 occupied (seated, nothing cooking). */
export type TableState = "free" | "in_progress" | "occupied";

export type FloorTable = {
  id: string;
  label: string;
  /** "table" or "room" (hotel room). */
  kind: string;
  zone: string | null;
  capacity: number | null;
  state: TableState;
  sessionId: string | null;
  openedAt: Date | null;
  /** Opened by a scan, waiting for a waiter to let it order (guestOrdersNeedStaff). */
  waiting: boolean;
  people: number;
  ordersCount: number;
  activeOrders: number;
  readyOrders: number;
  totalCents: number;
  unpaidCents: number;
  lastOrderAt: Date | null;
};

export async function getFloor(db: Database, ctx: RestaurantContext): Promise<FloorTable[]> {
  assertCan(ctx, "tables.view");
  // Correlated subqueries use explicit aliases and qualified outer columns (see db/README.md).
  const rows = await db
    .select({
      id: diningTables.id,
      label: diningTables.label,
      kind: diningTables.kind,
      zone: diningTables.zone,
      capacity: diningTables.capacity,
      sessionId: tableSessions.id,
      openedAt: tableSessions.openedAt,
      waiting: sql<boolean>`(${tableSessions.id} is not null and ${tableSessions.confirmedAt} is null)`,
      people:
        sql<number>`(select count(*) from session_participants sp where sp.table_session_id = "table_sessions"."id")`.mapWith(
          Number,
        ),
      ordersCount:
        sql<number>`(select count(*) from orders o where o.table_session_id = "table_sessions"."id" and o.status <> 'cancelled')`.mapWith(
          Number,
        ),
      activeOrders:
        sql<number>`(select count(*) from orders o where o.table_session_id = "table_sessions"."id" and o.status in ('pending_payment','received','accepted','preparing','ready'))`.mapWith(
          Number,
        ),
      readyOrders:
        sql<number>`(select count(*) from orders o where o.table_session_id = "table_sessions"."id" and o.status = 'ready')`.mapWith(
          Number,
        ),
      totalCents:
        sql<number>`(select coalesce(sum(o.total_cents), 0) from orders o where o.table_session_id = "table_sessions"."id" and o.status <> 'cancelled')`.mapWith(
          Number,
        ),
      unpaidCents:
        sql<number>`(select coalesce(sum(o.total_cents), 0) from orders o where o.table_session_id = "table_sessions"."id" and o.status <> 'cancelled' and o.payment_status in ('unpaid','pending'))`.mapWith(
          Number,
        ),
      lastOrderAt:
        sql<Date | null>`(select max(o.placed_at) from orders o where o.table_session_id = "table_sessions"."id")`.mapWith(
          (v: string | null) => (v ? new Date(v) : null),
        ),
    })
    .from(diningTables)
    .leftJoin(
      tableSessions,
      and(eq(tableSessions.tableId, diningTables.id), eq(tableSessions.status, "open")),
    )
    .where(and(eq(diningTables.restaurantId, ctx.restaurant.id), isNull(diningTables.deletedAt)))
    .orderBy(asc(diningTables.sortOrder), asc(diningTables.label));

  return rows.map((r) => ({
    ...r,
    state: !r.sessionId ? "free" : r.activeOrders > 0 ? "in_progress" : "occupied",
  }));
}

/**
 * Frees a table. Refused while something is left to collect or still in the kitchen,
 * unless a manager forces it (audited with the amount).
 */
export async function closeTableSession(
  db: Database,
  ctx: RestaurantContext,
  tableId: string,
  opts: { force?: boolean } = {},
) {
  assertCan(ctx, "sessions.close");
  if (opts.force) assertCan(ctx, "restaurant.manage");
  if (!isUuid(tableId)) throw notFound();
  return db.transaction(async (tx) => {
    const [session] = await tx
      .select({ s: tableSessions })
      .from(tableSessions)
      .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
      .where(
        and(
          eq(tableSessions.tableId, tableId),
          eq(tableSessions.status, "open"),
          eq(diningTables.restaurantId, ctx.restaurant.id),
        ),
      )
      .for("update");
    if (!session) throw notFound("no_open_session");

    const [stats] = await tx
      .select({
        unpaid:
          sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} <> 'cancelled' and ${orders.paymentStatus} in ('unpaid','pending')), 0)`.mapWith(
            Number,
          ),
        active:
          sql<number>`count(*) filter (where ${orders.status} in ('pending_payment','received','accepted','preparing','ready'))`.mapWith(
            Number,
          ),
      })
      .from(orders)
      .where(eq(orders.tableSessionId, session.s.id));
    if (!opts.force && (stats?.active ?? 0) > 0)
      throw new AppError("CONFLICT", "session_has_active_orders", { count: stats!.active });
    if (!opts.force && (stats?.unpaid ?? 0) > 0)
      throw new AppError("CONFLICT", "session_has_unpaid", { unpaidCents: stats!.unpaid });

    await tx
      .update(tableSessions)
      .set({ status: "closed", closedAt: new Date(), closedByUserId: ctx.user.id, closedReason: "staff" })
      .where(eq(tableSessions.id, session.s.id));
    // Leftover carts are meaningless once the group has left.
    await tx.delete(carts).where(eq(carts.tableSessionId, session.s.id));
    await emit(tx, {
      topic: topics.restaurant(ctx.restaurant.id),
      type: "session.closed",
      data: { tableId },
    });
    await emit(tx, { topic: topics.session(session.s.id), type: "session.closed" });
    await recordAudit(tx, {
      action: opts.force ? "table_session.force_closed" : "table_session.closed",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "table_session",
      entityId: session.s.id,
      metadata: { tableId, unpaidCents: stats?.unpaid ?? 0, activeOrders: stats?.active ?? 0 },
    });
    return { sessionId: session.s.id };
  });
}

/**
 * Moves the guests of a table to another, free table (جابجایی میز): the open session, its
 * orders and the guests' phones follow; the old table becomes free.
 */
export async function moveTableSession(
  db: Database,
  ctx: RestaurantContext,
  fromTableId: string,
  toTableId: string,
) {
  assertCan(ctx, "sessions.close");
  if (!isUuid(fromTableId) || !isUuid(toTableId) || fromTableId === toTableId) throw notFound();
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const tables = await tx
      .select({ id: diningTables.id, label: diningTables.label })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt)));
    const from = tables.find((t) => t.id === fromTableId);
    const to = tables.find((t) => t.id === toTableId);
    if (!from || !to) throw notFound();
    const open = await tx
      .select({ id: tableSessions.id, tableId: tableSessions.tableId })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.status, "open"),
          sql`${tableSessions.tableId} in (${fromTableId}, ${toTableId})`,
        ),
      )
      .for("update");
    const session = open.find((s) => s.tableId === fromTableId);
    if (!session) throw notFound("no_open_session");
    if (open.some((s) => s.tableId === toTableId)) throw new AppError("CONFLICT", "table_occupied");
    await tx.update(tableSessions).set({ tableId: toTableId }).where(eq(tableSessions.id, session.id));
    await tx
      .update(orders)
      .set({ tableId: toTableId, tableLabel: to.label })
      .where(eq(orders.tableSessionId, session.id));
    await recordAudit(tx, {
      action: "table_session.moved",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "table_session",
      entityId: session.id,
      metadata: { from: from.label, to: to.label },
    });
    for (const tableId of [fromTableId, toTableId])
      await emit(tx, { topic: topics.restaurant(rid), type: "session.opened", data: { tableId } });
    await emit(tx, { topic: topics.session(session.id), type: "order.updated" });
    return { from: from.label, to: to.label };
  });
}
