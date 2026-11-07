import { createHash } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folios,
  pricingRules,
  roomBlockDays,
  roomBlocks,
  hotelAccounts,
  hotelGuests,
  pmsSettings,
  ratePlans,
  rateDays,
  roomTypes,
  stayNights,
  stays,
  tableSessions,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { addDays, eachNight, isDay, keyFigures, nightPrice, nightsBetween } from "./calc";
import { createGuest, guestFields, nationalCodeOk, nationalCodeRule } from "./guests";
import { getPmsSettings } from "./setup";
import {
  accountFolioOf,
  closeFolios,
  folioBalance,
  mainFolioOf,
  postLine,
  stayFolios,
  transferToAccount,
} from "./folios";
import { chargeRoomOrders } from "./room-charges";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const STAY_STATUSES = [
  "tentative",
  "confirmed",
  "in_house",
  "checked_out",
  "cancelled",
  "no_show",
] as const;
/** Statuses that hold a room. */
export const ACTIVE_STAY = ["tentative", "confirmed", "in_house"] as const;
export const SOURCES = [
  "direct",
  "phone",
  "walk_in",
  "website",
  "email",
  "agency",
  // Iranian booking platforms
  "snapptrip",
  "alibaba",
  "jabama",
  "eghamat24",
  "jainjas",
  "flytoday",
  "otaghak",
  // International channels (not reachable from Iran)
  "booking",
  "expedia",
  "airbnb",
  "other",
] as const;
export const GUARANTEES = ["none", "card", "deposit", "company"] as const;

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

// ─── Pricing & availability ──────────────────────────────────────────────────

async function loadType(db: DbOrTx, restaurantId: string, roomTypeId: string) {
  const [type] = await db
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, roomTypeId),
        eq(roomTypes.restaurantId, restaurantId),
        isNull(roomTypes.deletedAt),
      ),
    );
  if (!type) throw notFound("room_type_not_found");
  return type;
}

async function loadPlan(db: DbOrTx, restaurantId: string, ratePlanId: string | null | undefined) {
  const [plan] = await db
    .select()
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.restaurantId, restaurantId),
        isNull(ratePlans.deletedAt),
        ratePlanId ? eq(ratePlans.id, ratePlanId) : eq(ratePlans.isDefault, true),
      ),
    )
    .limit(1);
  if (ratePlanId && !plan) throw notFound("rate_plan_not_found");
  return plan ?? null;
}

/**
 * Nightly prices of a stay and the reasons it cannot be sold (a closed day, a minimum stay).
 * `fixedRateCents` is a negotiated price per night that replaces the calculated one.
 */
export async function quoteStay(
  db: DbOrTx,
  restaurantId: string,
  q: {
    roomTypeId: string;
    ratePlanId?: string | null;
    arrival: string;
    departure: string;
    adults: number;
    fixedRateCents?: number | null;
    /** The hotel's business day: enables last-minute pricing rules. */
    today?: string;
    /** Group block whose rooms the stay uses (they are not counted as sold for pricing). */
    blockId?: string | null;
  },
) {
  const type = await loadType(db, restaurantId, q.roomTypeId);
  const plan = await loadPlan(db, restaurantId, q.ratePlanId);
  const nights = eachNight(q.arrival, q.departure);
  const days = nights.length
    ? await db
        .select()
        .from(rateDays)
        .where(and(eq(rateDays.roomTypeId, type.id), inArray(rateDays.day, nights)))
    : [];
  const byDay = new Map(days.map((d) => [d.day, d]));
  const issues: string[] = [];
  if (nights.some((d) => byDay.get(d)?.closed)) issues.push("closed");
  const minStay = Math.max(plan?.minStay ?? 1, byDay.get(q.arrival)?.minStay ?? 1);
  if (nights.length < minStay) issues.push("min_stay");
  if (q.adults > type.maxOccupancy) issues.push("too_many_guests");
  // Revenue management: the night's occupancy on the books picks the price adjustment.
  const rules =
    q.fixedRateCents == null && nights.length
      ? await db
          .select()
          .from(pricingRules)
          .where(
            and(
              eq(pricingRules.restaurantId, restaurantId),
              eq(pricingRules.active, true),
              or(isNull(pricingRules.roomTypeId), eq(pricingRules.roomTypeId, type.id)),
            ),
          )
      : [];
  let occupancy = new Map<string, number>();
  if (rules.length) {
    const [counts, booked, held] = await Promise.all([
      roomCounts(db, restaurantId),
      bookedCounts(db, restaurantId, q.arrival, q.departure),
      blockHeld(db, restaurantId, q.arrival, q.departure),
    ]);
    const total = counts.get(type.id)?.rooms ?? 0;
    occupancy = new Map(
      nights.map((d) => {
        const k = `${type.id}|${d}`;
        const own = q.blockId ? 0 : (held.get(k) ?? 0);
        return [d, total ? Math.round((((booked.get(k) ?? 0) + own) / total) * 100) : 100];
      }),
    );
  }
  const lead = q.today ? nightsBetween(q.today, q.arrival) : null;
  const priced = nights.map((d) => {
    const base = q.fixedRateCents ?? nightPrice(type, byDay.get(d)?.rateCents, plan, q.adults);
    const occ = occupancy.get(d) ?? 0;
    const rule = rules
      .filter(
        (r) => occ >= r.minOccupancyPct && (r.withinDays == null || (lead != null && lead <= r.withinDays)),
      )
      .sort((a, b) => b.minOccupancyPct - a.minOccupancyPct || b.adjustBps - a.adjustBps)[0];
    const adjustBps = rule?.adjustBps ?? 0;
    return {
      day: d,
      rateCents: adjustBps ? Math.max(0, Math.round((base * (10_000 + adjustBps)) / 10_000)) : base,
      adjustBps,
    };
  });
  return {
    type,
    plan,
    nights: priced.map(({ day, rateCents }) => ({ day, rateCents })),
    adjustments: priced.filter((n) => n.adjustBps).map(({ day, adjustBps }) => ({ day, adjustBps })),
    totalCents: priced.reduce((s, n) => s + n.rateCents, 0),
    minStay,
    issues,
  };
}

