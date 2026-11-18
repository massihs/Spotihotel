import { createHash } from "node:crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { integritySeals } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { addDays } from "@/server/modules/pms/calc";

/**
 * چشم مالک (Owner's eye): what the owner of a hotel cannot see from the reports.
 *
 * - Rooms used without a stay: on a day no guest was registered in the room, housekeeping found it
 *   dirty, or a laundry / minibar / damage ticket or a request from its QR came from it.
 * - Staff: voided postings, discounts, cash shortages and cancellations, per person.
 * - Guests gone with an unpaid bill, and nights charged far below the room's rate.
 * - Sealed days: each closed business day's postings get a fingerprint; a later change shows.
 */

const num = (v: unknown) => Number(v ?? 0);

export type GhostRoom = { roomId: string; room: string; day: string; kinds: string[]; events: number };
export type StaffRow = {
  userId: string;
  name: string;
  voids: number;
  voidCents: number;
  discounts: number;
  discountCents: number;
  shortCents: number;
  overCents: number;
  cancellations: number;
};
export type UnpaidCheckout = {
  stayId: string;
  number: number;
  guest: string;
  departure: string;
  balanceCents: number;
};
export type CheapNight = {
  stayId: string;
  number: number;
  guest: string;
  day: string;
  chargedCents: number;
  rateCents: number;
};
export type SealRow = { day: string; status: "sealed" | "broken" | "new"; lines: number; totalCents: number };

export type OwnerWatch = {
  from: string;
  to: string;
  score: number;
  ghostRooms: GhostRoom[];
  staff: StaffRow[];
  unpaid: UnpaidCheckout[];
  cheapNights: CheapNight[];
  seals: SealRow[];
};

/** A night charged below this share of the room type's rate is listed. */
const CHEAP_SHARE = 0.6;

