import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { folioLines, nightAudits, ratePlans, roomTypes, stayNights, stays } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays } from "./calc";

/**
 * The hotel's standard reports, read from the closed days (night audits), the nights sold and the
 * folio postings: the manager's report of a day (with month and year to date), the occupancy
 * history of a period, and revenue by channel, rate plan and room type.
 */

const pct = (sold: number, rooms: number) => (rooms ? Math.round((sold / rooms) * 1000) / 10 : 0);
const avg = (cents: number, n: number) => (n ? Math.round(cents / n) : 0);

type Totals = { rooms: number; sold: number; roomCents: number; totalCents: number; days: number };
function figures(t: Totals) {
  return {
    ...t,
    occupancyPct: pct(t.sold, t.rooms),
    adrCents: avg(t.roomCents, t.sold),
    revparCents: avg(t.roomCents, t.rooms),
  };
}

async function auditTotals(db: DbOrTx, rid: string, from: string, to: string): Promise<Totals> {
  const [row] = await db
    .select({
      rooms: sql<number>`coalesce(sum(${nightAudits.roomsAvailable}),0)::int`,
      sold: sql<number>`coalesce(sum(${nightAudits.roomsSold}),0)::int`,
      roomCents: sql<number>`coalesce(sum(${nightAudits.roomRevenueCents}),0)::bigint`.mapWith(Number),
      totalCents: sql<number>`coalesce(sum(${nightAudits.totalRevenueCents}),0)::bigint`.mapWith(Number),
      days: sql<number>`count(*)::int`,
    })
    .from(nightAudits)
    .where(
      and(
        eq(nightAudits.restaurantId, rid),
        gte(nightAudits.businessDate, from),
        lte(nightAudits.businessDate, to),
      ),
    );
  return row ?? { rooms: 0, sold: 0, roomCents: 0, totalCents: 0, days: 0 };
}

/** The last closed day (default day of the manager's report). */
export async function lastClosedDay(db: DbOrTx, restaurantId: string) {
  const [row] = await db
    .select({ day: nightAudits.businessDate })
    .from(nightAudits)
    .where(eq(nightAudits.restaurantId, restaurantId))
    .orderBy(sql`${nightAudits.businessDate} desc`)
    .limit(1);
  return row?.day ?? null;
}

/**
 * Manager's report (گزارش مدیریت) of a closed day: rooms, occupancy, ADR, RevPAR, revenue per
 * department, payments per method, movements of the day; the same figures month and year to
 * date (the year starts on 1 Farvardin in Iran, on 1 January elsewhere).
 */
export async function managerReport(db: DbOrTx, ctx: RestaurantContext, day: string, yearStart: string) {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const monthStart = `${day.slice(0, 8)}01`;
  const [[audit], today, mtd, ytd, payments, moves] = await Promise.all([
    db
      .select()
      .from(nightAudits)
      .where(and(eq(nightAudits.restaurantId, rid), eq(nightAudits.businessDate, day))),
    auditTotals(db, rid, day, day),
    auditTotals(db, rid, monthStart, day),
    auditTotals(db, rid, yearStart, day),
    db
      .select({
        method: folioLines.method,
        cents: sql<number>`coalesce(-sum(${folioLines.amountCents}),0)::bigint`.mapWith(Number),
      })
      .from(folioLines)
      .where(
        and(
          eq(folioLines.restaurantId, rid),
          eq(folioLines.businessDate, day),
          eq(folioLines.kind, "payment"),
          isNull(folioLines.voidedAt),
        ),
      )
      .groupBy(folioLines.method),
    db
      .select({
        arrivals: sql<number>`count(*) filter (where ${stays.arrival} = ${day} and ${stays.status} in ('in_house','checked_out'))::int`,
        departures: sql<number>`count(*) filter (where ${stays.departure} = ${day} and ${stays.status} = 'checked_out')::int`,
        noShows: sql<number>`count(*) filter (where ${stays.arrival} = ${day} and ${stays.status} = 'no_show')::int`,
        cancellations: sql<number>`count(*) filter (where ${stays.status} = 'cancelled' and (${stays.cancelledAt} at time zone ${ctx.restaurant.timezone})::date = ${day}::date)::int`,
        booked: sql<number>`count(*) filter (where (${stays.createdAt} at time zone ${ctx.restaurant.timezone})::date = ${day}::date)::int`,
      })
      .from(stays)
      .where(eq(stays.restaurantId, rid)),
  ]);
  const revenue = Object.entries(audit?.revenue ?? {})
    .filter(([, c]) => c)
    .map(([department, cents]) => ({ department, cents }))
    .sort((a, b) => b.cents - a.cents);
  return {
    day,
    closed: !!audit,
    guests: audit?.guests ?? 0,
    today: figures(today),
    mtd: figures(mtd),
    ytd: figures(ytd),
    revenue,
    payments: payments.filter((p) => p.cents).sort((a, b) => b.cents - a.cents),
    movements: moves[0] ?? { arrivals: 0, departures: 0, noShows: 0, cancellations: 0, booked: 0 },
  };
}