/**
 * Rooms of each type that can be sold (out-of-order rooms are not), and the capacity including
 * the controlled overbooking allowed on the type.
 */
async function roomCounts(db: DbOrTx, restaurantId: string) {
  const [rows, types] = await Promise.all([
    db
      .select({ roomTypeId: diningTables.roomTypeId, n: sql<number>`count(*)::int` })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, restaurantId),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
          ne(diningTables.housekeeping, "out_of_order"),
        ),
      )
      .groupBy(diningTables.roomTypeId),
    db
      .select({ id: roomTypes.id, overbook: roomTypes.overbookLimit })
      .from(roomTypes)
      .where(eq(roomTypes.restaurantId, restaurantId)),
  ]);
  const over = new Map(types.map((t) => [t.id, t.overbook]));
  return new Map(
    rows.map((r) => [
      r.roomTypeId,
      { rooms: r.n, capacity: r.n + (r.roomTypeId ? (over.get(r.roomTypeId) ?? 0) : 0) },
    ]),
  );
}

/**
 * Rooms still held by active group blocks per type and night (allotted minus picked up), and
 * per block (what each block has left).
 */
export async function blockHeld(db: DbOrTx, restaurantId: string, from: string, to: string) {
  const rows = await db
    .select({
      blockId: roomBlockDays.blockId,
      roomTypeId: roomBlockDays.roomTypeId,
      day: roomBlockDays.day,
      rooms: roomBlockDays.rooms,
      picked: sql<number>`(select count(*)::int from ${stayNights} sn join ${stays} s on s.id = sn.stay_id where s.block_id = ${roomBlockDays.blockId} and s.room_type_id = ${roomBlockDays.roomTypeId} and sn.day = ${roomBlockDays.day} and s.status in ('tentative','confirmed','in_house'))`,
    })
    .from(roomBlockDays)
    .innerJoin(roomBlocks, eq(roomBlocks.id, roomBlockDays.blockId))
    .where(
      and(
        eq(roomBlockDays.restaurantId, restaurantId),
        inArray(roomBlocks.status, ["tentative", "definite"]),
        gte(roomBlockDays.day, from),
        lt(roomBlockDays.day, to),
      ),
    );
  const byType = new Map<string, number>() as Map<string, number> & { perBlock?: Map<string, number> };
  const perBlock = new Map<string, number>();
  for (const r of rows) {
    const left = Math.max(0, r.rooms - r.picked);
    const k = `${r.roomTypeId}|${r.day}`;
    byType.set(k, (byType.get(k) ?? 0) + left);
    perBlock.set(`${r.blockId}|${k}`, left);
  }
  byType.perBlock = perBlock;
  return byType;
}

/** Rooms booked per type and night over [from, to) (active stays only). */
async function bookedCounts(
  db: DbOrTx,
  restaurantId: string,
  from: string,
  to: string,
  excludeStayId?: string,
) {
  const rows = await db
    .select({
      roomTypeId: stays.roomTypeId,
      day: stayNights.day,
      n: sql<number>`count(*)::int`,
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .where(
      and(
        eq(stays.restaurantId, restaurantId),
        inArray(stays.status, [...ACTIVE_STAY]),
        gte(stayNights.day, from),
        lt(stayNights.day, to),
        excludeStayId ? ne(stays.id, excludeStayId) : undefined,
      ),
    )
    .groupBy(stays.roomTypeId, stayNights.day);
  const out = new Map<string, number>();
  for (const r of rows) out.set(`${r.roomTypeId}|${r.day}`, r.n);
  return out;
}

/** Free rooms per type and night (the availability grid of the booking screen). */
export async function availabilityGrid(db: DbOrTx, ctx: RestaurantContext, from: string, days: number) {
  assertCan(ctx, "frontdesk.view");
  return availabilityOf(db, ctx.restaurant.id, from, days);
}

/** Rooms free per type and night (the grid above, for callers that checked access themselves). */
export async function availabilityOf(db: DbOrTx, rid: string, from: string, days: number) {
  const n = Math.max(1, Math.min(days, 62));
  const to = addDays(from, n);
  const [types, counts, booked, rates, held] = await Promise.all([
    db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.restaurantId, rid), isNull(roomTypes.deletedAt)))
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.baseRateCents)),
    roomCounts(db, rid),
    bookedCounts(db, rid, from, to),
    db
      .select()
      .from(rateDays)
      .where(and(eq(rateDays.restaurantId, rid), gte(rateDays.day, from), lt(rateDays.day, to))),
    blockHeld(db, rid, from, to),
  ]);
  const rateMap = new Map(rates.map((r) => [`${r.roomTypeId}|${r.day}`, r]));
  const nights = eachNight(from, to);
  return {
    nights,
    types: types.map((t) => {
      const total = counts.get(t.id)?.rooms ?? 0;
      return {
        id: t.id,
        code: t.code,
        name: t.name,
        rooms: total,
        days: nights.map((d) => {
          const r = rateMap.get(`${t.id}|${d}`);
          const sold = booked.get(`${t.id}|${d}`) ?? 0;
          const blocked = held.get(`${t.id}|${d}`) ?? 0;
          return {
            day: d,
            free: total - sold - blocked,
            sold,
            blocked,
            rateCents: r?.rateCents ?? t.baseRateCents,
            closed: r?.closed ?? false,
            minStay: r?.minStay ?? null,
          };
        }),
      };
    }),
  };
}