export async function ownerWatch(
  db: DbOrTx,
  ctx: RestaurantContext,
  period: { from: string; to: string; today: string },
): Promise<OwnerWatch> {
  assertCan(ctx, "analytics.view");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const { from, to } = period;
  // Moments of the period in the hotel's time zone.
  const inPeriod = (col: string) => sql`(${sql.raw(col)} at time zone ${tz})::date between ${from} and ${to}`;

  const [ghost, staff, unpaid, cheap] = await Promise.all([
    db.execute<{ room_id: string; room: string; day: string; kinds: string[]; events: number }>(sql`
      with ev as (
        select a.entity_id as room_id, (a.created_at at time zone ${tz})::date as day, 'housekeeping' as kind
          from audit_logs a
         where a.restaurant_id = ${rid} and a.action = 'room.housekeeping' and a.actor_type = 'user'
           and a.metadata->>'status' in ('dirty', 'cleaning') and ${inPeriod("a.created_at")}
        union all
        select t.room_id, t.business_date, t.kind
          from service_tickets t
         where t.restaurant_id = ${rid} and t.room_id is not null and t.stay_id is null
           and t.status <> 'cancelled' and t.business_date between ${from} and ${to}
        union all
        select r.table_id, (r.created_at at time zone ${tz})::date, 'request'
          from service_requests r
         where r.restaurant_id = ${rid} and r.table_id is not null and ${inPeriod("r.created_at")}
      )
      select ev.room_id, d.label as room, ev.day::text as day,
             array_agg(distinct ev.kind) as kinds, count(*)::int as events
        from ev
        join dining_tables d on d.id = ev.room_id and d.kind = 'room' and d.restaurant_id = ${rid}
       where not exists (
               select 1 from stays s
                where s.room_id = ev.room_id and s.status in ('in_house', 'checked_out')
                  and s.arrival <= ev.day and s.departure >= ev.day)
         and d.housekeeping <> 'out_of_order'
       group by ev.room_id, d.label, ev.day
       order by ev.day desc, d.label
       limit 200`),
    db.execute<{
      user_id: string;
      name: string;
      voids: number;
      void_cents: number;
      discounts: number;
      discount_cents: number;
      short_cents: number;
      over_cents: number;
      cancellations: number;
    }>(sql`
      select a.actor_user_id as user_id, u.full_name as name,
             count(*) filter (where a.action = 'folio.line_voided')::int as voids,
             coalesce(sum(abs((a.metadata->>'amountCents')::bigint)) filter (where a.action = 'folio.line_voided'), 0) as void_cents,
             count(*) filter (where a.action = 'folio.discount')::int as discounts,
             coalesce(sum(abs((a.metadata->>'amountCents')::bigint)) filter (where a.action = 'folio.discount'), 0) as discount_cents,
             coalesce(sum(-(a.metadata->>'difference')::bigint) filter (where a.action = 'desk_shift.closed' and (a.metadata->>'difference')::bigint < 0), 0) as short_cents,
             coalesce(sum((a.metadata->>'difference')::bigint) filter (where a.action = 'desk_shift.closed' and (a.metadata->>'difference')::bigint > 0), 0) as over_cents,
             count(*) filter (where a.action in ('stay.cancelled', 'order.cancelled', 'service.cancelled'))::int as cancellations
        from audit_logs a
        join users u on u.id = a.actor_user_id
       where a.restaurant_id = ${rid} and ${inPeriod("a.created_at")}
         and a.action in ('folio.line_voided', 'folio.discount', 'desk_shift.closed', 'stay.cancelled', 'order.cancelled', 'service.cancelled')
       group by a.actor_user_id, u.full_name`),
    db.execute<{ stay_id: string; number: number; guest: string; departure: string; balance: number }>(sql`
      select s.id as stay_id, s.number, g.last_name || ' ' || coalesce(g.first_name, '') as guest,
             s.departure::text as departure, sum(l.amount_cents) as balance
        from stays s
        join hotel_guests g on g.id = s.guest_id
        join folios f on f.stay_id = s.id
        join folio_lines l on l.folio_id = f.id and l.voided_at is null
       where s.restaurant_id = ${rid} and s.status = 'checked_out' and s.departure between ${from} and ${to}
       group by s.id, s.number, g.last_name, g.first_name, s.departure
      having sum(l.amount_cents) > 0
       order by sum(l.amount_cents) desc
       limit 100`),
    db.execute<{
      stay_id: string;
      number: number;
      guest: string;
      day: string;
      charged: number;
      rate: number;
    }>(sql`
      select s.id as stay_id, s.number, g.last_name || ' ' || coalesce(g.first_name, '') as guest,
             l.business_date::text as day, l.amount_cents as charged, rt.base_rate_cents as rate
        from folio_lines l
        join folios f on f.id = l.folio_id
        join stays s on s.id = f.stay_id
        join hotel_guests g on g.id = s.guest_id
        join room_types rt on rt.id = s.room_type_id
       where l.restaurant_id = ${rid} and l.kind = 'charge' and l.department = 'room' and l.voided_at is null
         and l.business_date between ${from} and ${to}
         and l.amount_cents > 0 and l.amount_cents < rt.base_rate_cents * ${CHEAP_SHARE}::float
       order by (l.amount_cents::float / nullif(rt.base_rate_cents, 0)) asc
       limit 100`),
  ]);

  const seals = await sealDays(db, rid, tz, period.today);

  const ghostRooms = ghost.rows.map((r) => ({
    roomId: r.room_id,
    room: r.room,
    day: r.day,
    kinds: r.kinds,
    events: num(r.events),
  }));
  const staffRows = staff.rows
    .map((r) => ({
      userId: r.user_id,
      name: r.name,
      voids: num(r.voids),
      voidCents: num(r.void_cents),
      discounts: num(r.discounts),
      discountCents: num(r.discount_cents),
      shortCents: num(r.short_cents),
      overCents: num(r.over_cents),
      cancellations: num(r.cancellations),
    }))
    .sort(
      (a, b) => b.voidCents + b.discountCents + b.shortCents - (a.voidCents + a.discountCents + a.shortCents),
    );
  const unpaidRows = unpaid.rows.map((r) => ({
    stayId: r.stay_id,
    number: num(r.number),
    guest: r.guest.trim(),
    departure: r.departure,
    balanceCents: num(r.balance),
  }));
  const cheapNights = cheap.rows.map((r) => ({
    stayId: r.stay_id,
    number: num(r.number),
    guest: r.guest.trim(),
    day: r.day,
    chargedCents: num(r.charged),
    rateCents: num(r.rate),
  }));

  return {
    from,
    to,
    score: trustScore({
      ghost: ghostRooms.length,
      unpaid: unpaidRows.length,
      shortages: staffRows.filter((s) => s.shortCents > 0).length,
      broken: seals.filter((s) => s.status === "broken").length,
      cheap: cheapNights.length,
    }),
    ghostRooms,
    staff: staffRows,
    unpaid: unpaidRows,
    cheapNights,
    seals,
  };
}

