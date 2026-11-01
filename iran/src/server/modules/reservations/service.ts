import { and, asc, eq, gte, inArray, isNull, lt, ne, notInArray, sql, type SQL } from "drizzle-orm";
import { notifyTeam } from "@/server/modules/team/sections";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { customers, diningTables, reservations, restaurantSettings, restaurants } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { sms } from "@/server/infra/sms";
import { env } from "@/server/env";
import { AppError, conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { isUuid, randomToken } from "@/lib/ids";
import { dayStart, localDay } from "@/lib/period";
import { normalizeIranMobile } from "@/lib/phone";
import { nextCounterValue } from "@/server/modules/restaurants/service";

const SLOT_MIN = 30;
/** What a guest may say the evening is for (the host sees it on the booking). */
export const OCCASIONS = ["birthday", "anniversary", "date", "business", "family"] as const;
const ACTIVE = ["pending", "confirmed", "notified", "seated"] as const;
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Place = {
  id: string;
  name: string;
  slug: string;
  logoKey: string | null;
  brandColor: string;
  timezone: string;
  defaultLocale: string;
  enabled: boolean;
  autoConfirm: boolean;
  slotCapacity: number;
  maxParty: number;
  durationMin: number;
  openingHours: Record<string, { open: string; close: string }[]> | null;
};

async function loadPlaces(db: DbOrTx, where: SQL | undefined): Promise<Place[]> {
  const rows = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      timezone: restaurants.timezone,
      defaultLocale: restaurants.defaultLocale,
      status: restaurants.status,
      enabled: restaurantSettings.reservationsEnabled,
      autoConfirm: restaurantSettings.reservationAutoConfirm,
      slotCapacity: restaurantSettings.reservationSlotCapacity,
      maxParty: restaurantSettings.reservationMaxParty,
      durationMin: restaurantSettings.reservationDurationMin,
      openingHours: restaurantSettings.openingHours,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(and(where, isNull(restaurants.deletedAt)));
  return rows.filter((r) => r.status === "active") as Place[];
}
async function loadPlace(db: DbOrTx, where: SQL): Promise<Place | null> {
  return (await loadPlaces(db, where))[0] ?? null;
}
export const placeBySlug = (db: DbOrTx, slug: string) => loadPlace(db, eq(restaurants.slug, slug));
const placeById = (db: DbOrTx, id: string) => loadPlace(db, eq(restaurants.id, id));

// ─── Slots ───────────────────────────────────────────────────────────────────

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Active bookings that may overlap a day (from 6 h before it to 6 h after it). */
function bookedAround(db: DbOrTx, ids: string[], from: Date, to: Date) {
  return db
    .select({
      restaurantId: reservations.restaurantId,
      startsAt: reservations.startsAt,
      durationMin: reservations.durationMin,
      partySize: reservations.partySize,
    })
    .from(reservations)
    .where(
      and(
        inArray(reservations.restaurantId, ids),
        eq(reservations.kind, "booking"),
        inArray(reservations.status, [...ACTIVE]),
        gte(reservations.startsAt, new Date(from.getTime() - 6 * 3600_000)),
        lt(reservations.startsAt, new Date(to.getTime() + 30 * 3600_000)),
      ),
    );
}

function slotsFrom(
  place: Place,
  day: string,
  booked: { startsAt: Date; durationMin: number; partySize: number }[],
  partySize: number,
  now: Date,
) {
  const start = dayStart(day, place.timezone);
  const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
  const ranges = place.openingHours
    ? (place.openingHours[weekday] ?? [])
    : [{ open: "12:00", close: "23:00" }];
  const out: { time: string; at: Date; left: number }[] = [];
  for (const r of ranges) {
    // Last booking starts one duration before closing (closing after midnight wraps).
    let close = toMin(r.close);
    const open = toMin(r.open);
    if (close <= open) close += 24 * 60;
    for (let m = open; m + Math.min(place.durationMin, 60) <= close; m += SLOT_MIN) {
      const at = new Date(start.getTime() + m * 60_000);
      if (at.getTime() < now.getTime() + 30 * 60_000) continue;
      const used = booked
        .filter((b) => b.startsAt <= at && b.startsAt.getTime() + b.durationMin * 60_000 > at.getTime())
        .reduce((s, b) => s + b.partySize, 0);
      const left = place.slotCapacity - used;
      if (left >= partySize)
        out.push({
          time: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
          at,
          left,
        });
    }
  }
  return out;
}

/** Bookable start times of a day, with what is left of each slot's capacity. */
export async function slotsForDay(
  db: DbOrTx,
  place: Place,
  day: string,
  partySize: number,
  now = new Date(),
) {
  const start = dayStart(day, place.timezone);
  const booked = await bookedAround(db, [place.id], start, start);
  return slotsFrom(place, day, booked, partySize, now);
}

/**
 * The time a guest most likely wants when they have not said: 20:00, or later in the evening the
 * next half hour that can still be booked (never past 23:30).
 */
export function defaultWishTime(timezone: string, now = new Date()) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":")
    .map(Number);
  const soonest = Math.ceil(((h ?? 0) * 60 + (m ?? 0) + 30) / 30) * 30;
  const at = Math.min(Math.max(20 * 60, soonest), 23 * 60 + 30);
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:${at % 60 ? "30" : "00"}`;
}

/**
 * The directory's time chips: for each restaurant taking bookings, up to `n` free start times
 * closest to the one the guest asked for (two queries whatever the number of restaurants).
 */
export async function slotsNear(
  db: DbOrTx,
  ids: string[],
  q: { day: string; partySize: number; time: string },
  n = 5,
  now = new Date(),
) {
  const out = new Map<string, { time: string; at: string }[]>();
  if (!ids.length) return out;
  const places = (await loadPlaces(db, inArray(restaurants.id, ids))).filter((p) => p.enabled);
  if (!places.length) return out;
  const starts = places.map((p) => dayStart(q.day, p.timezone).getTime());
  const booked = await bookedAround(
    db,
    places.map((p) => p.id),
    new Date(Math.min(...starts)),
    new Date(Math.max(...starts)),
  );
  const wished = toMin(q.time);
  for (const p of places) {
    if (q.partySize > p.maxParty) {
      out.set(p.id, []);
      continue;
    }
    const start = dayStart(q.day, p.timezone).getTime();
    const slots = slotsFrom(
      p,
      q.day,
      booked.filter((b) => b.restaurantId === p.id),
      q.partySize,
      now,
    );
    const gap = (at: Date) => Math.abs((at.getTime() - start) / 60_000 - wished);
    out.set(
      p.id,
      slots
        .sort((a, b) => gap(a.at) - gap(b.at))
        .slice(0, n)
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((s) => ({ time: s.time, at: s.at.toISOString() })),
    );
  }
  return out;
}

const OUTDOOR = /out|terrace|garden|بیرون|تراس|حیاط|باغ|فضای باز/i;
/** Tables in the wished area first (outdoor = zone name like "terrace"/"حیاط"). */
const zoneRank = (zone: string | null, area: string) =>
  area === "any" ? 0 : (area === "outdoor") === OUTDOOR.test(zone ?? "") ? 0 : 1;

/** Which areas a guest can wish for: the choice only shows when the place has both. */
export async function bookingAreas(db: DbOrTx, restaurantId: string) {
  const zones = await db
    .selectDistinct({ zone: diningTables.zone })
    .from(diningTables)
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        isNull(diningTables.deletedAt),
        eq(diningTables.kind, "table"),
      ),
    );
  const outdoor = zones.some((z) => OUTDOOR.test(z.zone ?? ""));
  const indoor = zones.some((z) => !OUTDOOR.test(z.zone ?? ""));
  return { indoor, outdoor };
}

/** Smallest free table that seats the party for the whole booking, in the wished area if possible. */
async function pickTable(
  tx: DbOrTx,
  rid: string,
  at: Date,
  durationMin: number,
  partySize: number,
  area: string,
  excludeId?: string,
) {
  const tables = await tx
    .select({ id: diningTables.id, capacity: diningTables.capacity, zone: diningTables.zone })
    .from(diningTables)
    .where(
      and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt), eq(diningTables.kind, "table")),
    );
  const end = new Date(at.getTime() + durationMin * 60_000);
  const busy = await tx
    .select({ tableId: reservations.tableId })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, rid),
        inArray(reservations.status, [...ACTIVE]),
        sql`${reservations.tableId} is not null`,
        lt(reservations.startsAt, end),
        sql`${reservations.startsAt} + make_interval(mins => ${reservations.durationMin}) > ${at}`,
        ...(excludeId ? [ne(reservations.id, excludeId)] : []),
      ),
    );
  const taken = new Set(busy.map((b) => b.tableId));
  const fits = tables
    .filter((t) => !taken.has(t.id) && (t.capacity == null || t.capacity >= partySize))
    .sort(
      (a, b) => zoneRank(a.zone, area) - zoneRank(b.zone, area) || (a.capacity ?? 99) - (b.capacity ?? 99),
    );
  return fits[0]?.id ?? null;
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

async function text(place: Place, key: string, values: Record<string, string | number>) {
  const locale = isLocale(place.defaultLocale) ? place.defaultLocale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${locale}.json`)).default;
  const t = createTranslator({ locale, messages, namespace: "sms.reservation" });
  return t(key, values);
}
const statusLink = (place: Place, code: string) => `${env().APP_URL}/r/${place.slug}/b/${code}`;
async function sendSms(phone: string, body: string) {
  try {
    await sms().send(phone, body);
  } catch (e) {
    console.error("[reservations] sms failed", e instanceof Error ? e.message : e);
  }
}

