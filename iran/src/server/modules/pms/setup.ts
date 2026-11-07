import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, pmsSettings, rateDays, ratePlans, roomTypes } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { localDay } from "@/lib/period";
import { edition } from "@/config/edition";

const DEFAULT_VAT_BPS = edition.defaultTaxRates.find((r) => r.isDefault)?.rateBps ?? 0;
import { addDays, eachNight, isDay, nightsBetween } from "./calc";

const MAX_CENTS = 1_000_000_000_000;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const cents = z.coerce.number().int().min(0).max(MAX_CENTS);
const day = z.string().refine(isDay, "invalid_date");
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

// ─── Settings ────────────────────────────────────────────────────────────────

/** The hotel's PMS settings, created with defaults on first use (business day = today). */
export async function getPmsSettings(db: DbOrTx, restaurantId: string, timezone: string) {
  const [row] = await db.select().from(pmsSettings).where(eq(pmsSettings.restaurantId, restaurantId));
  if (row?.businessDate) return { ...row, businessDate: row.businessDate };
  const today = localDay(new Date(), timezone);
  const [created] = await db
    .insert(pmsSettings)
    .values({
      restaurantId,
      businessDate: today,
      // The edition's standard VAT (10% in Iran), editable in the hotel settings.
      roomTaxBps: DEFAULT_VAT_BPS,
      serviceTaxBps: DEFAULT_VAT_BPS,
    })
    .onConflictDoUpdate({
      target: pmsSettings.restaurantId,
      set: { businessDate: sql`coalesce(${pmsSettings.businessDate}, ${today})` },
    })
    .returning();
  return { ...created!, businessDate: created!.businessDate! };
}

export const pmsSettingsSchema = z.object({
  checkInTime: hhmm,
  checkOutTime: hhmm,
  roomTaxBps: z.coerce.number().int().min(0).max(5000),
  serviceTaxBps: z.coerce.number().int().min(0).max(5000),
  cityTaxCents: cents,
  autoChargeRoomService: z.coerce.boolean(),
  minibarSelfService: z.coerce.boolean(),
  chargeNoShows: z.coerce.boolean().default(true),
  /** Commission per booking channel (basis points). */
  channelCommissions: z
    .record(z.string().regex(/^[a-z0-9_]{2,16}$/), z.coerce.number().int().min(0).max(5000))
    .default({}),
  wifiName: optText(64),
  wifiPassword: optText(64),
  guestInfo: optText(4000),
});

export async function updatePmsSettings(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof pmsSettingsSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = pmsSettingsSchema.parse(raw);
  await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  await db.update(pmsSettings).set(input).where(eq(pmsSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "pms.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { roomTaxBps: input.roomTaxBps, cityTaxCents: input.cityTaxCents },
  });
}

// ─── Room types ──────────────────────────────────────────────────────────────

export const roomTypeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(12)
      .transform((v) => v.toUpperCase()),
    name: z.string().trim().min(1).max(80),
    description: optText(2000),
    baseOccupancy: z.coerce.number().int().min(1).max(20),
    maxOccupancy: z.coerce.number().int().min(1).max(20),
    baseRateCents: cents,
    extraAdultCents: cents.default(0),
    overbookLimit: z.coerce.number().int().min(0).max(50).default(0),
    amenities: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  })
  .refine((v) => v.baseOccupancy <= v.maxOccupancy, { message: "occupancy_invalid", path: ["maxOccupancy"] });

export async function listRoomTypes(db: DbOrTx, restaurantId: string) {
  return db
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.restaurantId, restaurantId), isNull(roomTypes.deletedAt)))
    .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.baseRateCents));
}

/** Room types with how many rooms each has (for the setup screen and availability). */
export async function roomTypesWithCounts(db: DbOrTx, restaurantId: string) {
  const [types, counts] = await Promise.all([
    listRoomTypes(db, restaurantId),
    db
      .select({ roomTypeId: diningTables.roomTypeId, n: sql<number>`count(*)::int` })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, restaurantId),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      )
      .groupBy(diningTables.roomTypeId),
  ]);
  const byType = new Map(counts.map((c) => [c.roomTypeId, c.n]));
  return {
    types: types.map((t) => ({ ...t, rooms: byType.get(t.id) ?? 0 })),
    unassignedRooms: byType.get(null) ?? 0,
  };
}