/**
 * Refuses a stay when a night of its type is full, or its room is taken. Callers hold the room
 * type's row lock, so two bookings of the last room cannot both pass.
 */
async function assertBookable(
  tx: DbOrTx,
  restaurantId: string,
  s: {
    roomTypeId: string;
    roomId: string | null;
    arrival: string;
    departure: string;
    blockId?: string | null;
  },
  excludeStayId?: string,
) {
  const counts = await roomCounts(tx, restaurantId);
  const capacity = counts.get(s.roomTypeId)?.capacity ?? 0;
  const [booked, held] = await Promise.all([
    bookedCounts(tx, restaurantId, s.arrival, s.departure, excludeStayId),
    blockHeld(tx, restaurantId, s.arrival, s.departure),
  ]);
  for (const d of eachNight(s.arrival, s.departure)) {
    const k = `${s.roomTypeId}|${d}`;
    // A room picked up from its block uses a room the block already holds.
    if (s.blockId && (held.perBlock?.get(`${s.blockId}|${k}`) ?? 0) > 0) continue;
    if ((booked.get(k) ?? 0) + (held.get(k) ?? 0) >= capacity) throw conflict("no_availability", { day: d });
  }
  if (s.roomId) await assertRoomFree(tx, restaurantId, s.roomId, s.arrival, s.departure, excludeStayId);
}