// ─── Create ──────────────────────────────────────────────────────────────────

export const bookingSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .transform((v, c) => {
      const n = normalizeIranMobile(v);
      if (!n) c.addIssue({ code: "custom", message: "invalid_phone" });
      return n ?? "";
    }),
  partySize: z.coerce.number().int().min(1).max(200),
  /** ISO instant of the chosen slot. */
  startsAt: z.coerce.date(),
  area: z.enum(["any", "indoor", "outdoor"]).default("any"),
  note: z.string().trim().max(500).default(""),
  occasion: z.enum(OCCASIONS).nullable().optional(),
  /** undefined = pick a free table, null = no table (staff only), uuid = this table. */
  tableId: z.uuid().nullable().optional(),
  /** Staff may book a longer or shorter sitting than the default. */
  durationMin: z.coerce.number().int().min(15).max(480).optional(),
});

type Slot = {
  startsAt: Date;
  durationMin: number;
  partySize: number;
  phone: string;
  tableId: string | null | undefined;
  area: string;
};

/**
 * One booking at a time per restaurant: the checks below and the insert run under this lock, so
 * two people taking the last table at the same second cannot both get it.
 */
const lockBookings = (tx: DbOrTx, rid: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"reservations:" + rid}, 0))`);

/** Active bookings overlapping [at, at + duration), other than `excludeId`. */
async function overlapping(tx: DbOrTx, rid: string, at: Date, durationMin: number, excludeId?: string) {
  const end = new Date(at.getTime() + durationMin * 60_000);
  return tx
    .select({
      id: reservations.id,
      name: reservations.name,
      phone: reservations.phone,
      partySize: reservations.partySize,
      tableId: reservations.tableId,
      startsAt: reservations.startsAt,
      durationMin: reservations.durationMin,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, rid),
        eq(reservations.kind, "booking"),
        inArray(reservations.status, [...ACTIVE]),
        lt(reservations.startsAt, end),
        sql`${reservations.startsAt} + make_interval(mins => ${reservations.durationMin}) > ${at}`,
        ...(excludeId ? [ne(reservations.id, excludeId)] : []),
      ),
    );
}

/**
 * The double-booking rules, shared by online, phone and edits:
 * - the same mobile cannot hold two bookings at overlapping times;
 * - a table holds one booking at a time and must seat the party;
 * - with no table given, a free one is picked; when none fits (or there are no tables) the slot
 *   capacity decides, and a staff "no table" booking also counts against it.
 * Returns the table to store.
 */
async function resolveSlot(tx: DbOrTx, place: Place, slot: Slot, excludeId?: string) {
  const others = await overlapping(tx, place.id, slot.startsAt, slot.durationMin, excludeId);
  if (slot.phone && others.some((o) => o.phone === slot.phone)) throw conflict("duplicate_booking");
  if (slot.tableId) {
    const [table] = await tx
      .select({ id: diningTables.id, capacity: diningTables.capacity })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.id, slot.tableId),
          eq(diningTables.restaurantId, place.id),
          isNull(diningTables.deletedAt),
        ),
      );
    if (!table) throw notFound();
    if (table.capacity != null && table.capacity < slot.partySize) throw conflict("table_too_small");
    if (others.some((o) => o.tableId === table.id)) throw conflict("table_taken");
    return table.id;
  }
  if (slot.tableId === undefined) {
    const picked = await pickTable(
      tx,
      place.id,
      slot.startsAt,
      slot.durationMin,
      slot.partySize,
      slot.area,
      excludeId,
    );
    if (picked) return picked;
  }
  // No table: the slot capacity is the only guard left.
  const used = others.reduce((sum, o) => sum + o.partySize, 0);
  if (used + slot.partySize > place.slotCapacity) throw conflict("slot_full");
  return null;
}

async function upsertCustomer(tx: DbOrTx, rid: string, phone: string, name: string) {
  const [c] = await tx
    .insert(customers)
    .values({ restaurantId: rid, phone, name })
    .onConflictDoUpdate({ target: [customers.restaurantId, customers.phone], set: { updatedAt: new Date() } })
    .returning({ id: customers.id });
  return c!.id;
}

async function create(
  db: Database,
  place: Place,
  raw: z.input<typeof bookingSchema>,
  opts: { source: "online" | "phone"; actorUserId: string | null },
) {
  const input = bookingSchema.parse(raw);
  if (input.partySize > place.maxParty && opts.source === "online")
    throw new AppError("VALIDATION", "party_too_large", { max: place.maxParty });
  const day = localDay(input.startsAt, place.timezone);
  if (opts.source === "online") {
    const ok = (await slotsForDay(db, place, day, input.partySize)).some(
      (s) => s.at.getTime() === input.startsAt.getTime(),
    );
    if (!ok) throw conflict("slot_unavailable");
  }
  const durationMin = opts.source === "phone" ? (input.durationMin ?? place.durationMin) : place.durationMin;
  const res = await db.transaction(async (tx) => {
    await lockBookings(tx, place.id);
    let tableId: string | null;
    try {
      tableId = await resolveSlot(tx, place, {
        ...input,
        durationMin,
        // Guests never choose "no table": that is the team's call.
        tableId: opts.source === "online" ? (input.tableId ?? undefined) : input.tableId,
      });
    } catch (e) {
      // A guest only needs to know the time is gone.
      if (opts.source === "online" && e instanceof AppError && e.message !== "duplicate_booking")
        throw conflict("slot_unavailable");
      throw e;
    }
    const [r] = await tx
      .insert(reservations)
      .values({
        restaurantId: place.id,
        kind: "booking",
        code: randomToken(12),
        name: input.name,
        phone: input.phone,
        partySize: input.partySize,
        startsAt: input.startsAt,
        durationMin,
        area: input.area,
        tableId,
        status: opts.source === "online" && !place.autoConfirm ? "pending" : "confirmed",
        source: opts.source,
        note: input.note || null,
        occasion: input.occasion ?? null,
        customerId: await upsertCustomer(tx, place.id, input.phone, input.name),
        createdByUserId: opts.actorUserId,
      })
      .returning();
    await notifyTeam(tx, {
      restaurantId: place.id,
      type: "reservation.created",
      payload: {
        reservationId: r!.id,
        name: r!.name,
        partySize: r!.partySize,
        startsAt: r!.startsAt.toISOString(),
      },
    });
    return r!;
  });
  const when = new Intl.DateTimeFormat(
    place.defaultLocale === "fa" ? "fa-u-ca-persian" : place.defaultLocale,
    {
      timeZone: place.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(res.startsAt);
  await sendSms(
    res.phone,
    await text(place, res.status === "pending" ? "requested" : "confirmed", {
      restaurant: place.name,
      when,
      people: res.partySize,
      link: statusLink(place, res.code),
    }),
  );
  return res;
}

export async function createBooking(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof bookingSchema>,
) {
  assertCan(ctx, "orders.create");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  return create(db, place, raw, { source: "phone", actorUserId: ctx.user.id });
}

export const bookingEditSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: bookingSchema.shape.phone.optional(),
  partySize: z.coerce.number().int().min(1).max(200).optional(),
  startsAt: z.coerce.date().optional(),
  durationMin: z.coerce.number().int().min(15).max(480).optional(),
  tableId: z.uuid().nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

/** Moves or edits a booking (time, length, party, table…) under the same double-booking rules. */
export async function updateBooking(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof bookingEditSchema>,
) {
  assertCan(ctx, "orders.create");
  if (!isUuid(id)) throw notFound();
  const input = bookingEditSchema.parse(raw);
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  return db.transaction(async (tx) => {
    await lockBookings(tx, place.id);
    const [r] = await tx
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, id),
          eq(reservations.restaurantId, place.id),
          eq(reservations.kind, "booking"),
        ),
      );
    if (!r) throw notFound();
    if (!(ACTIVE as readonly string[]).includes(r.status)) throw conflict("invalid_transition");
    const next = {
      startsAt: input.startsAt ?? r.startsAt,
      durationMin: input.durationMin ?? r.durationMin,
      partySize: input.partySize ?? r.partySize,
      phone: input.phone ?? r.phone,
      area: r.area,
      // Keep the table unless asked; re-check it like a new booking would.
      tableId: input.tableId !== undefined ? input.tableId : r.tableId,
    };
    const tableId = await resolveSlot(tx, place, next, r.id);
    const [updated] = await tx
      .update(reservations)
      .set({
        startsAt: next.startsAt,
        durationMin: next.durationMin,
        partySize: next.partySize,
        phone: next.phone,
        tableId,
        ...(input.name ? { name: input.name } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
        // Moved to a new time: the reminder goes out again.
        ...(next.startsAt.getTime() !== r.startsAt.getTime() ? { reminderSentAt: null } : {}),
      })
      .where(eq(reservations.id, r.id))
      .returning();
    await recordAudit(tx, {
      action: "reservation.updated",
      actorUserId: ctx.user.id,
      restaurantId: place.id,
      entityType: "reservation",
      entityId: r.id,
      metadata: {
        from: { startsAt: r.startsAt.toISOString(), tableId: r.tableId, partySize: r.partySize },
        to: { startsAt: next.startsAt.toISOString(), tableId, partySize: next.partySize },
      },
    });
    await emit(tx, { topic: topics.restaurant(place.id), type: "notification.created" });
    return updated!;
  });
}

/**
 * What the booking form shows while the team is on the phone: each table free, taken (by whom)
 * or too small for the party, the seats left in the slot, and whether this mobile already has a
 * booking at that time.
 */
export async function availability(
  db: Database,
  ctx: RestaurantContext,
  q: { startsAt: Date; durationMin?: number; partySize: number; phone?: string; excludeId?: string },
) {
  assertCan(ctx, "orders.view");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  const durationMin = q.durationMin ?? place.durationMin;
  const excludeId = q.excludeId && isUuid(q.excludeId) ? q.excludeId : undefined;
  const [tables, others] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        capacity: diningTables.capacity,
        zone: diningTables.zone,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, place.id),
          isNull(diningTables.deletedAt),
          eq(diningTables.kind, "table"),
        ),
      )
      .orderBy(asc(diningTables.sortOrder), asc(diningTables.label)),
    overlapping(db, place.id, q.startsAt, durationMin, excludeId),
  ]);
  const phone = q.phone ? normalizeIranMobile(q.phone) : null;
  const holder = new Map(others.filter((o) => o.tableId).map((o) => [o.tableId!, o]));
  return {
    durationMin,
    seatsLeft: Math.max(0, place.slotCapacity - others.reduce((s, o) => s + o.partySize, 0)),
    duplicate: phone ? (others.find((o) => o.phone === phone) ?? null) : null,
    tables: tables.map((t) => {
      const by = holder.get(t.id);
      return {
        ...t,
        state: by
          ? ("taken" as const)
          : t.capacity != null && t.capacity < q.partySize
            ? ("small" as const)
            : ("free" as const),
        takenBy: by ? { name: by.name, startsAt: by.startsAt, durationMin: by.durationMin } : null,
      };
    }),
  };
}

/** A known guest's name and history, to fill the form from the mobile number. */
export async function customerByPhone(db: DbOrTx, ctx: RestaurantContext, raw: string) {
  assertCan(ctx, "orders.view");
  const phone = normalizeIranMobile(raw);
  if (!phone) return null;
  const [c] = await db
    .select({ name: customers.name, ordersCount: customers.ordersCount })
    .from(customers)
    .where(and(eq(customers.restaurantId, ctx.restaurant.id), eq(customers.phone, phone)));
  if (!c) return null;
  const [b] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurant.id),
        eq(reservations.phone, phone),
        eq(reservations.kind, "booking"),
      ),
    );
  const [noShows] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurant.id),
        eq(reservations.phone, phone),
        eq(reservations.status, "no_show"),
      ),
    );
  return { name: c.name, orders: c.ordersCount, bookings: b?.n ?? 0, noShows: noShows?.n ?? 0 };
}

/**
 * The agenda of a day: tables as rows, bookings as blocks, and the opening hours that frame the
 * timeline (minutes after local midnight; a service past midnight goes beyond 1440).
 */
export async function agendaDay(db: Database, ctx: RestaurantContext, day: string) {
  assertCan(ctx, "orders.view");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  const from = dayStart(day, place.timezone);
  const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]!;
  const ranges = (
    place.openingHours ? (place.openingHours[weekday] ?? []) : [{ open: "12:00", close: "23:00" }]
  ).map((r) => {
    const open = toMin(r.open);
    let close = toMin(r.close);
    if (close <= open) close += 24 * 60;
    return { open, close };
  });
  const end = Math.max(0, ...ranges.map((r) => r.close));
  const [tables, rows] = await Promise.all([
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        capacity: diningTables.capacity,
        zone: diningTables.zone,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, place.id),
          isNull(diningTables.deletedAt),
          eq(diningTables.kind, "table"),
        ),
      )
      .orderBy(asc(diningTables.sortOrder), asc(diningTables.label)),
    db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, place.id),
          eq(reservations.kind, "booking"),
          notInArray(reservations.status, ["cancelled"]),
          gte(reservations.startsAt, from),
          lt(reservations.startsAt, new Date(from.getTime() + 30 * 3600_000)),
        ),
      )
      .orderBy(asc(reservations.startsAt)),
  ]);
  return {
    tables,
    // The day, plus the late part of a service that runs past midnight.
    bookings: rows.filter((r) => r.startsAt.getTime() < from.getTime() + Math.max(1440, end) * 60_000),
    ranges,
    durationMin: place.durationMin,
    slotCapacity: place.slotCapacity,
    dayStartsAt: from,
  };
}

export async function bookOnline(db: Database, slug: string, raw: z.input<typeof bookingSchema>) {
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) throw notFound();
  return create(db, place, { ...raw, tableId: null }, { source: "online", actorUserId: null });
}

// ─── Queue (نوبت‌دهی) ────────────────────────────────────────────────────────

export const queueSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: bookingSchema.shape.phone,
  partySize: z.coerce.number().int().min(1).max(50),
});

async function enqueue(
  db: Database,
  place: Place,
  raw: z.input<typeof queueSchema>,
  actorUserId: string | null,
) {
  const input = queueSchema.parse(raw);
  const now = new Date();
  const r = await db.transaction(async (tx) => {
    const number = await nextCounterValue(tx, place.id, `queue:${localDay(now, place.timezone)}`, 1);
    const [row] = await tx
      .insert(reservations)
      .values({
        restaurantId: place.id,
        kind: "queue",
        code: randomToken(12),
        queueNumber: number,
        name: input.name,
        phone: input.phone,
        partySize: input.partySize,
        startsAt: now,
        status: "confirmed",
        source: "walk_in",
        customerId: await upsertCustomer(tx, place.id, input.phone, input.name),
        createdByUserId: actorUserId,
      })
      .returning();
    await emit(tx, { topic: topics.restaurant(place.id), type: "notification.created" });
    return row!;
  });
  await sendSms(
    r.phone,
    await text(place, "queued", {
      restaurant: place.name,
      number: r.queueNumber!,
      link: statusLink(place, r.code),
    }),
  );
  return r;
}

export async function addToQueue(db: Database, ctx: RestaurantContext, raw: z.input<typeof queueSchema>) {
  assertCan(ctx, "orders.create");
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  return enqueue(db, place, raw, ctx.user.id);
}

export async function joinQueueOnline(db: Database, slug: string, raw: z.input<typeof queueSchema>) {
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) throw notFound();
  return enqueue(db, place, raw, null);
}

// ─── Staff board ─────────────────────────────────────────────────────────────

/** A day's bookings and today's queue. Also sends due reminders (lazy sweep). */
export async function listDay(db: Database, ctx: RestaurantContext, day: string) {
  assertCan(ctx, "orders.view");
  const tz = ctx.restaurant.timezone;
  const from = dayStart(day, tz);
  const to = new Date(from.getTime() + 24 * 3600_000);
  await sendDueReminders(db, ctx.restaurant.id);
  const rows = await db
    .select({ r: reservations, tableLabel: diningTables.label })
    .from(reservations)
    .leftJoin(diningTables, eq(diningTables.id, reservations.tableId))
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurant.id),
        gte(reservations.startsAt, from),
        lt(reservations.startsAt, to),
      ),
    )
    .orderBy(asc(reservations.startsAt));
  const list = rows.map(({ r, tableLabel }) => ({ ...r, tableLabel }));
  return {
    bookings: list.filter((r) => r.kind === "booking"),
    queue: list.filter((r) => r.kind === "queue"),
  };
}

/** Bookings and covers per day over a week, for the date strip (cancelled and no-shows left out). */
export async function weekCounts(db: Database, ctx: RestaurantContext, firstDay: string, days = 7) {
  assertCan(ctx, "orders.view");
  const tz = ctx.restaurant.timezone;
  const from = dayStart(firstDay, tz);
  const to = new Date(from.getTime() + days * 24 * 3600_000 + 3 * 3600_000);
  const local = sql<string>`to_char(${reservations.startsAt} at time zone ${tz}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day: local,
      bookings: sql<number>`count(*)::int`,
      covers: sql<number>`coalesce(sum(${reservations.partySize}), 0)::int`,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, ctx.restaurant.id),
        eq(reservations.kind, "booking"),
        gte(reservations.startsAt, from),
        lt(reservations.startsAt, to),
        notInArray(reservations.status, ["cancelled", "no_show"]),
      ),
    )
    // By position: the time zone is a bound parameter, so the select and group expressions differ in text.
    .groupBy(sql`1`);
  return new Map(rows.map((r) => [r.day, { bookings: r.bookings, covers: r.covers }]));
}

const TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["notified", "seated", "cancelled", "no_show"],
  notified: ["seated", "cancelled", "no_show"],
  seated: ["completed"],
};

/** Moves a booking / queue ticket along; "notified" texts the guest that the table is ready. */
export async function setReservationStatus(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  to: string,
  tableId?: string | null,
) {
  assertCan(ctx, "orders.update_status");
  if (!isUuid(id)) throw notFound();
  const place = await placeById(db, ctx.restaurant.id);
  if (!place) throw notFound();
  const [r] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurant.id)));
  if (!r) throw notFound();
  if (!TRANSITIONS[r.status]?.includes(to)) throw conflict("invalid_transition");
  const now = new Date();
  if (tableId && to === "seated") await assertTableFree(db, ctx.restaurant.id, tableId, r.partySize, r.id);
  await db
    .update(reservations)
    .set({
      status: to,
      ...(to === "notified" ? { notifiedAt: now } : {}),
      ...(to === "seated" ? { seatedAt: now } : {}),
      ...(tableId !== undefined && tableId !== null && isUuid(tableId) ? { tableId } : {}),
    })
    .where(eq(reservations.id, id));
  if (to === "notified")
    await sendSms(r.phone, await text(place, "tableReady", { restaurant: place.name, name: r.name }));
  if (to === "confirmed" && r.status === "pending")
    await sendSms(
      r.phone,
      await text(place, "confirmed", {
        restaurant: place.name,
        when: new Intl.DateTimeFormat(
          place.defaultLocale === "fa" ? "fa-u-ca-persian" : place.defaultLocale,
          {
            timeZone: place.timezone,
            dateStyle: "medium",
            timeStyle: "short",
          },
        ).format(r.startsAt),
        people: r.partySize,
        link: statusLink(place, r.code),
      }),
    );
  await recordAudit(db, {
    action: "reservation.status",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "reservation",
    entityId: id,
    metadata: { from: r.status, to },
  });
}

