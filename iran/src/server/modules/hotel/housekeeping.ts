import { and, asc, desc, eq, inArray, isNull, lt, gt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  maintenanceTickets,
  restaurantMembers,
  roomTypes,
  stays,
  users,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { isDay } from "@/server/modules/pms/calc";
import { floorOf } from "./rooms";

/**
 * Housekeeping as a supervisor runs it: every room with its state, who sleeps in it tonight
 * (arrival, departure, stay-over, vacant), the housekeeper it is given to today and its open
 * repairs; rooms are handed out by hand or spread evenly, floor by floor; each housekeeper sees
 * their own list on the phone; the supervisor checks the cleaned rooms. Repairs are tickets that
 * can take a room out of order for a period.
 */

export type Occupancy = "arrival" | "departure" | "stayover" | "vacant";

/** Active members who can be given rooms or repairs. */
export async function hotelStaff(db: DbOrTx, restaurantId: string) {
  return db
    .select({ userId: users.id, name: users.fullName, role: restaurantMembers.role })
    .from(restaurantMembers)
    .innerJoin(users, eq(users.id, restaurantMembers.userId))
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.status, "active")))
    .orderBy(asc(users.fullName));
}

/**
 * Rooms whose repair starts today (or earlier) go out of order, as long as nobody sleeps in them;
 * the plan and new tickets call it, so the board is right without a scheduled job.
 */
async function applyOutOfOrder(tx: DbOrTx, restaurantId: string, day: string) {
  await tx.execute(sql`
    update dining_tables t set housekeeping = 'out_of_order', housekeeping_at = now()
    from maintenance_tickets m
    where m.room_id = t.id and m.restaurant_id = ${restaurantId}
      and m.out_of_order and m.status in ('open', 'in_progress')
      and m.out_from <= ${day}::date and (m.out_until is null or m.out_until > ${day}::date)
      and t.housekeeping <> 'out_of_order'
      and not exists (select 1 from stays s where s.room_id = t.id and s.status = 'in_house')
  `);
}

export async function housekeepingPlan(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "tables.view");
  const rid = ctx.restaurant.id;
  const { businessDate: day } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  await applyOutOfOrder(db, rid, day);
  const [rooms, inRooms, arriving, tickets, staff] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        number: diningTables.number,
        zone: diningTables.zone,
        housekeeping: diningTables.housekeeping,
        housekeepingAt: diningTables.housekeepingAt,
        housekeeperUserId: diningTables.housekeeperUserId,
        housekeeperOn: diningTables.housekeeperOn,
        typeCode: roomTypes.code,
      })
      .from(diningTables)
      .leftJoin(roomTypes, eq(roomTypes.id, diningTables.roomTypeId))
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      )
      .orderBy(asc(diningTables.number), asc(diningTables.label)),
    db
      .select({ roomId: stays.roomId, departure: stays.departure, adults: stays.adults })
      .from(stays)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"))),
    db
      .select({ roomId: stays.roomId, eta: stays.eta })
      .from(stays)
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, ["tentative", "confirmed"]),
          eq(stays.arrival, day),
        ),
      ),
    db
      .select({
        id: maintenanceTickets.id,
        roomId: maintenanceTickets.roomId,
        title: maintenanceTickets.title,
      })
      .from(maintenanceTickets)
      .where(
        and(
          eq(maintenanceTickets.restaurantId, rid),
          inArray(maintenanceTickets.status, ["open", "in_progress"]),
        ),
      ),
    hotelStaff(db, rid),
  ]);
  const list = rooms.map((r) => {
    const inRoom = inRooms.find((s) => s.roomId === r.id);
    const arrival = arriving.find((s) => s.roomId === r.id);
    const occupancy: Occupancy = inRoom
      ? inRoom.departure <= day
        ? "departure"
        : "stayover"
      : arrival
        ? "arrival"
        : "vacant";
    return {
      id: r.id,
      label: r.label,
      typeCode: r.typeCode,
      housekeeping: r.housekeeping,
      housekeepingAt: r.housekeepingAt,
      floor: floorOf(r),
      occupancy,
      eta: arrival?.eta ?? null,
      /** An arrival tonight in a room not ready yet: clean it first. */
      priority: occupancy === "arrival" && !["clean", "inspected"].includes(r.housekeeping),
      housekeeperUserId: r.housekeeperOn === day ? r.housekeeperUserId : null,
      tickets: tickets.filter((t) => t.roomId === r.id).map((t) => ({ id: t.id, title: t.title })),
    };
  });
  const floors = [...new Map(list.map((r) => [r.floor.key, r.floor])).values()].sort(
    (a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label)),
  );
  const load = new Map<string, number>();
  for (const r of list)
    if (r.housekeeperUserId) load.set(r.housekeeperUserId, (load.get(r.housekeeperUserId) ?? 0) + 1);
  return {
    businessDate: day,
    rooms: list,
    floors,
    staff: staff.map((s) => ({ ...s, rooms: load.get(s.userId) ?? 0 })),
    counts: {
      dirty: list.filter((r) => r.housekeeping === "dirty").length,
      cleaning: list.filter((r) => r.housekeeping === "cleaning").length,
      clean: list.filter((r) => r.housekeeping === "clean").length,
      inspected: list.filter((r) => r.housekeeping === "inspected").length,
      outOfOrder: list.filter((r) => r.housekeeping === "out_of_order").length,
      unassigned: list.filter((r) => !r.housekeeperUserId && ["dirty", "cleaning"].includes(r.housekeeping))
        .length,
    },
  };
}