async function assertRoomFree(
  tx: DbOrTx,
  restaurantId: string,
  roomId: string,
  arrival: string,
  departure: string,
  excludeStayId?: string,
) {
  const [clash] = await tx
    .select({ id: stays.id, number: stays.number })
    .from(stays)
    .where(
      and(
        eq(stays.restaurantId, restaurantId),
        eq(stays.roomId, roomId),
        inArray(stays.status, [...ACTIVE_STAY]),
        lt(stays.arrival, departure),
        gt(stays.departure, arrival),
        excludeStayId ? ne(stays.id, excludeStayId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw conflict("room_taken", { stay: clash.number });
}

async function loadRoom(tx: DbOrTx, restaurantId: string, roomId: string) {
  const [room] = await tx
    .select()
    .from(diningTables)
    .where(
      and(
        eq(diningTables.id, roomId),
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.kind, "room"),
        isNull(diningTables.deletedAt),
      ),
    );
  if (!room) throw notFound("room_not_found");
  return room;
}

/** Serializes bookings of one room type (availability check + insert). */
async function lockType(tx: DbOrTx, roomTypeId: string) {
  await tx.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.id, roomTypeId)).for("update");
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export const staySchema = z
  .object({
    /** An existing guest profile… */
    guestId: optUuid,
    /** …or a new one created with the booking. */
    guest: guestFields.partial({ lastName: true }).refine(nationalCodeOk, nationalCodeRule).optional(),
    roomTypeId: z.uuid(),
    ratePlanId: optUuid,
    roomId: optUuid,
    accountId: optUuid,
    /** Picked up from a group block: the block's rate, plan and company apply. */
    blockId: optUuid,
    arrival: day,
    departure: day,
    adults: z.coerce.number().int().min(1).max(20).default(1),
    children: z.coerce.number().int().min(0).max(20).default(0),
    status: z.enum(["tentative", "confirmed"]).default("confirmed"),
    source: z.enum(SOURCES).default("direct"),
    channelRef: optText(64),
    eta: z
      .string()
      .transform((v) => v || null)
      .pipe(
        z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
      )
      .nullable()
      .optional(),
    guarantee: z.enum(GUARANTEES).default("none"),
    /** Negotiated price per night (replaces the calculated rate). */
    fixedRateCents: z.coerce.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
    notes: optText(2000),
    /** Book even though a day is closed / under the minimum stay (manager's decision). */
    override: z.coerce.boolean().default(false),
  })
  .refine((v) => v.departure > v.arrival, { message: "invalid_range", path: ["departure"] })
  .refine((v) => nightsBetween(v.arrival, v.departure) <= 365, {
    message: "invalid_range",
    path: ["departure"],
  })
  .refine((v) => v.guestId || v.guest?.lastName, { message: "guest_required", path: ["guest.lastName"] });

async function nextStayNumber(tx: DbOrTx, restaurantId: string) {
  const [row] = await tx
    .update(pmsSettings)
    .set({ nextStayNumber: sql`${pmsSettings.nextStayNumber} + 1` })
    .where(eq(pmsSettings.restaurantId, restaurantId))
    .returning({ n: sql<number>`${pmsSettings.nextStayNumber} - 1` });
  return Number(row!.n);
}

export async function createStay(db: Database, ctx: RestaurantContext, raw: z.input<typeof staySchema>) {
  assertCan(ctx, "frontdesk.manage");
  const input = staySchema.parse(raw);
  const rid = ctx.restaurant.id;
  const settings = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  if (input.arrival < settings.businessDate) throw validation("arrival_in_past", { field: "arrival" });
  if (input.fixedRateCents != null && !input.blockId) assertCan(ctx, "folio.adjust");

  const stay = await db.transaction(async (tx) => {
    await lockType(tx, input.roomTypeId);
    // A room of a group block: inside its dates, at the group's rate, billed to its company.
    if (input.blockId) {
      const [block] = await tx
        .select()
        .from(roomBlocks)
        .where(and(eq(roomBlocks.id, input.blockId), eq(roomBlocks.restaurantId, rid)));
      if (!block || !["tentative", "definite"].includes(block.status)) throw notFound("block_not_found");
      if (input.arrival < block.arrival || input.departure > block.departure)
        throw validation("outside_block", { field: "arrival" });
      if (input.fixedRateCents == null && block.rateCents != null) input.fixedRateCents = block.rateCents;
      input.ratePlanId ??= block.ratePlanId;
      input.accountId ??= block.accountId;
    }
    const quote = await quoteStay(tx, rid, { ...input, today: settings.businessDate });
    if (quote.issues.includes("too_many_guests")) throw validation("too_many_guests", { field: "adults" });
    if (quote.issues.length && !input.override) throw conflict(quote.issues[0]!, { minStay: quote.minStay });
    if (input.override && quote.issues.length) assertCan(ctx, "rates.manage");
    if (input.roomId) {
      const room = await loadRoom(tx, rid, input.roomId);
      if (room.roomTypeId !== input.roomTypeId) throw validation("room_type_mismatch", { field: "roomId" });
    }
    await assertBookable(tx, rid, { ...input, roomId: input.roomId ?? null, blockId: input.blockId ?? null });
    if (input.accountId) {
      const [acc] = await tx
        .select({ id: hotelAccounts.id })
        .from(hotelAccounts)
        .where(and(eq(hotelAccounts.id, input.accountId), eq(hotelAccounts.restaurantId, rid)));
      if (!acc) throw notFound("account_not_found");
    }
    let guestId = input.guestId ?? null;
    if (guestId) {
      const [g] = await tx
        .select({ id: hotelGuests.id, blacklisted: hotelGuests.blacklisted })
        .from(hotelGuests)
        .where(and(eq(hotelGuests.id, guestId), eq(hotelGuests.restaurantId, rid)));
      if (!g) throw notFound("guest_not_found");
      if (g.blacklisted) throw conflict("guest_blacklisted");
    } else {
      guestId = (await createGuest(tx, ctx, { ...input.guest, lastName: input.guest!.lastName! })).id;
    }
    const [created] = await tx
      .insert(stays)
      .values({
        restaurantId: rid,
        number: await nextStayNumber(tx, rid),
        code: randomToken(12),
        status: input.status,
        roomTypeId: input.roomTypeId,
        roomId: input.roomId ?? null,
        ratePlanId: quote.plan?.id ?? null,
        arrival: input.arrival,
        departure: input.departure,
        adults: input.adults,
        children: input.children,
        guestId,
        accountId: input.accountId ?? null,
        blockId: input.blockId ?? null,
        source: input.source,
        channelRef: input.channelRef ?? null,
        eta: input.eta ?? null,
        guarantee: input.guarantee,
        totalCents: quote.totalCents,
        notes: input.notes ?? null,
        createdByUserId: ctx.user.id,
      })
      .returning();
    await tx
      .insert(stayNights)
      .values(quote.nights.map((n) => ({ stayId: created!.id, restaurantId: rid, ...n })));
    await mainFolioOf(tx, rid, created!.id);
    await recordAudit(tx, {
      action: "stay.created",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: created!.id,
      metadata: {
        number: created!.number,
        arrival: input.arrival,
        departure: input.departure,
        totalCents: quote.totalCents,
        override: input.override && quote.issues.length ? quote.issues : undefined,
      },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return created!;
  });
  return stay;
}

async function lockStay(tx: DbOrTx, restaurantId: string, stayId: string) {
  if (!isUuid(stayId)) throw notFound();
  const [s] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.id, stayId), eq(stays.restaurantId, restaurantId)))
    .for("update");
  if (!s) throw notFound();
  return s;
}

export const amendSchema = z
  .object({
    arrival: day,
    departure: day,
    adults: z.coerce.number().int().min(1).max(20),
    children: z.coerce.number().int().min(0).max(20).default(0),
    roomTypeId: z.uuid(),
    ratePlanId: optUuid,
    fixedRateCents: z.coerce.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
    eta: z
      .string()
      .transform((v) => v || null)
      .nullable()
      .optional(),
    notes: optText(2000),
    accountId: optUuid,
    override: z.coerce.boolean().default(false),
  })
  .refine((v) => v.departure > v.arrival, { message: "invalid_range", path: ["departure"] });

/**
 * Changes dates, type, plan or guests of a stay that has not left. Nights already charged are
 * kept as they are (their price and date); the others are re-priced.
 */
