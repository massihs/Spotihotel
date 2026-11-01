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
  zone: string | null;
  capacity: number | null;
  state: TableState;
  sessionId: string | null;
  openedAt: Date | null;
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
      zone: diningTables.zone,
      capacity: diningTables.capacity,
      sessionId: tableSessions.id,
      openedAt: tableSessions.openedAt,
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