const assignSchema = z.object({
  roomIds: z.array(z.uuid()).min(1).max(1000),
  userId: z.uuid().nullable(),
});

/** Gives rooms to a housekeeper for today (or takes them back with `userId: null`). */
export async function assignHousekeeper(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof assignSchema>,
) {
  assertCan(ctx, "tables.manage");
  const input = assignSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  if (input.userId) {
    const staff = await hotelStaff(db, rid);
    if (!staff.some((s) => s.userId === input.userId)) throw notFound("member_not_found");
  }
  const rows = await db
    .update(diningTables)
    .set({ housekeeperUserId: input.userId, housekeeperOn: input.userId ? businessDate : null })
    .where(
      and(
        eq(diningTables.restaurantId, rid),
        eq(diningTables.kind, "room"),
        inArray(diningTables.id, input.roomIds),
      ),
    )
    .returning({ id: diningTables.id });
  await emit(db, { topic: topics.restaurant(rid), type: "notification.created" });
  return { assigned: rows.length };
}

/**
 * Spreads the rooms to clean (dirty or being cleaned, not yet given to someone) between the
 * chosen housekeepers: rooms with an arrival tonight first, then floor by floor in equal
 * consecutive shares, so each one works on as few floors as possible.
 */
export async function distributeRooms(db: Database, ctx: RestaurantContext, userIds: string[]) {
  assertCan(ctx, "tables.manage");
  const ids = [...new Set(userIds)].filter(isUuid);
  if (!ids.length) throw validation("no_housekeeper", { field: "userIds" });
  const plan = await housekeepingPlan(db, ctx);
  if (ids.some((id) => !plan.staff.some((s) => s.userId === id))) throw notFound("member_not_found");
  const todo = plan.rooms
    .filter((r) => !r.housekeeperUserId && ["dirty", "cleaning"].includes(r.housekeeping))
    .sort(
      (a, b) =>
        Number(b.priority) - Number(a.priority) ||
        a.floor.order - b.floor.order ||
        a.label.localeCompare(b.label, undefined, { numeric: true }),
    );
  const share = Math.ceil(todo.length / ids.length);
  let assigned = 0;
  for (let i = 0; i < ids.length; i++) {
    const part = todo.slice(i * share, (i + 1) * share);
    if (!part.length) continue;
    assigned += (await assignHousekeeper(db, ctx, { roomIds: part.map((r) => r.id), userId: ids[i]! }))
      .assigned;
  }
  return { assigned, housekeepers: ids.length };
}

/** The rooms given to the signed-in housekeeper today, the most urgent first. */
export async function myRooms(db: Database, ctx: RestaurantContext) {
  const plan = await housekeepingPlan(db, ctx);
  const rank = (r: (typeof plan.rooms)[number]) =>
    r.housekeeping === "inspected" || r.housekeeping === "clean"
      ? 9
      : r.priority
        ? 0
        : r.occupancy === "departure"
          ? 1
          : r.occupancy === "vacant"
            ? 2
            : 3;
  return {
    businessDate: plan.businessDate,
    rooms: plan.rooms
      .filter((r) => r.housekeeperUserId === ctx.user.id)
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, undefined, { numeric: true })),
  };
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const optDay = z
  .string()
  .transform((v) => v || null)
  .refine((v) => v == null || isDay(v), "invalid_date")
  .nullable()
  .optional();

export const ticketSchema = z
  .object({
    roomId: z
      .string()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable())
      .nullable()
      .optional(),
    place: optText(80),
    title: z.string().trim().min(1).max(160),
    description: optText(2000),
    priority: z.enum(["low", "normal", "urgent"]).default("normal"),
    outOfOrder: z.coerce.boolean().default(false),
    outFrom: optDay,
    outUntil: optDay,
    assignedToUserId: z
      .string()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable())
      .nullable()
      .optional(),
  })
  .refine((v) => !v.outOfOrder || !!v.roomId, { message: "room_required", path: ["roomId"] })
  .refine((v) => !v.outOfOrder || !v.outFrom || !v.outUntil || v.outUntil > v.outFrom, {
    message: "invalid_range",
    path: ["outUntil"],
  });