export async function amendStay(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  raw: z.input<typeof amendSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const input = amendSchema.parse(raw);
  if (input.fixedRateCents != null) assertCan(ctx, "folio.adjust");
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const s = await lockStay(tx, rid, stayId);
    if (!(ACTIVE_STAY as readonly string[]).includes(s.status)) throw conflict("stay_closed");
    const posted = await tx
      .select({ day: stayNights.day })
      .from(stayNights)
      .where(and(eq(stayNights.stayId, s.id), sql`${stayNights.postedAt} is not null`));
    const postedDays = new Set(posted.map((p) => p.day));
    if (s.status === "in_house" && input.arrival !== s.arrival) throw conflict("arrival_locked");
    if (posted.some((p) => p.day >= input.departure)) throw conflict("nights_already_charged");
    await lockType(tx, input.roomTypeId);
    const { businessDate } = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const quote = await quoteStay(tx, rid, { ...input, today: businessDate, blockId: s.blockId });
    if (quote.issues.includes("too_many_guests")) throw validation("too_many_guests", { field: "adults" });
    if (quote.issues.length && !input.override) throw conflict(quote.issues[0]!, { minStay: quote.minStay });
    const roomId = input.roomTypeId === s.roomTypeId ? s.roomId : null;
    if (s.status === "in_house" && !roomId) throw conflict("move_room_first");
    await assertBookable(tx, rid, { ...input, roomId, blockId: s.blockId }, s.id);
    await tx.delete(stayNights).where(and(eq(stayNights.stayId, s.id), isNull(stayNights.postedAt)));
    const fresh = quote.nights.filter((n) => !postedDays.has(n.day));
    if (fresh.length)
      await tx.insert(stayNights).values(fresh.map((n) => ({ stayId: s.id, restaurantId: rid, ...n })));
    const [total] = await tx
      .select({ t: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint` })
      .from(stayNights)
      .where(eq(stayNights.stayId, s.id));
    const [updated] = await tx
      .update(stays)
      .set({
        arrival: input.arrival,
        departure: input.departure,
        adults: input.adults,
        children: input.children,
        roomTypeId: input.roomTypeId,
        roomId,
        ratePlanId: quote.plan?.id ?? null,
        eta: input.eta ?? null,
        notes: input.notes ?? null,
        accountId: input.accountId ?? null,
        totalCents: Number(total?.t ?? 0),
      })
      .where(eq(stays.id, s.id))
      .returning();
    await recordAudit(tx, {
      action: "stay.amended",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: s.id,
      metadata: {
        from: { arrival: s.arrival, departure: s.departure, roomTypeId: s.roomTypeId },
        to: { arrival: input.arrival, departure: input.departure, roomTypeId: input.roomTypeId },
      },
    });
    return updated!;
  });
}

/** Puts a stay in a room (allocation), or moves an in-house guest to another room. */
export async function assignRoom(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  roomId: string | null,
) {
  assertCan(ctx, "frontdesk.manage");
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const s = await lockStay(tx, rid, stayId);
    if (!(ACTIVE_STAY as readonly string[]).includes(s.status)) throw conflict("stay_closed");
    if (!roomId) {
      if (s.status === "in_house") throw conflict("in_house_needs_room");
      await tx.update(stays).set({ roomId: null }).where(eq(stays.id, s.id));
      return;
    }
    const room = await loadRoom(tx, rid, roomId);
    if (room.housekeeping === "out_of_order") throw conflict("room_out_of_order");
    if (!room.roomTypeId) throw conflict("room_without_type");
    // From today for a guest already in: the past nights stay where they were.
    const settings = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const from = s.status === "in_house" ? settings.businessDate : s.arrival;
    if (room.roomTypeId !== s.roomTypeId) {
      // Upgrade / change of type: availability is checked for the new type, the price is kept.
      await lockType(tx, room.roomTypeId);
      await assertBookable(
        tx,
        rid,
        { roomTypeId: room.roomTypeId, roomId: room.id, arrival: from, departure: s.departure },
        s.id,
      );
    } else {
      await assertRoomFree(tx, rid, room.id, from, s.departure, s.id);
    }
    const previous = s.roomId;
    await tx.update(stays).set({ roomId: room.id, roomTypeId: room.roomTypeId }).where(eq(stays.id, s.id));
    if (s.status === "in_house" && previous && previous !== room.id) {
      await tx
        .update(diningTables)
        .set({ housekeeping: "dirty", housekeepingAt: new Date() })
        .where(eq(diningTables.id, previous));
    }
    await recordAudit(tx, {
      action: s.status === "in_house" ? "stay.room_moved" : "stay.room_assigned",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: s.id,
      metadata: { from: previous, to: room.label },
    });
  });
}

/** First free clean room of the stay's type (automatic allocation at check-in). */
export async function suggestRoom(db: DbOrTx, restaurantId: string, stay: typeof stays.$inferSelect) {
  const rooms = await db
    .select({ id: diningTables.id, label: diningTables.label, housekeeping: diningTables.housekeeping })
    .from(diningTables)
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.kind, "room"),
        eq(diningTables.roomTypeId, stay.roomTypeId),
        isNull(diningTables.deletedAt),
        ne(diningTables.housekeeping, "out_of_order"),
      ),
    )
    .orderBy(sql`${diningTables.housekeeping} in ('clean','inspected') desc`, asc(diningTables.number));
  for (const r of rooms) {
    const [clash] = await db
      .select({ id: stays.id })
      .from(stays)
      .where(
        and(
          eq(stays.roomId, r.id),
          ne(stays.id, stay.id),
          or(
            // Booked over the same nights…
            and(
              inArray(stays.status, [...ACTIVE_STAY]),
              lt(stays.arrival, stay.departure),
              gt(stays.departure, stay.arrival),
            ),
            // …or a guest still in the room (a late departure not checked out yet).
            eq(stays.status, "in_house"),
          ),
        ),
      )
      .limit(1);
    if (!clash) return r;
  }
  return null;
}

export const checkInSchema = z.object({
  roomId: optUuid,
  /** Allow a room that housekeeping has not cleaned yet. */
  allowDirty: z.coerce.boolean().default(false),
});

export async function checkIn(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  raw: z.input<typeof checkInSchema> = {},
) {
  assertCan(ctx, "frontdesk.manage");
  const input = checkInSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const result = await db.transaction(async (tx) => {
    const s = await lockStay(tx, rid, stayId);
    if (s.status !== "confirmed" && s.status !== "tentative") throw conflict("not_arriving");
    const settings = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    if (s.arrival > settings.businessDate) throw conflict("arrival_not_today");
    if (s.departure <= settings.businessDate) throw conflict("stay_already_over");
    const [g] = await tx.select().from(hotelGuests).where(eq(hotelGuests.id, s.guestId));
    if (g?.blacklisted) throw conflict("guest_blacklisted");
    let roomId = input.roomId ?? s.roomId;
    if (!roomId) roomId = (await suggestRoom(tx, rid, s))?.id ?? null;
    if (!roomId) throw conflict("no_room_free");
    const room = await loadRoom(tx, rid, roomId);
    if (room.roomTypeId !== s.roomTypeId) throw conflict("room_type_mismatch");
    if (room.housekeeping === "out_of_order") throw conflict("room_out_of_order");
    if (!input.allowDirty && !["clean", "inspected"].includes(room.housekeeping))
      throw conflict("room_not_clean");
    await assertRoomFree(tx, rid, room.id, s.arrival, s.departure, s.id);
    const [inRoom] = await tx
      .select({ id: stays.id })
      .from(stays)
      .where(and(eq(stays.roomId, room.id), eq(stays.status, "in_house"), ne(stays.id, s.id)));
    if (inRoom) throw conflict("room_occupied");
    // A late arrival: nights before today were never slept, they are dropped.
    if (s.arrival < settings.businessDate) {
      await tx
        .delete(stayNights)
        .where(
          and(
            eq(stayNights.stayId, s.id),
            lt(stayNights.day, settings.businessDate),
            isNull(stayNights.postedAt),
          ),
        );
    }
    const [updated] = await tx
      .update(stays)
      .set({
        status: "in_house",
        roomId: room.id,
        checkedInAt: new Date(),
        arrival: s.arrival < settings.businessDate ? settings.businessDate : s.arrival,
      })
      .where(eq(stays.id, s.id))
      .returning();
    // A previous occupant's QR visit must not leak into this guest's bill or portal.
    await tx
      .update(tableSessions)
      .set({ status: "closed", closedAt: new Date(), closedReason: "system" })
      .where(and(eq(tableSessions.tableId, room.id), eq(tableSessions.status, "open")));
    await mainFolioOf(tx, rid, s.id);
    await recordAudit(tx, {
      action: "stay.checked_in",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: s.id,
      metadata: { number: s.number, room: room.label },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return updated!;
  });
  return result;
}

export const checkOutSchema = z.object({
  /** Send what is left to pay to the stay's company account (city ledger). */
  toAccount: z.coerce.boolean().default(false),
});

/**
 * The guest leaves: room service still unpaid goes on the bill, nights not yet charged up to today
 * are charged, nights after today are dropped (early departure), then every folio must be settled
 * (or sent to the company account) before the stay is closed and the room goes to housekeeping.
 */
export async function checkOut(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  raw: z.input<typeof checkOutSchema> = {},
) {
  assertCan(ctx, "frontdesk.manage");
  const input = checkOutSchema.parse(raw);
  const rid = ctx.restaurant.id;
  await chargeRoomOrders(db, ctx, stayId);
  return db.transaction(async (tx) => {
    const s = await lockStay(tx, rid, stayId);
    if (s.status !== "in_house") throw conflict("not_in_house");
    const settings = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
    const departure =
      settings.businessDate >= s.departure
        ? s.departure
        : settings.businessDate > s.arrival
          ? settings.businessDate
          : addDays(s.arrival, 1);
    await tx.delete(stayNights).where(and(eq(stayNights.stayId, s.id), gte(stayNights.day, departure)));
    await postNights(tx, ctx, s, settings, departure);
    const list = await tx
      .select({ id: folios.id, number: folios.number })
      .from(folios)
      .where(and(eq(folios.stayId, s.id), eq(folios.status, "open")));
    for (const f of list) {
      let balance = await folioBalance(tx, f.id);
      if (balance > 0 && input.toAccount) {
        if (!s.accountId) throw conflict("no_company_account");
        assertCan(ctx, "folio.adjust");
        await transferToAccount(tx, ctx, f.id, s.accountId, `Folio ${f.number}`);
        balance = await folioBalance(tx, f.id);
      }
      if (balance !== 0) throw conflict("folio_not_settled", { folio: f.number, balanceCents: balance });
    }
    await closeFolios(
      tx,
      rid,
      list.map((f) => f.id),
    );
    const [total] = await tx
      .select({ t: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint` })
      .from(stayNights)
      .where(eq(stayNights.stayId, s.id));
    const [updated] = await tx
      .update(stays)
      .set({ status: "checked_out", checkedOutAt: new Date(), departure, totalCents: Number(total?.t ?? 0) })
      .where(eq(stays.id, s.id))
      .returning();
    if (s.roomId) {
      await tx
        .update(diningTables)
        .set({ housekeeping: "dirty", housekeepingAt: new Date() })
        .where(eq(diningTables.id, s.roomId));
      await tx
        .update(tableSessions)
        .set({ status: "closed", closedAt: new Date(), closedByUserId: ctx.user.id, closedReason: "staff" })
        .where(and(eq(tableSessions.tableId, s.roomId), eq(tableSessions.status, "open")));
    }
    await recordAudit(tx, {
      action: "stay.checked_out",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: s.id,
      metadata: { number: s.number, departure, early: departure < s.departure },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "session.closed" });
    return updated!;
  });
}