/** 100 when nothing looks wrong; each kind of signal takes off up to a cap. */
export function trustScore(n: {
  ghost: number;
  unpaid: number;
  shortages: number;
  broken: number;
  cheap: number;
}) {
  const off =
    Math.min(30, n.ghost * 3) +
    Math.min(15, n.unpaid * 2) +
    Math.min(15, n.shortages * 3) +
    Math.min(40, n.broken * 20) +
    Math.min(10, n.cheap);
  return Math.max(0, 100 - off);
}

/** Fingerprint of a day: its postings (amount, kind, void) and its audit trail, in a fixed order. */
export function fingerprint(postings: string, audit: string) {
  return createHash("sha256").update(`${postings}#${audit}`).digest("hex");
}

/** How many closed business days are sealed and checked. */
const SEAL_DAYS = 45;

/**
 * Seals the closed business days not sealed yet and checks the others: a day whose postings or
 * audit trail changed since it was sealed is reported "broken" (its seal is kept as evidence).
 */
export async function sealDays(db: DbOrTx, rid: string, tz: string, today: string): Promise<SealRow[]> {
  const first = addDays(today, -SEAL_DAYS);
  const [days, stored] = await Promise.all([
    db.execute<{
      day: string;
      postings: string | null;
      lines: number;
      total: number;
      audit: string | null;
    }>(sql`
      with p as (
        select l.business_date as day,
               string_agg(l.id::text || '|' || l.kind || '|' || l.amount_cents || '|' ||
                          coalesce(extract(epoch from l.voided_at)::bigint::text, ''), ',' order by l.id) as postings,
               count(*)::int as lines, coalesce(sum(l.amount_cents) filter (where l.voided_at is null), 0) as total
          from folio_lines l
         where l.restaurant_id = ${rid} and l.business_date >= ${first} and l.business_date < ${today}
         group by l.business_date),
      a as (
        select (a.created_at at time zone ${tz})::date as day, string_agg(a.id::text, ',' order by a.id) as audit
          from audit_logs a
         where a.restaurant_id = ${rid} and a.created_at >= (${first}::date - 1) and a.created_at < (${today}::date + 1)
           and a.action like 'folio.%'
         group by 1)
      select p.day::text as day, p.postings, p.lines, p.total, a.audit
        from p left join a on a.day = p.day
       order by p.day`),
    db
      .select()
      .from(integritySeals)
      .where(
        and(
          eq(integritySeals.restaurantId, rid),
          gte(integritySeals.day, first),
          lt(integritySeals.day, today),
        ),
      ),
  ]);
  const byDay = new Map(stored.map((s) => [s.day, s]));
  const rows: SealRow[] = [];
  const fresh: (typeof integritySeals.$inferInsert)[] = [];
  for (const d of days.rows) {
    const hash = fingerprint(d.postings ?? "", d.audit ?? "");
    const seal = byDay.get(d.day);
    if (!seal) {
      fresh.push({ restaurantId: rid, day: d.day, hash, lines: num(d.lines), totalCents: num(d.total) });
      rows.push({ day: d.day, status: "new", lines: num(d.lines), totalCents: num(d.total) });
    } else {
      rows.push({
        day: d.day,
        status: seal.hash === hash ? "sealed" : "broken",
        lines: num(d.lines),
        totalCents: num(d.total),
      });
      byDay.delete(d.day);
    }
  }
  // A sealed day whose postings all disappeared.
  for (const seal of byDay.values()) rows.push({ day: seal.day, status: "broken", lines: 0, totalCents: 0 });
  if (fresh.length) await db.insert(integritySeals).values(fresh).onConflictDoNothing();
  return rows.sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** The owner's three numbers for the home page: score, rooms used without a stay, broken seals. */
export async function ownerWatchSummary(db: DbOrTx, ctx: RestaurantContext, today: string) {
  const w = await ownerWatch(db, ctx, { from: addDays(today, -6), to: today, today });
  return {
    score: w.score,
    ghost: w.ghostRooms.length,
    broken: w.seals.filter((s) => s.status === "broken").length,
  };
}