/** Reports a repair; out of order, the room cannot be booked over the period (checked here). */
export async function createTicket(db: Database, ctx: RestaurantContext, raw: z.input<typeof ticketSchema>) {
  assertCan(ctx, "orders.update_status");
  const input = ticketSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  return db.transaction(async (tx) => {
    if (input.roomId) {
      const [room] = await tx
        .select({ id: diningTables.id })
        .from(diningTables)
        .where(and(eq(diningTables.id, input.roomId), eq(diningTables.restaurantId, rid)));
      if (!room) throw notFound("room_not_found");
    }
    const outFrom = input.outOfOrder ? (input.outFrom ?? businessDate) : null;
    const outUntil = input.outOfOrder ? (input.outUntil ?? null) : null;
    if (input.outOfOrder && input.roomId) {
      // A booking already in the room over the period has to move first.
      const [booked] = await tx
        .select({ number: stays.number })
        .from(stays)
        .where(
          and(
            eq(stays.roomId, input.roomId),
            inArray(stays.status, ["tentative", "confirmed"]),
            gt(stays.departure, outFrom!),
            outUntil ? lt(stays.arrival, outUntil) : undefined,
          ),
        )
        .limit(1);
      if (booked) throw conflict("room_booked_in_period", { number: booked.number });
    }
    const [ticket] = await tx
      .insert(maintenanceTickets)
      .values({
        restaurantId: rid,
        roomId: input.roomId ?? null,
        place: input.place ?? null,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        outOfOrder: input.outOfOrder,
        outFrom,
        outUntil,
        assignedToUserId: input.assignedToUserId ?? null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await applyOutOfOrder(tx, rid, businessDate);
    await recordAudit(tx, {
      action: "maintenance.reported",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "maintenance_ticket",
      entityId: ticket!.id,
      metadata: { title: input.title, outOfOrder: input.outOfOrder },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return ticket!;
  });
}

export const TICKET_STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

/**
 * Moves a repair on. Finished or cancelled, a room that was out of order for it (and for no other
 * open repair) goes back to housekeeping as dirty: it is cleaned before it is sold again.
 */
export async function setTicketStatus(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  status: (typeof TICKET_STATUSES)[number],
  resolution?: string | null,
) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(id) || !TICKET_STATUSES.includes(status)) throw notFound();
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const closing = status === "done" || status === "cancelled";
    const [ticket] = await tx
      .update(maintenanceTickets)
      .set({
        status,
        resolvedAt: closing ? new Date() : null,
        resolvedByUserId: closing ? ctx.user.id : null,
        resolution: closing ? resolution?.trim().slice(0, 500) || null : null,
      })
      .where(and(eq(maintenanceTickets.id, id), eq(maintenanceTickets.restaurantId, rid)))
      .returning();
    if (!ticket) throw notFound();
    if (closing && ticket.outOfOrder && ticket.roomId) {
      const [other] = await tx
        .select({ id: maintenanceTickets.id })
        .from(maintenanceTickets)
        .where(
          and(
            eq(maintenanceTickets.roomId, ticket.roomId),
            ne(maintenanceTickets.id, ticket.id),
            eq(maintenanceTickets.outOfOrder, true),
            inArray(maintenanceTickets.status, ["open", "in_progress"]),
          ),
        )
        .limit(1);
      if (!other)
        await tx
          .update(diningTables)
          .set({ housekeeping: "dirty", housekeepingAt: new Date() })
          .where(and(eq(diningTables.id, ticket.roomId), eq(diningTables.housekeeping, "out_of_order")));
    }
    await recordAudit(tx, {
      action: "maintenance.status",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "maintenance_ticket",
      entityId: id,
      metadata: { status },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return ticket;
  });
}

/** Open repairs first (urgent on top), then the last ones finished. */
export async function listTickets(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "tables.view");
  const rows = await db
    .select({
      id: maintenanceTickets.id,
      roomId: maintenanceTickets.roomId,
      room: diningTables.label,
      place: maintenanceTickets.place,
      title: maintenanceTickets.title,
      description: maintenanceTickets.description,
      priority: maintenanceTickets.priority,
      status: maintenanceTickets.status,
      outOfOrder: maintenanceTickets.outOfOrder,
      outFrom: maintenanceTickets.outFrom,
      outUntil: maintenanceTickets.outUntil,
      assignedToUserId: maintenanceTickets.assignedToUserId,
      resolution: maintenanceTickets.resolution,
      createdAt: maintenanceTickets.createdAt,
      resolvedAt: maintenanceTickets.resolvedAt,
    })
    .from(maintenanceTickets)
    .leftJoin(diningTables, eq(diningTables.id, maintenanceTickets.roomId))
    .where(
      and(
        eq(maintenanceTickets.restaurantId, ctx.restaurant.id),
        or(
          inArray(maintenanceTickets.status, ["open", "in_progress"]),
          sql`${maintenanceTickets.resolvedAt} > now() - interval '14 days'`,
        ),
      ),
    )
    .orderBy(
      sql`${maintenanceTickets.status} in ('open','in_progress') desc`,
      sql`case ${maintenanceTickets.priority} when 'urgent' then 0 when 'normal' then 1 else 2 end`,
      desc(maintenanceTickets.createdAt),
    )
    .limit(300);
  return rows;
}