/** Charges every night before `until` not charged yet (room + city tax), dated on its own day. */
export async function postNights(
  tx: Tx,
  ctx: RestaurantContext,
  s: typeof stays.$inferSelect,
  settings: Awaited<ReturnType<typeof getPmsSettings>>,
  until: string,
) {
  const rid = ctx.restaurant.id;
  const due = await tx
    .select()
    .from(stayNights)
    .where(and(eq(stayNights.stayId, s.id), lt(stayNights.day, until), isNull(stayNights.postedAt)))
    .orderBy(asc(stayNights.day))
    .for("update");
  if (!due.length) return 0;
  const folio = await mainFolioOf(tx, rid, s.id);
  const [room] = s.roomId
    ? await tx.select({ label: diningTables.label }).from(diningTables).where(eq(diningTables.id, s.roomId))
    : [];
  for (const n of due) {
    // Charges dated after the business day would be in the future: they wait for the night audit.
    const date = n.day <= settings.businessDate ? n.day : settings.businessDate;
    if (n.rateCents > 0)
      await postLine(tx, rid, ctx.restaurant.timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "room",
        description: `room:${room?.label ?? ""}:${n.day}`,
        unitCents: n.rateCents,
        amountCents: n.rateCents,
        taxRateBps: settings.roomTaxBps,
        sourceType: "night",
        sourceId: nightSourceId(s.id, n.day),
        businessDate: date,
      });
    if (settings.cityTaxCents > 0)
      await postLine(tx, rid, ctx.restaurant.timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "city_tax",
        description: `city_tax:${n.day}`,
        quantity: s.adults,
        unitCents: settings.cityTaxCents,
        amountCents: settings.cityTaxCents * s.adults,
        sourceType: "city_tax",
        sourceId: nightSourceId(s.id, n.day),
        businessDate: date,
      });
    await tx
      .update(stayNights)
      .set({ postedAt: new Date() })
      .where(and(eq(stayNights.stayId, s.id), eq(stayNights.day, n.day)));
  }
  return due.length;
}

