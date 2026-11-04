import { and, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { diningTables, folioLines, nightAudits, ratePlans, roomTypes, stays } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { localDay } from "@/lib/period";
import { countOpenRequests } from "@/server/modules/hotel/requests";
import { forecast } from "./revenue";
import { frontDesk } from "./stays";

/**
 * The general manager's home: tonight's key figures, the day's arrivals and departures, the rooms
 * to clean, the next two weeks on the books, the day's revenue per department, the last closed
 * day, and what is left to set the hotel up.
 */
export async function hotelHome(db: Database, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const desk = await frontDesk(db, ctx);
  const day = desk.businessDate;
  const [ahead, revenue, [lastAudit], [rooms], [setup], openRequests] = await Promise.all([
    forecast(db, ctx, day, 14),
    db
      .select({
        department: folioLines.department,
        kind: folioLines.kind,
        cents: sql<number>`coalesce(sum(${folioLines.amountCents}),0)::bigint`.mapWith(Number),
      })
      .from(folioLines)
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          eq(folioLines.businessDate, day),
          isNull(folioLines.voidedAt),
          inArray(folioLines.kind, ["charge", "adjustment", "payment"]),
        ),
      )
      .groupBy(folioLines.department, folioLines.kind),
    db
      .select()
      .from(nightAudits)
      .where(eq(nightAudits.restaurantId, rid))
      .orderBy(desc(nightAudits.businessDate))
      .limit(1),
    db
      .select({
        total: count(),
        typed: sql<number>`count(${diningTables.roomTypeId})::int`,
        dirty: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'dirty')::int`,
        cleaning: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'cleaning')::int`,
        outOfOrder: sql<number>`count(*) filter (where ${diningTables.housekeeping} = 'out_of_order')::int`,
      })
      .from(diningTables)
      .where(
        and(eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room"), isNull(diningTables.deletedAt)),
      ),
    db
      .select({
        roomTypes: sql<number>`(select count(*)::int from ${roomTypes} where ${roomTypes.restaurantId} = ${rid})`,
        ratePlans: sql<number>`(select count(*)::int from ${ratePlans} where ${ratePlans.restaurantId} = ${rid})`,
        bookings: sql<number>`(select count(*)::int from ${stays} where ${stays.restaurantId} = ${rid})`,
        precheckins: count(),
      })
      .from(stays)
      .where(and(eq(stays.restaurantId, rid), isNotNull(stays.precheckinAt), eq(stays.arrival, day))),
    countOpenRequests(db, rid),
  ]);

  const byDepartment = new Map<string, number>();
  let paymentsCents = 0;
  for (const r of revenue) {
    if (r.kind === "payment") paymentsCents -= r.cents;
    else byDepartment.set(r.department, (byDepartment.get(r.department) ?? 0) + r.cents);
  }
  const departments = [...byDepartment.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([department, cents]) => ({ department, cents }))
    .sort((a, b) => b.cents - a.cents);

  return {
    businessDate: day,
    /** The calendar day has moved on but the night audit has not been run yet. */
    auditLate: day < localDay(now, ctx.restaurant.timezone),
    figures: desk.figures,
    arrivals: desk.arrivals,
    departures: desk.departures,
    inHouse: desk.inHouse.length,
    precheckins: setup?.precheckins ?? 0,
    rooms: {
      total: rooms?.total ?? 0,
      dirty: rooms?.dirty ?? 0,
      cleaning: rooms?.cleaning ?? 0,
      outOfOrder: rooms?.outOfOrder ?? 0,
    },
    openRequests,
    ahead: ahead.rows.map((r) => ({
      day: r.day,
      occupancyPct: r.occupancyPct,
      sold: r.sold,
      rooms: r.rooms,
      arrivals: r.arrivals,
    })),
    aheadTotals: ahead.totals,
    departments,
    revenueCents: departments.reduce((s, d) => s + d.cents, 0),
    paymentsCents,
    lastAudit: lastAudit
      ? {
          businessDate: lastAudit.businessDate,
          roomsSold: lastAudit.roomsSold,
          roomsAvailable: lastAudit.roomsAvailable,
          roomRevenueCents: lastAudit.roomRevenueCents,
          totalRevenueCents: lastAudit.totalRevenueCents,
          paymentsCents: lastAudit.paymentsCents,
        }
      : null,
    setup: {
      roomTypes: setup?.roomTypes ?? 0,
      ratePlans: setup?.ratePlans ?? 0,
      rooms: rooms?.total ?? 0,
      roomsTyped: (rooms?.total ?? 0) > 0 && rooms?.typed === rooms?.total,
      bookings: setup?.bookings ?? 0,
    },
  };
}