/** A table the host seats someone at: theirs, big enough, and nobody else seated there now. */
export async function assertTableFree(
  db: DbOrTx,
  rid: string,
  tableId: string,
  partySize: number,
  excludeId?: string,
) {
  if (!isUuid(tableId)) throw notFound();
  const [table] = await db
    .select({ id: diningTables.id, capacity: diningTables.capacity })
    .from(diningTables)
    .where(
      and(eq(diningTables.id, tableId), eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt)),
    );
  if (!table) throw notFound();
  if (table.capacity != null && table.capacity < partySize) throw conflict("table_too_small");
  const [seated] = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, rid),
        eq(reservations.tableId, tableId),
        eq(reservations.status, "seated"),
        ...(excludeId ? [ne(reservations.id, excludeId)] : []),
      ),
    )
    .limit(1);
  if (seated) throw conflict("table_taken");
}

/** Confirmed bookings starting within 2 hours get one reminder text. */
export async function sendDueReminders(db: Database, restaurantId: string, now = new Date()) {
  const place = await placeById(db, restaurantId);
  if (!place) return 0;
  const due = await db
    .update(reservations)
    .set({ reminderSentAt: now })
    .where(
      and(
        eq(reservations.restaurantId, restaurantId),
        eq(reservations.kind, "booking"),
        eq(reservations.status, "confirmed"),
        isNull(reservations.reminderSentAt),
        gte(reservations.startsAt, new Date(now.getTime() + 15 * 60_000)),
        lt(reservations.startsAt, new Date(now.getTime() + 2 * 3600_000)),
      ),
    )
    .returning();
  for (const r of due) {
    const time = new Intl.DateTimeFormat(place.defaultLocale, {
      timeZone: place.timezone,
      timeStyle: "short",
    }).format(r.startsAt);
    await sendSms(
      r.phone,
      await text(place, "reminder", { restaurant: place.name, time, link: statusLink(place, r.code) }),
    );
  }
  return due.length;
}