/** Deterministic id of a night (stay + day), so a night can never be charged twice. */
export function nightSourceId(stayId: string, dayStr: string) {
  const h = createHash("sha1").update(`${stayId}|${dayStr}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const cancelSchema = z.object({
  reason: z.string().trim().min(2).max(200),
  /** Cancellation fee charged to the guest (late cancellation, non-refundable rate). */
  feeCents: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
});

export async function cancelStay(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  raw: z.input<typeof cancelSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const input = cancelSchema.parse(raw);
  const rid = ctx.restaurant.id;
  return db.transaction(async (tx) => {
    const s = await lockStay(tx, rid, stayId);
    if (s.status !== "confirmed" && s.status !== "tentative") throw conflict("not_cancellable");
    await tx.delete(stayNights).where(eq(stayNights.stayId, s.id));
    if (input.feeCents > 0) {
      const folio = await mainFolioOf(tx, rid, s.id);
      await postLine(tx, rid, ctx.restaurant.timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "room",
        description: "cancellation_fee",
        unitCents: input.feeCents,
        amountCents: input.feeCents,
        sourceType: "cancellation",
        sourceId: s.id,
        userId: ctx.user.id,
      });
    }
    await tx
      .update(stays)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: input.reason })
      .where(eq(stays.id, s.id));
    await recordAudit(tx, {
      action: "stay.cancelled",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "stay",
      entityId: s.id,
      metadata: { number: s.number, reason: input.reason, feeCents: input.feeCents },
    });
  });
}

/** Turns a tentative (option) booking into a confirmed one. */
export async function confirmStay(db: Database, ctx: RestaurantContext, stayId: string) {
  assertCan(ctx, "frontdesk.manage");
  const [row] = await db
    .update(stays)
    .set({ status: "confirmed" })
    .where(
      and(eq(stays.id, stayId), eq(stays.restaurantId, ctx.restaurant.id), eq(stays.status, "tentative")),
    )
    .returning({ id: stays.id });
  if (!row) throw conflict("not_tentative");
}

// ─── Reading ─────────────────────────────────────────────────────────────────

const stayColumns = {
  id: stays.id,
  number: stays.number,
  status: stays.status,
  arrival: stays.arrival,
  departure: stays.departure,
  adults: stays.adults,
  children: stays.children,
  roomTypeId: stays.roomTypeId,
  roomId: stays.roomId,
  roomLabel: diningTables.label,
  typeCode: roomTypes.code,
  guestId: stays.guestId,
  firstName: hotelGuests.firstName,
  lastName: hotelGuests.lastName,
  vip: hotelGuests.vip,
  source: stays.source,
  eta: stays.eta,
  totalCents: stays.totalCents,
  accountName: hotelAccounts.name,
  notes: stays.notes,
  precheckinAt: stays.precheckinAt,
  blockId: stays.blockId,
};

function staysQuery(db: DbOrTx) {
  return db
    .select({
      ...stayColumns,
      balanceCents:
        sql<number>`(select coalesce(sum(l.amount_cents),0)::bigint from folio_lines l join folios f on f.id = l.folio_id where f.stay_id = ${stays.id} and l.voided_at is null)`.mapWith(
          Number,
        ),
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .leftJoin(hotelAccounts, eq(hotelAccounts.id, stays.accountId));
}
export type StayRow = Awaited<ReturnType<ReturnType<typeof staysQuery>["where"]>>[number];

/** The front desk's day: arrivals, departures, guests in house, and the day's figures. */
export async function frontDesk(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const settings = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  const today = settings.businessDate;
  const [arrivals, departures, inHouse, counts] = await Promise.all([
    staysQuery(db)
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, ["tentative", "confirmed"]),
          lte(stays.arrival, today),
          gt(stays.departure, today),
        ),
      )
      .orderBy(asc(stays.eta), asc(hotelGuests.lastName)),
    staysQuery(db)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"), lte(stays.departure, today)))
      .orderBy(asc(diningTables.label)),
    staysQuery(db)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house")))
      .orderBy(asc(diningTables.label)),
    roomCounts(db, rid),
  ]);
  const rooms = [...counts.entries()].filter(([k]) => k).reduce((s, [, n]) => s + n.rooms, 0);
  const [tonight] = await db
    .select({
      sold: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${stayNights.rateCents}),0)::bigint`.mapWith(Number),
    })
    .from(stayNights)
    .innerJoin(stays, eq(stays.id, stayNights.stayId))
    .where(
      and(eq(stays.restaurantId, rid), inArray(stays.status, [...ACTIVE_STAY]), eq(stayNights.day, today)),
    );
  const sold = tonight?.sold ?? 0;
  const roomRevenue = tonight?.revenue ?? 0;
  return {
    businessDate: today,
    arrivals,
    departures,
    inHouse,
    figures: {
      rooms,
      sold,
      guests: inHouse.reduce((s, x) => s + x.adults + x.children, 0),
      ...keyFigures(rooms, sold, roomRevenue),
    },
  };
}

