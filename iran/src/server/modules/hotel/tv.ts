import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, stays, tvEvents, tvRooms, users } from "@/server/db/schema";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import type { Table } from "@/server/modules/pms/desk-reports";
import { servicesSettings } from "./services";

/**
 * In-room TV (تلویزیون تحت شبکه): each room's TV on or off with its channel package and the
 * message on screen, switched by hand or at check-in / check-out, and the log of it all
 * (گزارش فعالیت). The IPTV server reads the state.
 */

export async function tvBoard(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  return db
    .select({
      roomId: diningTables.id,
      room: diningTables.label,
      zone: diningTables.zone,
      active: sql<boolean>`coalesce(${tvRooms.active}, false)`,
      package: tvRooms.package,
      message: tvRooms.message,
      since: tvRooms.since,
      guest: sql<string | null>`(select trim(concat_ws(' ', g.first_name, g.last_name)) from stays s
        join hotel_guests g on g.id = s.guest_id
        where s.room_id = ${diningTables.id} and s.status = 'in_house' limit 1)`,
    })
    .from(diningTables)
    .leftJoin(tvRooms, eq(tvRooms.roomId, diningTables.id))
    .where(and(eq(diningTables.restaurantId, ctx.restaurant.id), eq(diningTables.kind, "room")))
    .orderBy(asc(diningTables.number), asc(diningTables.label));
}

async function log(
  tx: DbOrTx,
  rid: string,
  e: {
    roomId: string | null;
    stayId?: string | null;
    event: string;
    detail?: string | null;
    userId: string | null;
  },
) {
  await tx.insert(tvEvents).values({
    restaurantId: rid,
    roomId: e.roomId,
    stayId: e.stayId ?? null,
    event: e.event,
    detail: e.detail?.slice(0, 300) ?? null,
    userId: e.userId,
  });
}

async function upsert(
  tx: DbOrTx,
  rid: string,
  roomId: string,
  set: { active?: boolean; package?: string | null; message?: string | null },
) {
  await tx
    .insert(tvRooms)
    .values({
      roomId,
      restaurantId: rid,
      active: set.active ?? false,
      package: set.package ?? null,
      message: set.message ?? null,
      since: new Date(),
    })
    .onConflictDoUpdate({
      target: tvRooms.roomId,
      set: { ...set, ...(set.active !== undefined ? { since: new Date() } : {}), updatedAt: new Date() },
    });
}

async function roomOf(tx: DbOrTx, rid: string, roomId: string) {
  const [r] = await tx
    .select({ id: diningTables.id })
    .from(diningTables)
    .where(
      and(eq(diningTables.id, roomId), eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room")),
    );
  if (!r) throw notFound();
  return r;
}

export const tvSetSchema = z.object({
  active: z.coerce.boolean(),
  package: z.string().trim().max(60).nullish(),
});

export async function setRoomTv(
  db: Database,
  ctx: RestaurantContext,
  roomId: string,
  raw: z.input<typeof tvSetSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const input = tvSetSchema.parse(raw);
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).tv;
  if (input.package && !conf.packages.some((p) => p.name === input.package))
    throw conflict("unknown_package");
  await db.transaction(async (tx) => {
    await roomOf(tx, ctx.restaurant.id, roomId);
    const [before] = await tx.select().from(tvRooms).where(eq(tvRooms.roomId, roomId));
    await upsert(tx, ctx.restaurant.id, roomId, {
      active: input.active,
      package: input.package ?? before?.package ?? null,
    });
    if ((before?.active ?? false) !== input.active)
      await log(tx, ctx.restaurant.id, {
        roomId,
        event: input.active ? "activated" : "deactivated",
        detail: input.package ?? null,
        userId: ctx.user.id,
      });
    else if (input.package && input.package !== before?.package)
      await log(tx, ctx.restaurant.id, {
        roomId,
        event: "package",
        detail: input.package,
        userId: ctx.user.id,
      });
  });
}

