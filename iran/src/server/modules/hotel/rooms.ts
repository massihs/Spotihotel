import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  orders,
  serviceRequests,
  sessionParticipants,
  tableSessions,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { dayStart, localDay } from "@/lib/period";
import { closeTableSession } from "@/server/modules/floor/service";

export const HOUSEKEEPING = ["clean", "dirty", "cleaning", "inspected", "out_of_order"] as const;
export type Housekeeping = (typeof HOUSEKEEPING)[number];
const ACTIVE_ORDER = ["pending_payment", "received", "accepted", "preparing", "ready"] as const;

/**
 * The floor a room is on: its zone when the hotel set one ("Étage 2", "Villa"), else the hundreds
 * of its number (204 → 2, 1203 → 12, 12 → 0).
 */
export function floorOf(room: { label: string; zone: string | null; number: number | null }) {
  const zone = room.zone?.trim();
  if (zone) return { key: `z:${zone.toLowerCase()}`, label: zone, order: Number.MAX_SAFE_INTEGER };
  const n = room.number ?? (/^\d+$/.test(room.label) ? Number(room.label) : null);
  if (n == null) return { key: "other", label: null, order: Number.MAX_SAFE_INTEGER - 1 };
  const floor = n >= 100 ? Math.floor(n / 100) : 0;
  return { key: `f:${floor}`, label: floor, order: floor };
}

/**
 * Every room with what the front desk needs at a glance: guests in it, its housekeeping state,
 * open requests and room service on its way, grouped by floor.
 */
export async function roomsBoard(db: DbOrTx, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "tables.view");
  const rid = ctx.restaurant.id;
  const since = dayStart(localDay(now, ctx.restaurant.timezone), ctx.restaurant.timezone);
  const rooms = await db
    .select({
      id: diningTables.id,
      label: diningTables.label,
      number: diningTables.number,
      zone: diningTables.zone,
      capacity: diningTables.capacity,
      housekeeping: diningTables.housekeeping,
      housekeepingAt: diningTables.housekeepingAt,
    })
    .from(diningTables)
    .where(
      and(eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room"), isNull(diningTables.deletedAt)),
    )
    .orderBy(asc(diningTables.number), asc(diningTables.label));
  const ids = rooms.map((r) => r.id);
  if (!ids.length) return { rooms: [], floors: [] };
  const [sessions, requests, active, today] = await Promise.all([
    db
      .select({
        tableId: tableSessions.tableId,
        id: tableSessions.id,
        openedAt: tableSessions.openedAt,
      })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.restaurantId, rid),
          eq(tableSessions.status, "open"),
          inArray(tableSessions.tableId, ids),
        ),
      ),
    db
      .select({
        id: serviceRequests.id,
        tableId: serviceRequests.tableId,
        kind: serviceRequests.kind,
        label: serviceRequests.label,
        note: serviceRequests.note,
        status: serviceRequests.status,
        createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.restaurantId, rid),
          inArray(serviceRequests.status, ["open", "in_progress"]),
          inArray(serviceRequests.tableId, ids),
        ),
      ),
    db
      .select({
        id: orders.id,
        tableId: orders.tableId,
        number: orders.number,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          inArray(orders.status, [...ACTIVE_ORDER]),
          inArray(orders.tableId, ids),
        ),
      ),
    db
      .select({
        tableId: orders.tableId,
        cents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          inArray(orders.tableId, ids),
          gte(orders.createdAt, since),
          sql`${orders.status} <> 'cancelled'`,
        ),
      )
      .groupBy(orders.tableId),
  ]);
  const people = sessions.length
    ? await db
        .select({ sessionId: sessionParticipants.tableSessionId, n: sql<number>`count(*)::int` })
        .from(sessionParticipants)
        .where(
          inArray(
            sessionParticipants.tableSessionId,
            sessions.map((x) => x.id),
          ),
        )
        .groupBy(sessionParticipants.tableSessionId)
    : [];
  const list = rooms.map((r) => {
    const s = sessions.find((x) => x.tableId === r.id);
    const guests = s ? (people.find((p) => p.sessionId === s.id)?.n ?? 0) : 0;
    return {
      ...r,
      floor: floorOf(r),
      session: s ? { id: s.id, openedAt: s.openedAt, guests } : null,
      requests: requests.filter((x) => x.tableId === r.id),
      orders: active.filter((x) => x.tableId === r.id),
      todayCents: today.find((x) => x.tableId === r.id)?.cents ?? 0,
    };
  });
  const floors = [...new Map(list.map((r) => [r.floor.key, r.floor])).values()].sort(
    (a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)),
  );
  return { rooms: list, floors };
}

export const housekeepingSchema = z.enum(HOUSEKEEPING);

/** Housekeeping marks a room dirty, being cleaned, clean, checked, or out of order. */
export async function setHousekeeping(
  db: Database,
  ctx: RestaurantContext,
  tableId: string,
  raw: string,
  now = new Date(),
) {
  assertCan(ctx, "orders.update_status");
  const status = housekeepingSchema.parse(raw);
  if (!isUuid(tableId)) throw notFound();
  await db.transaction(async (tx) => {
    const [room] = await tx
      .update(diningTables)
      .set({ housekeeping: status, housekeepingAt: now })
      .where(
        and(
          eq(diningTables.id, tableId),
          eq(diningTables.restaurantId, ctx.restaurant.id),
          eq(diningTables.kind, "room"),
        ),
      )
      .returning({ id: diningTables.id, label: diningTables.label });
    if (!room) throw notFound();
    await recordAudit(tx, {
      action: "room.housekeeping",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "dining_table",
      entityId: tableId,
      metadata: { status, room: room.label },
    });
    await emit(tx, { topic: topics.restaurant(ctx.restaurant.id), type: "notification.created" });
  });
}

/**
 * The guests leave: the room's visit is closed (refused while room service is unpaid or still
 * being prepared, like any table) and the room goes to housekeeping as "dirty".
 */
export async function checkOutRoom(db: Database, ctx: RestaurantContext, tableId: string) {
  await closeTableSession(db, ctx, tableId);
  await setHousekeeping(db, ctx, tableId, "dirty");
}

/** Who took each request (the board shows the name). */
export async function takersOf(db: DbOrTx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, name: users.fullName })
    .from(users)
    .where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}