/** The cron's sweep: every restaurant with a reminder due (opening the agenda also sends them). */
export async function sendAllDueReminders(db: Database, now = new Date()) {
  const rows = await db
    .selectDistinct({ id: reservations.restaurantId })
    .from(reservations)
    .where(
      and(
        eq(reservations.kind, "booking"),
        eq(reservations.status, "confirmed"),
        isNull(reservations.reminderSentAt),
        gte(reservations.startsAt, new Date(now.getTime() + 15 * 60_000)),
        lt(reservations.startsAt, new Date(now.getTime() + 2 * 3600_000)),
      ),
    );
  let sent = 0;
  for (const r of rows) sent += await sendDueReminders(db, r.id, now);
  return sent;
}

export const reservationSettingsSchema = z.object({
  enabled: z.boolean(),
  autoConfirm: z.boolean(),
  slotCapacity: z.coerce.number().int().min(1).max(2000),
  maxParty: z.coerce.number().int().min(1).max(200),
  durationMin: z.coerce.number().int().min(15).max(480),
});

export async function getReservationSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "orders.view");
  const p = await placeById(db, ctx.restaurant.id);
  if (!p) throw notFound();
  return {
    enabled: p.enabled,
    autoConfirm: p.autoConfirm,
    slotCapacity: p.slotCapacity,
    maxParty: p.maxParty,
    durationMin: p.durationMin,
    slug: p.slug,
  };
}

