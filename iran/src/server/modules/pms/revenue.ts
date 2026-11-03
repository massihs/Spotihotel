import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { pricingRules, ratePlans, roomTypes, stayNights, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { wallTime } from "@/lib/period";
import { addDays, eachNight, keyFigures } from "./calc";
import { getPmsSettings } from "./setup";
import { ACTIVE_STAY, availabilityGrid } from "./stays";

// ─── Dynamic pricing rules ───────────────────────────────────────────────────

export const pricingRuleSchema = z.object({
  roomTypeId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable())
    .nullable()
    .optional(),
  minOccupancyPct: z.coerce.number().int().min(0).max(100),
  withinDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  adjustBps: z.coerce.number().int().min(-9000).max(50_000),
  active: z.coerce.boolean().default(true),
});

export async function listPricingRules(db: DbOrTx, restaurantId: string) {
  return db
    .select({ rule: pricingRules, typeCode: roomTypes.code })
    .from(pricingRules)
    .leftJoin(roomTypes, eq(roomTypes.id, pricingRules.roomTypeId))
    .where(eq(pricingRules.restaurantId, restaurantId))
    .orderBy(asc(pricingRules.minOccupancyPct));
}

export async function savePricingRule(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof pricingRuleSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = pricingRuleSchema.parse(raw);
  const rid = ctx.restaurant.id;
  if (input.roomTypeId) {
    const [t] = await db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(and(eq(roomTypes.id, input.roomTypeId), eq(roomTypes.restaurantId, rid)));
    if (!t) throw notFound("room_type_not_found");
  }
  const values = { ...input, roomTypeId: input.roomTypeId ?? null, withinDays: input.withinDays ?? null };
  const [row] = id
    ? await db
        .update(pricingRules)
        .set(values)
        .where(and(eq(pricingRules.id, id), eq(pricingRules.restaurantId, rid)))
        .returning()
    : await db
        .insert(pricingRules)
        .values({ ...values, restaurantId: rid })
        .returning();
  if (!row) throw notFound();
  await recordAudit(db, {
    action: "pms.pricing_rule_saved",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "pricing_rule",
    entityId: row.id,
    metadata: { minOccupancyPct: input.minOccupancyPct, adjustBps: input.adjustBps },
  });
  return row;
}

export async function deletePricingRule(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  await db
    .delete(pricingRules)
    .where(and(eq(pricingRules.id, id), eq(pricingRules.restaurantId, ctx.restaurant.id)));
}

// ─── Cancellation policy ─────────────────────────────────────────────────────

/**
 * The fee the rate plan's policy sets for cancelling a booking now: the whole stay for a
 * non-refundable rate, the first night inside the free-cancellation window, nothing before it.
 */
export async function cancellationFee(db: DbOrTx, ctx: RestaurantContext, stayId: string, now = new Date()) {
  assertCan(ctx, "frontdesk.view");
  if (!isUuid(stayId)) throw notFound();
  const rid = ctx.restaurant.id;
  const [row] = await db
    .select({ stay: stays, plan: ratePlans })
    .from(stays)
    .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
    .where(and(eq(stays.id, stayId), eq(stays.restaurantId, rid)));
  if (!row) throw notFound();
  const nights = await db
    .select({ day: stayNights.day, rateCents: stayNights.rateCents })
    .from(stayNights)
    .where(eq(stayNights.stayId, stayId))
    .orderBy(asc(stayNights.day));
  const first = nights[0]?.rateCents ?? 0;
  const total = nights.reduce((s, n) => s + n.rateCents, 0);
  if (row.plan && !row.plan.refundable)
    return { feeCents: total, reason: "non_refundable" as const, deadline: null };
  const { checkInTime } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  const arrivalAt = wallTime(row.stay.arrival, checkInTime, ctx.restaurant.timezone);
  const hours = row.plan?.cancelHours ?? 24;
  const deadline = new Date(arrivalAt.getTime() - hours * 3_600_000);
  if (now >= deadline) return { feeCents: first, reason: "late" as const, deadline: deadline.toISOString() };
  return { feeCents: 0, reason: "free" as const, deadline: deadline.toISOString() };
}

// ─── Forecast & channel mix ──────────────────────────────────────────────────

/**
 * On-the-books forecast: for each coming night, rooms sold, held by groups, free, occupancy,
 * room revenue and average rate, arrivals and departures.
 */
export async function forecast(db: Database, ctx: RestaurantContext, from: string, days: number) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const n = Math.max(1, Math.min(days, 92));
  const to = addDays(from, n);
  const [grid, revenue, moves] = await Promise.all([
    availabilityGrid(db, ctx, from, Math.min(n, 62)),
    db
      .select({
        day: stayNights.day,
        sold: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint`.mapWith(Number),
      })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, [...ACTIVE_STAY]),
          gte(stayNights.day, from),
          lt(stayNights.day, to),
        ),
      )
      .groupBy(stayNights.day),
    db.execute<{ day: string; arrivals: number; departures: number }>(sql`
      select d::date::text as day,
        (select count(*)::int from stays s where s.restaurant_id = ${rid} and s.status in ('tentative','confirmed','in_house') and s.arrival = d::date) as arrivals,
        (select count(*)::int from stays s where s.restaurant_id = ${rid} and s.status in ('tentative','confirmed','in_house') and s.departure = d::date) as departures
      from generate_series(${from}::date, ${addDays(to, -1)}::date, interval '1 day') d`),
  ]);
  const rooms = grid.types.reduce((s, t) => s + t.rooms, 0);
  const rev = new Map(revenue.map((r) => [r.day, r]));
  const mv = new Map(moves.rows.map((r) => [r.day, r]));
  const nights = eachNight(from, to).slice(0, grid.nights.length);
  const rows = nights.map((d, i) => {
    const sold = rev.get(d)?.sold ?? 0;
    const blocked = grid.types.reduce((s, t) => s + (t.days[i]?.blocked ?? 0), 0);
    const revenueCents = rev.get(d)?.revenue ?? 0;
    return {
      day: d,
      rooms,
      sold,
      blocked,
      free: rooms - sold - blocked,
      revenueCents,
      arrivals: Number(mv.get(d)?.arrivals ?? 0),
      departures: Number(mv.get(d)?.departures ?? 0),
      ...keyFigures(rooms, sold, revenueCents),
    };
  });
  const sold = rows.reduce((s, r) => s + r.sold, 0);
  const revenueCents = rows.reduce((s, r) => s + r.revenueCents, 0);
  return { rows, totals: { sold, revenueCents, ...keyFigures(rooms * rows.length, sold, revenueCents) } };
}

/** Room nights, revenue and average rate per booking channel over a period. */
export async function channelMix(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "frontdesk.view");
  const rows = await db
    .select({
      source: stays.source,
      bookings: sql<number>`count(distinct ${stays.id})::int`,
      nights: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint`.mapWith(Number),
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        inArray(stays.status, ["tentative", "confirmed", "in_house", "checked_out"]),
        gte(stayNights.day, from),
        lt(stayNights.day, addDays(to, 1)),
      ),
    )
    .groupBy(stays.source);
  const totalNights = rows.reduce((s, r) => s + r.nights, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  return {
    rows: rows
      .map((r) => ({
        ...r,
        adrCents: r.nights ? Math.round(r.revenue / r.nights) : 0,
        sharePct: totalRevenue ? Math.round((r.revenue / totalRevenue) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    totals: {
      nights: totalNights,
      revenue: totalRevenue,
      adrCents: totalNights ? Math.round(totalRevenue / totalNights) : 0,
    },
  };
}
