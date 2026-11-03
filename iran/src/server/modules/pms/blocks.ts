import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { hotelAccounts, pmsSettings, roomBlockDays, roomBlocks, roomTypes, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { eachNight, isDay, nightsBetween } from "./calc";
import { blockHeld, createStay } from "./stays";
import { getPmsSettings } from "./setup";

const day = z.string().refine(isDay, "invalid_date");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();
const optUuid = z
  .string()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable())
  .nullable()
  .optional();

export const blockSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    accountId: optUuid,
    contactName: optText(120),
    contactPhone: optText(24),
    status: z.enum(["tentative", "definite"]).default("definite"),
    arrival: day,
    departure: day,
    releaseDate: day,
    ratePlanId: optUuid,
    rateCents: z.coerce.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
    notes: optText(2000),
    /** Rooms held per type, the same every night of the block. */
    rooms: z
      .array(z.object({ roomTypeId: z.uuid(), rooms: z.coerce.number().int().min(1).max(1000) }))
      .min(1)
      .max(30),
  })
  .refine((v) => v.departure > v.arrival && nightsBetween(v.arrival, v.departure) <= 120, {
    message: "invalid_range",
    path: ["departure"],
  })
  .refine((v) => v.releaseDate <= v.arrival, { message: "release_after_arrival", path: ["releaseDate"] });

async function nextBlockNumber(tx: DbOrTx, restaurantId: string) {
  const [row] = await tx
    .update(pmsSettings)
    .set({ nextBlockNumber: sql`${pmsSettings.nextBlockNumber} + 1` })
    .where(eq(pmsSettings.restaurantId, restaurantId))
    .returning({ n: sql<number>`${pmsSettings.nextBlockNumber} - 1` });
  return Number(row!.n);
}

/**
 * Holds rooms for a group. Refused when a night would be over the hotel's capacity (rooms of the
 * type + allowed overbooking − bookings − other blocks), under the room types' row locks.
 */
export async function createBlock(db: Database, ctx: RestaurantContext, raw: z.input<typeof blockSchema>) {
  assertCan(ctx, "frontdesk.manage");
  const input = blockSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const settings = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  if (input.arrival < settings.businessDate) throw validation("arrival_in_past", { field: "arrival" });
  if (input.rateCents != null) assertCan(ctx, "folio.adjust");
  const typeIds = [...new Set(input.rooms.map((r) => r.roomTypeId))];
  if (typeIds.length !== input.rooms.length) throw validation("duplicate_room_type", { field: "rooms" });
  return db.transaction(async (tx) => {
    const types = await tx
      .select({ id: roomTypes.id, overbook: roomTypes.overbookLimit })
      .from(roomTypes)
      .where(and(eq(roomTypes.restaurantId, rid), inArray(roomTypes.id, typeIds)))
      .orderBy(asc(roomTypes.id))
      .for("update");
    if (types.length !== typeIds.length) throw notFound("room_type_not_found");
    if (input.accountId) {
      const [acc] = await tx
        .select({ id: hotelAccounts.id })
        .from(hotelAccounts)
        .where(and(eq(hotelAccounts.id, input.accountId), eq(hotelAccounts.restaurantId, rid)));
      if (!acc) throw notFound("account_not_found");
    }
    const nights = eachNight(input.arrival, input.departure);
    const free = await freeRooms(tx, rid, input.arrival, input.departure);
    for (const r of input.rooms)
      for (const d of nights)
        if ((free.get(`${r.roomTypeId}|${d}`) ?? 0) < r.rooms) throw conflict("no_availability", { day: d });
    const { rooms, ...values } = input;
    const [block] = await tx
      .insert(roomBlocks)
      .values({
        ...values,
        restaurantId: rid,
        number: await nextBlockNumber(tx, rid),
        createdByUserId: ctx.user.id,
      })
      .returning();
    await tx.insert(roomBlockDays).values(
      rooms.flatMap((r) =>
        nights.map((d) => ({
          blockId: block!.id,
          restaurantId: rid,
          roomTypeId: r.roomTypeId,
          day: d,
          rooms: r.rooms,
        })),
      ),
    );
    await recordAudit(tx, {
      action: "block.created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "room_block",
      entityId: block!.id,
      metadata: { name: input.name, rooms: rooms.reduce((s, r) => s + r.rooms, 0), nights: nights.length },
    });
    return block!;
  });
}

