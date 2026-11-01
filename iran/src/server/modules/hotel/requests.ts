import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, orders, serviceRequests, tableSessions } from "@/server/db/schema";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { dayStart, localDay } from "@/lib/period";

export const REQUEST_STATUSES = ["open", "in_progress", "done"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/** A room asks for a service (called by the guest bell in a hotel room). */
export async function openRequest(
  tx: DbOrTx,
  r: {
    restaurantId: string;
    tableId: string;
    placeLabel: string;
    kind: string;
    label: string | null;
    note: string | null;
  },
) {
  const [row] = await tx
    .insert(serviceRequests)
    .values({ ...r, status: "open" })
    .returning({ id: serviceRequests.id });
  return row!.id;
}

/** The front desk's board: what is waiting, what someone is on, and what was done today. */
export async function listRequests(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "orders.view");
  const since = dayStart(localDay(now, ctx.restaurant.timezone), ctx.restaurant.timezone);
  return db
    .select()
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.restaurantId, ctx.restaurant.id),
        sql`(${serviceRequests.status} <> 'done' or ${serviceRequests.doneAt} >= ${since})`,
      ),
    )
    .orderBy(desc(serviceRequests.createdAt))
    .limit(300);
}

/** Requests nobody took yet (the badge in the menu). */
export async function countOpenRequests(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(serviceRequests)
    .where(and(eq(serviceRequests.restaurantId, restaurantId), eq(serviceRequests.status, "open")));
  return row?.n ?? 0;
}

const NEXT: Record<string, RequestStatus[]> = {
  open: ["in_progress", "done"],
  in_progress: ["done", "open"],
  done: [],
};

/** Someone takes a request, finishes it, or hands it back. */
export async function moveRequest(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  to: RequestStatus,
  now = new Date(),
) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(id)) throw notFound();
  return db.transaction(async (tx) => {
    const [r] = await tx
      .select({
        status: serviceRequests.status,
        kind: serviceRequests.kind,
        tableId: serviceRequests.tableId,
      })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.restaurantId, ctx.restaurant.id)))
      .for("update");
    if (!r) throw notFound();
    if (!NEXT[r.status]?.includes(to)) throw conflict("invalid_transition");
    await tx
      .update(serviceRequests)
      .set(
        to === "in_progress"
          ? { status: to, takenByUserId: ctx.user.id, takenAt: now }
          : to === "done"
            ? {
                status: to,
                doneAt: now,
                takenByUserId: sql`coalesce(${serviceRequests.takenByUserId}, ${ctx.user.id}::uuid)`,
              }
            : { status: to, takenByUserId: null, takenAt: null },
      )
      .where(eq(serviceRequests.id, id));
    // A room the guest asked to have cleaned is clean once the request is done.
    if (to === "done" && r.kind === "housekeeping" && r.tableId)
      await tx
        .update(diningTables)
        .set({ housekeeping: "clean", housekeepingAt: now })
        .where(and(eq(diningTables.id, r.tableId), eq(diningTables.restaurantId, ctx.restaurant.id)));
    await emit(tx, { topic: topics.restaurant(ctx.restaurant.id), type: "notification.created" });
  });
}

/** Today's numbers for the hotel overview. */
export async function requestStats(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  const since = dayStart(localDay(now, ctx.restaurant.timezone), ctx.restaurant.timezone);
  const rows = await db
    .select({ status: serviceRequests.status, n: sql<number>`count(*)::int` })
    .from(serviceRequests)
    .where(
      and(
        eq(serviceRequests.restaurantId, ctx.restaurant.id),
        sql`(${serviceRequests.status} <> 'done' or ${serviceRequests.doneAt} >= ${since})`,
        inArray(serviceRequests.status, [...REQUEST_STATUSES]),
        gte(serviceRequests.createdAt, new Date(since.getTime() - 7 * 86_400_000)),
      ),
    )
    .groupBy(serviceRequests.status);
  const of = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { open: of("open"), inProgress: of("in_progress"), doneToday: of("done") };
}

/** The hotel overview's numbers: rooms in use and to clean, requests, response time, room service. */
export async function hotelToday(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "orders.view");
  const since = dayStart(localDay(now, ctx.restaurant.timezone), ctx.restaurant.timezone);
  const rid = ctx.restaurant.id;
  const [[rooms], [occupied], [roomOrders], [response], stats] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        outOfOrder: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'out_of_order')::int`,
        dirty: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'dirty')::int`,
        cleaning: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'cleaning')::int`,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      ),
    db
      .select({ n: sql<number>`count(distinct ${tableSessions.tableId})::int` })
      .from(tableSessions)
      .innerJoin(diningTables, eq(diningTables.id, tableSessions.tableId))
      .where(
        and(
          eq(tableSessions.restaurantId, rid),
          eq(tableSessions.status, "open"),
          eq(diningTables.kind, "room"),
        ),
      ),
    db
      .select({
        n: sql<number>`count(*)::int`,
        cents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(diningTables, eq(diningTables.id, orders.tableId))
      .where(
        and(
          eq(orders.restaurantId, rid),
          eq(diningTables.kind, "room"),
          gte(orders.createdAt, since),
          sql`${orders.status} <> 'cancelled'`,
        ),
      ),
    db
      .select({
        min: sql<
          number | null
        >`avg(extract(epoch from (${serviceRequests.takenAt} - ${serviceRequests.createdAt})) / 60)`.mapWith(
          (v) => (v == null ? null : Number(v)),
        ),
      })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.restaurantId, rid),
          gte(serviceRequests.createdAt, since),
          sql`${serviceRequests.takenAt} is not null`,
        ),
      ),
    requestStats(db, ctx, now),
  ]);
  return {
    rooms: rooms?.n ?? 0,
    outOfOrder: rooms?.outOfOrder ?? 0,
    dirty: rooms?.dirty ?? 0,
    cleaning: rooms?.cleaning ?? 0,
    occupied: occupied?.n ?? 0,
    roomOrders: roomOrders?.n ?? 0,
    roomServiceCents: roomOrders?.cents ?? 0,
    avgResponseMin: response?.min == null ? null : Math.round(response.min),
    ...stats,
  };
}
