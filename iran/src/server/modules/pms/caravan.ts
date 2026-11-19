import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, restaurants, roomBlocks, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { randomToken } from "@/lib/ids";
import { prayerTimes, type PrayerTimes } from "@/lib/prayer-times";
import { localDay } from "@/lib/period";
import { autoAssignRooms } from "./booking";
import { checkIn } from "./stays";
import { getPmsSettings } from "./setup";

/**
 * کاروان زیارتی (pilgrim caravans, Mashhad / Qom): a group block run as a caravan. The front desk
 * imports the pilgrims (rooming list), checks the whole caravan in at once, and the caravan's
 * leader follows rooms, programme and prayer times on a private page, in Persian or Arabic.
 */

export const caravanSchema = z.object({
  caravan: z.boolean(),
  schedule: z.string().trim().max(2000).optional(),
});

export async function setCaravan(
  db: DbOrTx,
  ctx: RestaurantContext,
  blockId: string,
  raw: z.input<typeof caravanSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const v = caravanSchema.parse(raw);
  const [block] = await db
    .select()
    .from(roomBlocks)
    .where(and(eq(roomBlocks.id, blockId), eq(roomBlocks.restaurantId, ctx.restaurant.id)));
  if (!block) throw notFound();
  const [row] = await db
    .update(roomBlocks)
    .set({
      caravan: v.caravan,
      schedule: v.schedule || null,
      leaderToken: v.caravan ? (block.leaderToken ?? randomToken(20)) : block.leaderToken,
    })
    .where(eq(roomBlocks.id, block.id))
    .returning();
  await recordAudit(db, {
    action: "block.caravan",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "room_block",
    entityId: block.id,
    metadata: { caravan: v.caravan },
  });
  return row!;
}

/**
 * Checks the caravan in at once: rooms are given to its bookings arriving by today, then each one
 * with a clean room is checked in. Bookings whose room is not ready are counted, not forced.
 */
export async function caravanCheckIn(db: Database, ctx: RestaurantContext, blockId: string) {
  assertCan(ctx, "frontdesk.manage");
  const rid = ctx.restaurant.id;
  const [block] = await db
    .select()
    .from(roomBlocks)
    .where(and(eq(roomBlocks.id, blockId), eq(roomBlocks.restaurantId, rid)));
  if (!block) throw notFound();
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  if (block.departure > businessDate)
    await autoAssignRooms(db, ctx, { from: block.arrival, to: block.departure }).catch(() => null);
  const due = await db
    .select({ id: stays.id })
    .from(stays)
    .where(
      and(
        eq(stays.restaurantId, rid),
        eq(stays.blockId, block.id),
        inArray(stays.status, ["confirmed", "tentative"]),
        lte(stays.arrival, businessDate),
      ),
    )
    .orderBy(asc(stays.number));
  let done = 0;
  const failed: string[] = [];
  for (const s of due) {
    try {
      await checkIn(db, ctx, s.id, {});
      done++;
    } catch (e) {
      failed.push(e instanceof Error ? e.message : String(e));
    }
  }
  await recordAudit(db, {
    action: "block.caravan_checked_in",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "room_block",
    entityId: block.id,
    metadata: { done, waiting: failed.length },
  });
  return { done, waiting: failed.length };
}

export type CaravanView = {
  hotel: { name: string; phone: string | null; brandColor: string | null };
  name: string;
  number: number;
  arrival: string;
  departure: string;
  leader: string | null;
  schedule: string[];
  prayer: PrayerTimes | null;
  pilgrims: { name: string; room: string | null; status: string }[];
};

/** The caravan leader's page (private link): no internal ids, no prices. */
export async function caravanView(db: DbOrTx, token: string): Promise<CaravanView | null> {
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(token)) return null;
  const [row] = await db
    .select({
      block: roomBlocks,
      hotel: {
        name: restaurants.name,
        phone: restaurants.phone,
        brandColor: restaurants.brandColor,
        timezone: restaurants.timezone,
        lat: restaurants.latitude,
        lng: restaurants.longitude,
      },
    })
    .from(roomBlocks)
    .innerJoin(restaurants, eq(restaurants.id, roomBlocks.restaurantId))
    .where(and(eq(roomBlocks.leaderToken, token), eq(roomBlocks.caravan, true)));
  if (!row) return null;
  const list = await db
    .select({
      first: hotelGuests.firstName,
      last: hotelGuests.lastName,
      room: diningTables.label,
      status: stays.status,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(
      and(
        eq(stays.blockId, row.block.id),
        inArray(stays.status, ["tentative", "confirmed", "in_house", "checked_out"]),
      ),
    )
    .orderBy(asc(diningTables.label), asc(hotelGuests.lastName));
  const today = localDay(new Date(), row.hotel.timezone);
  return {
    hotel: { name: row.hotel.name, phone: row.hotel.phone, brandColor: row.hotel.brandColor },
    name: row.block.name,
    number: row.block.number,
    arrival: row.block.arrival,
    departure: row.block.departure,
    leader: row.block.contactName,
    schedule: (row.block.schedule ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
    prayer:
      row.hotel.lat != null && row.hotel.lng != null
        ? prayerTimes(today, row.hotel.lat, row.hotel.lng, row.hotel.timezone)
        : null,
    pilgrims: list.map((p) => ({
      name: `${p.first ?? ""} ${p.last}`.trim(),
      room: p.room,
      status: p.status,
    })),
  };
}