/** Rooms still sellable per type and night: capacity − bookings − what blocks hold. */
async function freeRooms(tx: DbOrTx, restaurantId: string, from: string, to: string) {
  const [counts, booked, held] = await Promise.all([
    tx.execute<{ room_type_id: string; capacity: number }>(sql`
      select t.id as room_type_id, (count(r.id) filter (where r.housekeeping <> 'out_of_order'))::int + t.overbook_limit as capacity
      from room_types t left join dining_tables r on r.room_type_id = t.id and r.kind = 'room' and r.deleted_at is null
      where t.restaurant_id = ${restaurantId} and t.deleted_at is null group by t.id`),
    tx.execute<{ room_type_id: string; day: string; n: number }>(sql`
      select s.room_type_id, n.day::text as day, count(*)::int as n from stay_nights n join stays s on s.id = n.stay_id
      where s.restaurant_id = ${restaurantId} and s.status in ('tentative','confirmed','in_house') and n.day >= ${from} and n.day < ${to}
      group by 1, 2`),
    blockHeld(tx, restaurantId, from, to),
  ]);
  const cap = new Map(counts.rows.map((r) => [r.room_type_id, Number(r.capacity)]));
  const sold = new Map(booked.rows.map((r) => [`${r.room_type_id}|${r.day}`, Number(r.n)]));
  const out = new Map<string, number>();
  for (const [typeId, c] of cap)
    for (const d of eachNight(from, to)) {
      const k = `${typeId}|${d}`;
      out.set(k, c - (sold.get(k) ?? 0) - (held.get(k) ?? 0));
    }
  return out;
}

/** Blocks with what was picked up, most recent arrivals first. */
export async function listBlocks(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const rows = await db
    .select({
      block: roomBlocks,
      accountName: hotelAccounts.name,
      roomNights: sql<number>`(select coalesce(sum(d.rooms),0)::int from ${roomBlockDays} d where d.block_id = ${roomBlocks.id})`,
      pickedNights: sql<number>`(select count(*)::int from stay_nights n join stays s on s.id = n.stay_id where s.block_id = ${roomBlocks.id} and s.status in ('tentative','confirmed','in_house','checked_out'))`,
      bookings: sql<number>`(select count(*)::int from ${stays} s where s.block_id = ${roomBlocks.id} and s.status <> 'cancelled')`,
    })
    .from(roomBlocks)
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, roomBlocks.accountId))
    .where(eq(roomBlocks.restaurantId, rid))
    .orderBy(desc(roomBlocks.arrival))
    .limit(200);
  return rows.map((r) => ({
    ...r.block,
    accountName: r.accountName,
    roomNights: r.roomNights,
    pickedNights: r.pickedNights,
    bookings: r.bookings,
    pickupPct: r.roomNights ? Math.round((r.pickedNights / r.roomNights) * 100) : 0,
  }));
}