export async function updateReservationSettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof reservationSettingsSchema>,
) {
  assertCan(ctx, "restaurant.manage");
  const i = reservationSettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({
      reservationsEnabled: i.enabled,
      reservationAutoConfirm: i.autoConfirm,
      reservationSlotCapacity: i.slotCapacity,
      reservationMaxParty: i.maxParty,
      reservationDurationMin: i.durationMin,
    })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
}

// ─── Public status page ──────────────────────────────────────────────────────

export async function getByCode(db: DbOrTx, slug: string, code: string) {
  const place = await placeBySlug(db, slug);
  if (!place || !/^[A-Za-z0-9]{8,16}$/.test(code)) return null;
  const [r] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.code, code), eq(reservations.restaurantId, place.id)));
  if (!r) return null;
  let ahead = 0;
  if (r.kind === "queue" && (r.status === "confirmed" || r.status === "notified")) {
    const [row] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(reservations)
      .where(
        and(
          eq(reservations.restaurantId, place.id),
          eq(reservations.kind, "queue"),
          eq(reservations.status, "confirmed"),
          lt(reservations.queueNumber, r.queueNumber!),
          gte(reservations.startsAt, dayStart(localDay(r.startsAt, place.timezone), place.timezone)),
        ),
      );
    ahead = row?.n ?? 0;
  }
  return { place, reservation: r, ahead };
}

export async function cancelByCode(db: Database, slug: string, code: string) {
  const found = await getByCode(db, slug, code);
  if (!found) throw notFound();
  const r = found.reservation;
  if (!["pending", "confirmed", "notified"].includes(r.status)) throw conflict("invalid_transition");
  await db
    .update(reservations)
    .set({ status: "cancelled" })
    .where(and(eq(reservations.id, r.id), ne(reservations.status, "cancelled")));
  await notifyTeam(db, {
    restaurantId: found.place.id,
    type: "reservation.cancelled",
    payload: {
      reservationId: r.id,
      name: r.name,
      partySize: r.partySize,
      startsAt: r.startsAt.toISOString(),
    },
  });
}