/** A message on screen: one room, or every room whose TV is on. */
export async function sendTvMessage(
  db: Database,
  ctx: RestaurantContext,
  roomId: string | null,
  text: string,
) {
  assertCan(ctx, "frontdesk.manage");
  const message = z.string().trim().min(1).max(300).parse(text);
  await db.transaction(async (tx) => {
    if (roomId) {
      await roomOf(tx, ctx.restaurant.id, roomId);
      await upsert(tx, ctx.restaurant.id, roomId, { message });
      await log(tx, ctx.restaurant.id, { roomId, event: "message", detail: message, userId: ctx.user.id });
    } else {
      await tx
        .update(tvRooms)
        .set({ message, updatedAt: new Date() })
        .where(and(eq(tvRooms.restaurantId, ctx.restaurant.id), eq(tvRooms.active, true)));
      await log(tx, ctx.restaurant.id, {
        roomId: null,
        event: "message",
        detail: message,
        userId: ctx.user.id,
      });
    }
  });
}

export async function tvOnCheckIn(db: Database, ctx: RestaurantContext, stayId: string, roomId: string) {
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).tv;
  if (!conf.autoActivate) return;
  const [s] = await db
    .select({ first: hotelGuests.firstName, last: hotelGuests.lastName })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(eq(stays.id, stayId));
  const name = [s?.first, s?.last].filter(Boolean).join(" ");
  const welcome = conf.welcome ? conf.welcome.replaceAll("{name}", name) : null;
  await db.transaction(async (tx) => {
    await upsert(tx, ctx.restaurant.id, roomId, {
      active: true,
      package: conf.packages[0]?.name ?? null,
      message: welcome,
    });
    await log(tx, ctx.restaurant.id, {
      roomId,
      stayId,
      event: "activated",
      detail: "check-in",
      userId: ctx.user.id,
    });
  });
}

export async function tvOnCheckOut(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  roomId: string | null,
) {
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).tv;
  if (!conf.deactivateOnCheckout || !roomId) return;
  await db.transaction(async (tx) => {
    await upsert(tx, ctx.restaurant.id, roomId, { active: false, message: null });
    await log(tx, ctx.restaurant.id, {
      roomId,
      stayId,
      event: "deactivated",
      detail: "check-out",
      userId: ctx.user.id,
    });
  });
}

/** گزارش فعالیت: the TV log over a period of days (the hotel's time zone). */
export async function tvActivity(
  db: DbOrTx,
  ctx: RestaurantContext,
  from: string,
  to: string,
): Promise<Table> {
  assertCan(ctx, "frontdesk.view");
  const tz = ctx.restaurant.timezone;
  const rows = await db
    .select({
      at: tvEvents.createdAt,
      room: diningTables.label,
      event: tvEvents.event,
      detail: tvEvents.detail,
      by: users.fullName,
    })
    .from(tvEvents)
    .leftJoin(diningTables, eq(diningTables.id, tvEvents.roomId))
    .leftJoin(users, eq(users.id, tvEvents.userId))
    .where(
      and(
        eq(tvEvents.restaurantId, ctx.restaurant.id),
        gte(sql`(${tvEvents.createdAt} at time zone ${tz})::date`, sql`${from}::date`),
        lte(sql`(${tvEvents.createdAt} at time zone ${tz})::date`, sql`${to}::date`),
      ),
    )
    .orderBy(desc(tvEvents.createdAt))
    .limit(2000);
  return {
    cols: [
      { key: "at", type: "datetime" },
      { key: "room", type: "text" },
      { key: "event", type: "code", ns: "tv.events" },
      { key: "detail", type: "text" },
      { key: "user", type: "text" },
    ],
    rows: rows.map((r) => ({
      at: r.at.toISOString(),
      room: r.room ?? "—",
      event: r.event,
      detail: r.detail ?? "",
      user: r.by ?? "—",
    })),
  };
}