/** Bookings list with filters (reservations screen). */
export async function listStays(
  db: DbOrTx,
  ctx: RestaurantContext,
  f: { q?: string; status?: string; from?: string; to?: string; limit?: number },
) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const term = f.q?.trim().slice(0, 60);
  const like = term ? `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const num = term && /^\d+$/.test(term) ? Number(term) : null;
  return staysQuery(db)
    .where(
      and(
        eq(stays.restaurantId, rid),
        f.status && (STAY_STATUSES as readonly string[]).includes(f.status)
          ? eq(stays.status, f.status)
          : undefined,
        f.from && isDay(f.from) ? gte(stays.departure, f.from) : undefined,
        f.to && isDay(f.to) ? lte(stays.arrival, f.to) : undefined,
        like
          ? or(
              sql`${hotelGuests.lastName} ilike ${like}`,
              sql`${hotelGuests.firstName} ilike ${like}`,
              sql`${stays.channelRef} ilike ${like}`,
              num != null ? eq(stays.number, num) : undefined,
            )
          : undefined,
      ),
    )
    .orderBy(asc(stays.arrival), asc(stays.number))
    .limit(Math.min(f.limit ?? 200, 500));
}

/** Room planning (tape chart): every room and the stays crossing [from, from + days). */
export async function planning(db: DbOrTx, ctx: RestaurantContext, from: string, days: number) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const to = addDays(from, Math.max(1, Math.min(days, 62)));
  const [rooms, list] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        number: diningTables.number,
        zone: diningTables.zone,
        housekeeping: diningTables.housekeeping,
        roomTypeId: diningTables.roomTypeId,
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
      .orderBy(asc(roomTypes.sortOrder), asc(diningTables.number), asc(diningTables.label)),
    staysQuery(db).where(
      and(
        eq(stays.restaurantId, rid),
        inArray(stays.status, ["tentative", "confirmed", "in_house", "checked_out"]),
        lt(stays.arrival, to),
        gt(stays.departure, from),
      ),
    ),
  ]);
  return { from, to, nights: eachNight(from, to), rooms, stays: list };
}

/** One stay with its guest, room, nights and folios (the reservation card). */
export async function getStay(db: DbOrTx, ctx: RestaurantContext, stayId: string) {
  assertCan(ctx, "frontdesk.view");
  if (!isUuid(stayId)) throw notFound();
  const rid = ctx.restaurant.id;
  const [s] = await staysQuery(db).where(and(eq(stays.id, stayId), eq(stays.restaurantId, rid)));
  if (!s) throw notFound();
  const [full] = await db.select().from(stays).where(eq(stays.id, stayId));
  const [guest] = await db.select().from(hotelGuests).where(eq(hotelGuests.id, s.guestId));
  const nights = await db
    .select()
    .from(stayNights)
    .where(eq(stayNights.stayId, stayId))
    .orderBy(asc(stayNights.day));
  const folioList = await stayFolios(db, rid, stayId);
  return { ...s, stay: full!, guest: guest!, nights, folios: folioList };
}

/** The guest in a room right now (guest portal, room service charged to the room). */
export async function inHouseStayOfRoom(db: DbOrTx, restaurantId: string, roomId: string) {
  const [s] = await db
    .select()
    .from(stays)
    .where(and(eq(stays.restaurantId, restaurantId), eq(stays.roomId, roomId), eq(stays.status, "in_house")))
    .limit(1);
  return s ?? null;
}

/** A company's folio, ready to receive postings (city ledger screen). */
export { accountFolioOf };