function uniqueViolation(e: unknown) {
  return (
    typeof e === "object" &&
    e !== null &&
    ((e as { code?: string }).code === "23505" ||
      (e as { cause?: { code?: string } }).cause?.code === "23505")
  );
}

export async function createRoomType(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof roomTypeSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = roomTypeSchema.parse(raw);
  try {
    const [row] = await db
      .insert(roomTypes)
      .values({ ...input, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  } catch (e) {
    if (uniqueViolation(e)) throw conflict("code_taken", { field: "code" });
    throw e;
  }
}

export async function updateRoomType(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof roomTypeSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = roomTypeSchema.parse(raw);
  try {
    const [row] = await db
      .update(roomTypes)
      .set(input)
      .where(
        and(eq(roomTypes.id, id), eq(roomTypes.restaurantId, ctx.restaurant.id), isNull(roomTypes.deletedAt)),
      )
      .returning();
    if (!row) throw notFound();
    return row;
  } catch (e) {
    if (uniqueViolation(e)) throw conflict("code_taken", { field: "code" });
    throw e;
  }
}

export async function deleteRoomType(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(roomTypes)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(roomTypes.id, id), eq(roomTypes.restaurantId, ctx.restaurant.id), isNull(roomTypes.deletedAt)),
      )
      .returning({ id: roomTypes.id });
    if (!row) throw notFound();
    await tx
      .update(diningTables)
      .set({ roomTypeId: null })
      .where(and(eq(diningTables.restaurantId, ctx.restaurant.id), eq(diningTables.roomTypeId, id)));
  });
}

/** Sets the type of some rooms (the setup screen assigns several at once). */
export async function assignRoomType(
  db: Database,
  ctx: RestaurantContext,
  roomIds: string[],
  roomTypeId: string | null,
) {
  assertCan(ctx, "rates.manage");
  const ids = z.array(z.uuid()).max(2000).parse(roomIds);
  if (!ids.length) return 0;
  if (roomTypeId) {
    const [type] = await db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, roomTypeId),
          eq(roomTypes.restaurantId, ctx.restaurant.id),
          isNull(roomTypes.deletedAt),
        ),
      );
    if (!type) throw notFound();
  }
  const rows = await db
    .update(diningTables)
    .set({ roomTypeId })
    .where(
      and(
        eq(diningTables.restaurantId, ctx.restaurant.id),
        eq(diningTables.kind, "room"),
        inArray(diningTables.id, ids),
      ),
    )
    .returning({ id: diningTables.id });
  return rows.length;
}

// ─── Rate plans ──────────────────────────────────────────────────────────────

export const MEAL_PLANS = ["RO", "BB", "HB", "FB", "AI"] as const;

export const ratePlanSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(80),
  mealPlan: z.enum(MEAL_PLANS).default("RO"),
  adjustBps: z.coerce.number().int().min(-9000).max(50_000).default(0),
  adjustCents: z.coerce.number().int().min(-MAX_CENTS).max(MAX_CENTS).default(0),
  refundable: z.coerce.boolean().default(true),
  cancelHours: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(24),
  minStay: z.coerce.number().int().min(1).max(60).default(1),
  isDefault: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
  bookableOnline: z.coerce.boolean().default(true),
});

export async function listRatePlans(db: DbOrTx, restaurantId: string, activeOnly = false) {
  return db
    .select()
    .from(ratePlans)
    .where(
      and(
        eq(ratePlans.restaurantId, restaurantId),
        isNull(ratePlans.deletedAt),
        activeOnly ? eq(ratePlans.active, true) : undefined,
      ),
    )
    .orderBy(sql`${ratePlans.isDefault} desc`, asc(ratePlans.code));
}