/** Occupancy history (one line per closed day of the period) with its totals. */
export async function occupancyHistory(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "analytics.view");
  const rows = await db
    .select()
    .from(nightAudits)
    .where(
      and(
        eq(nightAudits.restaurantId, ctx.restaurant.id),
        gte(nightAudits.businessDate, from),
        lte(nightAudits.businessDate, to),
      ),
    )
    .orderBy(asc(nightAudits.businessDate));
  const days = rows.map((r) => ({
    day: r.businessDate,
    ...figures({
      rooms: r.roomsAvailable,
      sold: r.roomsSold,
      roomCents: r.roomRevenueCents,
      totalCents: r.totalRevenueCents,
      days: 1,
    }),
    guests: r.guests,
    noShows: r.noShows,
  }));
  return { from, to, days, totals: figures(await auditTotals(db, ctx.restaurant.id, from, to)) };
}

/**
 * Room nights and room revenue of the period by channel (source), rate plan and room type, from
 * the nights of the stays that were (or are being) slept.
 */
export async function revenueBySegment(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const base = and(
    eq(stayNights.restaurantId, rid),
    gte(stayNights.day, from),
    lte(stayNights.day, to),
    inArray(stays.status, ["in_house", "checked_out"]),
  );
  const nights = sql<number>`count(*)::int`;
  const cents = sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint`.mapWith(Number);
  const [bySource, byPlan, byType] = await Promise.all([
    db
      .select({ key: stays.source, nights, cents })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .where(base)
      .groupBy(stays.source),
    db
      .select({ key: sql<string>`coalesce(${ratePlans.name}, '—')`, nights, cents })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .leftJoin(ratePlans, eq(ratePlans.id, stays.ratePlanId))
      .where(base)
      .groupBy(ratePlans.name),
    db
      .select({ key: roomTypes.name, nights, cents })
      .from(stayNights)
      .innerJoin(stays, eq(stays.id, stayNights.stayId))
      .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
      .where(base)
      .groupBy(roomTypes.name),
  ]);
  const shape = (list: { key: string | null; nights: number; cents: number }[]) => {
    const total = list.reduce((s, r) => s + r.cents, 0);
    return list
      .map((r) => ({
        key: r.key ?? "—",
        nights: r.nights,
        cents: r.cents,
        adrCents: avg(r.cents, r.nights),
        sharePct: total ? Math.round((r.cents / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.cents - a.cents);
  };
  const totalNights = bySource.reduce((s, r) => s + r.nights, 0);
  const totalCents = bySource.reduce((s, r) => s + r.cents, 0);
  return {
    from,
    to,
    totals: { nights: totalNights, cents: totalCents, adrCents: avg(totalCents, totalNights) },
    bySource: shape(bySource),
    byPlan: shape(byPlan),
    byType: shape(byType),
  };
}

/** A default period: the last 30 closed days. */
export function defaultPeriod(lastDay: string | null, today: string) {
  const to = lastDay ?? addDays(today, -1);
  return { from: addDays(to, -29), to };
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** CSV of a report (amounts in the hotel's minor units divided by 100: rials in Iran). */
export async function reportCsv(
  db: DbOrTx,
  ctx: RestaurantContext,
  report: "occupancy" | "segments",
  from: string,
  to: string,
  labels: Record<string, string>,
) {
  const money = (c: number) => Math.round(c / 100);
  const lines: (string | number)[][] = [];
  if (report === "occupancy") {
    const h = await occupancyHistory(db, ctx, from, to);
    lines.push(["day", "rooms", "sold", "occupancy %", "ADR", "RevPAR", "room revenue", "total revenue"]);
    for (const d of h.days)
      lines.push([
        d.day,
        d.rooms,
        d.sold,
        d.occupancyPct,
        money(d.adrCents),
        money(d.revparCents),
        money(d.roomCents),
        money(d.totalCents),
      ]);
  } else {
    const s = await revenueBySegment(db, ctx, from, to);
    lines.push(["group", "segment", "room nights", "room revenue", "ADR", "share %"]);
    for (const [group, list] of [
      ["channel", s.bySource],
      ["rate plan", s.byPlan],
      ["room type", s.byType],
    ] as const)
      for (const r of list)
        lines.push([group, labels[r.key] ?? r.key, r.nights, money(r.cents), money(r.adrCents), r.sharePct]);
  }
  return lines.map((l) => l.map(cell).join(",")).join("\n");
}