/** One block: rooms held and picked up per type and night, and its bookings (rooming list). */
export async function getBlock(db: DbOrTx, ctx: RestaurantContext, blockId: string) {
  assertCan(ctx, "frontdesk.view");
  if (!isUuid(blockId)) throw notFound();
  const rid = ctx.restaurant.id;
  const [block] = await db
    .select()
    .from(roomBlocks)
    .where(and(eq(roomBlocks.id, blockId), eq(roomBlocks.restaurantId, rid)));
  if (!block) throw notFound();
  const days = await db
    .select({
      roomTypeId: roomBlockDays.roomTypeId,
      code: roomTypes.code,
      day: roomBlockDays.day,
      rooms: roomBlockDays.rooms,
      picked: sql<number>`(select count(*)::int from stay_nights n join stays s on s.id = n.stay_id where s.block_id = ${roomBlockDays.blockId} and s.room_type_id = ${roomBlockDays.roomTypeId} and n.day = ${roomBlockDays.day} and s.status in ('tentative','confirmed','in_house','checked_out'))`,
    })
    .from(roomBlockDays)
    .innerJoin(roomTypes, eq(roomTypes.id, roomBlockDays.roomTypeId))
    .where(eq(roomBlockDays.blockId, block.id))
    .orderBy(asc(roomTypes.code), asc(roomBlockDays.day));
  const bookings = await db
    .select({
      id: stays.id,
      number: stays.number,
      status: stays.status,
      arrival: stays.arrival,
      departure: stays.departure,
      roomTypeId: stays.roomTypeId,
      guestId: stays.guestId,
    })
    .from(stays)
    .where(and(eq(stays.restaurantId, rid), eq(stays.blockId, block.id)))
    .orderBy(asc(stays.number));
  return { block, days, bookings };
}

export const roomingSchema = z
  .array(
    z.object({
      lastName: z.string().trim().min(1).max(80),
      firstName: z.string().trim().max(80).default(""),
      roomTypeId: z.uuid(),
      adults: z.coerce.number().int().min(1).max(20).default(1),
    }),
  )
  .min(1)
  .max(500);

/**
 * Picks rooms up from a block, one booking per name of the rooming list (the group's dates,
 * rate and company). Stops at the first name the block (and the hotel) can no longer house.
 */
export async function pickupRooming(
  db: Database,
  ctx: RestaurantContext,
  blockId: string,
  raw: z.input<typeof roomingSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const list = roomingSchema.parse(raw);
  const { block } = await getBlock(db, ctx, blockId);
  if (!["tentative", "definite"].includes(block.status)) throw conflict("block_closed");
  const created: string[] = [];
  for (const g of list) {
    const stay = await createStay(db, ctx, {
      guest: { lastName: g.lastName, firstName: g.firstName },
      roomTypeId: g.roomTypeId,
      arrival: block.arrival,
      departure: block.departure,
      adults: g.adults,
      blockId: block.id,
      status: block.status === "tentative" ? "tentative" : "confirmed",
      source: "agency",
      guarantee: block.accountId ? "company" : "none",
    });
    created.push(stay.id);
  }
  return created;
}

/** Releases (rooms left go back to sale) or cancels a block; its bookings are kept. */
export async function setBlockStatus(
  db: Database,
  ctx: RestaurantContext,
  blockId: string,
  status: "definite" | "released" | "cancelled",
) {
  assertCan(ctx, "frontdesk.manage");
  const [row] = await db
    .update(roomBlocks)
    .set({ status })
    .where(and(eq(roomBlocks.id, blockId), eq(roomBlocks.restaurantId, ctx.restaurant.id)))
    .returning({ id: roomBlocks.id });
  if (!row) throw notFound();
  await recordAudit(db, {
    action: `block.${status}`,
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "room_block",
    entityId: blockId,
  });
}

/** Night audit: blocks whose release date has come give their unpicked rooms back. */
export async function releaseDueBlocks(tx: DbOrTx, restaurantId: string, businessDate: string) {
  const rows = await tx
    .update(roomBlocks)
    .set({ status: "released" })
    .where(
      and(
        eq(roomBlocks.restaurantId, restaurantId),
        inArray(roomBlocks.status, ["tentative", "definite"]),
        sql`${roomBlocks.releaseDate} <= ${businessDate}`,
      ),
    )
    .returning({ id: roomBlocks.id });
  return rows.length;
}