async function saveRatePlan(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof ratePlanSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = ratePlanSchema.parse(raw);
  const rid = ctx.restaurant.id;
  try {
    return await db.transaction(async (tx) => {
      // One default plan: the one used when a booking names none.
      if (input.isDefault)
        await tx.update(ratePlans).set({ isDefault: false }).where(eq(ratePlans.restaurantId, rid));
      if (!id) {
        const [row] = await tx
          .insert(ratePlans)
          .values({ ...input, restaurantId: rid })
          .returning();
        return row!;
      }
      const [row] = await tx
        .update(ratePlans)
        .set(input)
        .where(and(eq(ratePlans.id, id), eq(ratePlans.restaurantId, rid), isNull(ratePlans.deletedAt)))
        .returning();
      if (!row) throw notFound();
      return row;
    });
  } catch (e) {
    if (uniqueViolation(e)) throw conflict("code_taken", { field: "code" });
    throw e;
  }
}

export const createRatePlan = (db: Database, ctx: RestaurantContext, raw: z.input<typeof ratePlanSchema>) =>
  saveRatePlan(db, ctx, null, raw);
export const updateRatePlan = (
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: z.input<typeof ratePlanSchema>,
) => saveRatePlan(db, ctx, id, raw);

export async function deleteRatePlan(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  const [row] = await db
    .update(ratePlans)
    .set({ deletedAt: new Date(), isDefault: false })
    .where(
      and(eq(ratePlans.id, id), eq(ratePlans.restaurantId, ctx.restaurant.id), isNull(ratePlans.deletedAt)),
    )
    .returning({ id: ratePlans.id });
  if (!row) throw notFound();
}

// ─── Yield calendar ──────────────────────────────────────────────────────────

/** Day rates of every room type over [from, from + days). */
export async function rateCalendar(db: DbOrTx, restaurantId: string, from: string, days: number) {
  const to = addDays(from, Math.max(1, Math.min(days, 92)) - 1);
  return db
    .select()
    .from(rateDays)
    .where(and(eq(rateDays.restaurantId, restaurantId), gte(rateDays.day, from), lte(rateDays.day, to)));
}

export const rateRangeSchema = z
  .object({
    roomTypeId: z.uuid(),
    from: day,
    to: day,
    /** null = back to the base rate. */
    rateCents: cents.nullable(),
    closed: z.coerce.boolean().default(false),
    minStay: z.coerce.number().int().min(1).max(60).nullable().default(null),
    /** 0 = Sunday … 6 = Saturday; empty = every day. */
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  })
  .refine((v) => v.to >= v.from && nightsBetween(v.from, v.to) <= 731, {
    message: "invalid_range",
    path: ["to"],
  });

/** Sets the price / closure / minimum stay of a room type over a date range (inclusive). */
export async function setRateRange(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof rateRangeSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = rateRangeSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const [type] = await db
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(eq(roomTypes.id, input.roomTypeId), eq(roomTypes.restaurantId, rid), isNull(roomTypes.deletedAt)),
    );
  if (!type) throw notFound();
  const days = eachNight(input.from, addDays(input.to, 1)).filter(
    (d) => !input.weekdays.length || input.weekdays.includes(new Date(`${d}T12:00:00Z`).getUTCDay()),
  );
  if (!days.length) throw validation("invalid_range", { field: "to" });
  const plain = input.rateCents == null && !input.closed && input.minStay == null;
  await db.transaction(async (tx) => {
    if (plain) {
      await tx
        .delete(rateDays)
        .where(and(eq(rateDays.roomTypeId, input.roomTypeId), inArray(rateDays.day, days)));
      return;
    }
    await tx
      .insert(rateDays)
      .values(
        days.map((d) => ({
          restaurantId: rid,
          roomTypeId: input.roomTypeId,
          day: d,
          rateCents: input.rateCents,
          closed: input.closed,
          minStay: input.minStay,
        })),
      )
      .onConflictDoUpdate({
        target: [rateDays.roomTypeId, rateDays.day],
        set: {
          rateCents: sql`excluded.rate_cents`,
          closed: sql`excluded.closed`,
          minStay: sql`excluded.min_stay`,
        },
      });
  });
  await recordAudit(db, {
    action: "pms.rates_updated",
    actorUserId: ctx.user.id,
    restaurantId: rid,
    entityType: "room_type",
    entityId: input.roomTypeId,
    metadata: { from: input.from, to: input.to, rateCents: input.rateCents, closed: input.closed },
  });
  return days.length;
}
