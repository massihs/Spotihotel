import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, roomTypes, stays } from "@/server/db/schema";
import { notFound, validation } from "@/server/errors";
import { recordAudit } from "@/server/audit";
import { normalizeDigits } from "@/lib/money";
import { isIranNationalCode } from "@/lib/iran-id";
import { guestFields, nationalCodeOk, nationalCodeRule } from "./guests";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isDay, nightsBetween } from "./calc";
import { getPmsSettings, listRatePlans } from "./setup";
import { ACTIVE_STAY, availabilityGrid, getStay, quoteStay } from "./stays";

export const bookingSearchSchema = z
  .object({
    arrival: z.string().refine(isDay, "invalid_date"),
    departure: z.string().refine(isDay, "invalid_date"),
    adults: z.coerce.number().int().min(1).max(20).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
  })
  .refine((v) => v.departure > v.arrival && nightsBetween(v.arrival, v.departure) <= 60, {
    message: "invalid_range",
    path: ["departure"],
  });

/**
 * Everything the desk needs to sell a stay in one look: for the dates and party, every room type
 * with the rooms still free over the whole stay and the price of each rate plan (dynamic pricing,
 * minimum stays and closed days included), cheapest bookable offer first.
 */
export async function bookingOptions(
  db: DbOrTx,
  ctx: RestaurantContext,
  raw: z.input<typeof bookingSearchSchema>,
) {
  assertCan(ctx, "frontdesk.view");
  const q = bookingSearchSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const nights = nightsBetween(q.arrival, q.departure);
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  if (q.arrival < businessDate) throw validation("arrival_in_past", { field: "arrival" });
  const [grid, plans, types] = await Promise.all([
    availabilityGrid(db, ctx, q.arrival, nights),
    listRatePlans(db, rid, true),
    db
      .select()
      .from(roomTypes)
      .where(and(eq(roomTypes.restaurantId, rid), isNull(roomTypes.deletedAt)))
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.baseRateCents)),
  ]);
  const byId = new Map(types.map((t) => [t.id, t]));
  const options = await Promise.all(
    grid.types.map(async (g) => {
      const type = byId.get(g.id)!;
      const available = g.days.length ? Math.min(...g.days.map((d) => d.free)) : 0;
      const closed = g.days.some((d) => d.closed);
      const quotes = await Promise.all(
        (plans.length ? plans : [null]).map(async (p) => {
          const res = await quoteStay(db, rid, {
            roomTypeId: g.id,
            ratePlanId: p?.id ?? null,
            arrival: q.arrival,
            departure: q.departure,
            adults: q.adults,
            today: businessDate,
          });
          return {
            ratePlanId: p?.id ?? null,
            code: p?.code ?? null,
            name: p?.name ?? null,
            mealPlan: p?.mealPlan ?? "RO",
            refundable: p?.refundable ?? true,
            cancelHours: p?.cancelHours ?? 24,
            isDefault: p?.isDefault ?? true,
            totalCents: res.totalCents,
            perNightCents: nights ? Math.round(res.totalCents / nights) : res.totalCents,
            nights: res.nights,
            adjusted: res.adjustments.length > 0,
            issues: res.issues,
            minStay: res.minStay,
          };
        }),
      );
      const sellable = quotes.filter((x) => !x.issues.length);
      return {
        id: g.id,
        code: g.code,
        name: g.name,
        description: type.description,
        baseOccupancy: type.baseOccupancy,
        maxOccupancy: type.maxOccupancy,
        amenities: type.amenities,
        rooms: g.rooms,
        available: Math.max(0, available),
        closed,
        fits: q.adults <= type.maxOccupancy,
        fromCents: sellable.length ? Math.min(...sellable.map((x) => x.totalCents)) : null,
        quotes,
      };
    }),
  );
  return { ...q, nights, businessDate, types: options };
}

/**
 * Rooms that can take a stay: of the type (or any type), with no other active stay over the
 * dates, not out of order; clean ones first, then by floor and number. `occupiedNow` flags a room
 * whose guest is still in it (a departure not yet checked out).
 */
export async function availableRooms(
  db: DbOrTx,
  restaurantId: string,
  q: { roomTypeId?: string | null; arrival: string; departure: string; excludeStayId?: string | null },
) {
  const rows = await db
    .select({
      id: diningTables.id,
      label: diningTables.label,
      number: diningTables.number,
      zone: diningTables.zone,
      housekeeping: diningTables.housekeeping,
      roomTypeId: diningTables.roomTypeId,
      typeCode: roomTypes.code,
      clash: sql<boolean>`exists (select 1 from ${stays} s where s.room_id = ${diningTables.id} and s.status in ('tentative','confirmed','in_house') and s.arrival < ${q.departure} and s.departure > ${q.arrival} ${q.excludeStayId ? sql`and s.id <> ${q.excludeStayId}` : sql``})`,
      occupiedNow: sql<boolean>`exists (select 1 from ${stays} s where s.room_id = ${diningTables.id} and s.status = 'in_house' ${q.excludeStayId ? sql`and s.id <> ${q.excludeStayId}` : sql``})`,
    })
    .from(diningTables)
    .leftJoin(roomTypes, eq(roomTypes.id, diningTables.roomTypeId))
    .where(
      and(
        eq(diningTables.restaurantId, restaurantId),
        eq(diningTables.kind, "room"),
        isNull(diningTables.deletedAt),
        sql`${diningTables.housekeeping} <> 'out_of_order'`,
        q.roomTypeId ? eq(diningTables.roomTypeId, q.roomTypeId) : undefined,
      ),
    )
    .orderBy(
      sql`${diningTables.housekeeping} in ('clean','inspected') desc`,
      asc(diningTables.number),
      asc(diningTables.label),
    );
  return rows.filter((r) => !r.clash).map(({ clash: _c, ...r }) => r);
}

/** Active stays of a guest (for "already booked" warnings while booking). */
export async function activeStaysOf(db: DbOrTx, restaurantId: string, guestIds: string[]) {
  if (!guestIds.length) return [];
  return db
    .select({
      guestId: stays.guestId,
      arrival: stays.arrival,
      departure: stays.departure,
      status: stays.status,
    })
    .from(stays)
    .where(
      and(
        eq(stays.restaurantId, restaurantId),
        inArray(stays.guestId, guestIds),
        inArray(stays.status, [...ACTIVE_STAY]),
      ),
    );
}

// ─── Guided check-in ─────────────────────────────────────────────────────────

/** What the police registration (Amaken) needs: name, and national code + father's name, or passport. */
export const identitySchema = guestFields
  .pick({
    firstName: true,
    lastName: true,
    fatherName: true,
    phone: true,
    nationality: true,
    documentType: true,
    documentNumber: true,
    birthDate: true,
  })
  .refine(nationalCodeOk, nationalCodeRule);

/** Updates only the identity fields of a guest (preferences, VIP flag and notes stay as they are). */
export async function updateGuestIdentity(
  db: Database,
  ctx: RestaurantContext,
  guestId: string,
  raw: z.input<typeof identitySchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const input = identitySchema.parse({
    ...raw,
    documentNumber: raw.documentNumber ? normalizeDigits(raw.documentNumber) : raw.documentNumber,
  });
  const [row] = await db
    .update(hotelGuests)
    .set(input)
    .where(and(eq(hotelGuests.id, guestId), eq(hotelGuests.restaurantId, ctx.restaurant.id)))
    .returning({ id: hotelGuests.id });
  if (!row) throw notFound();
  return row.id;
}

/** Is the guest's identity complete enough for the police register? */
export function identityComplete(g: {
  lastName: string;
  fatherName: string | null;
  nationality: string | null;
  documentType: string | null;
  documentNumber: string | null;
}) {
  if (!g.lastName || !g.documentNumber) return false;
  const iranian = !g.nationality || g.nationality === "IR";
  if (iranian) return isIranNationalCode(g.documentNumber) && !!g.fatherName;
  return g.documentType === "passport";
}

/** Everything the check-in screen shows: stay, guest identity, money already in, rooms, Wi-Fi. */
export async function checkInContext(db: DbOrTx, ctx: RestaurantContext, stayId: string) {
  assertCan(ctx, "frontdesk.view");
  const card = await getStay(db, ctx, stayId);
  const settings = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const s = card.stay;
  const lines = card.folios.flatMap((f) => f.lines.filter((l) => !l.voidedAt));
  const paidCents = -lines.filter((l) => l.kind === "payment").reduce((sum, l) => sum + l.amountCents, 0);
  const postedCents = lines.filter((l) => l.kind !== "payment").reduce((sum, l) => sum + l.amountCents, 0);
  const rooms = await availableRooms(db, ctx.restaurant.id, {
    arrival: s.arrival < settings.businessDate ? settings.businessDate : s.arrival,
    departure: s.departure,
    excludeStayId: s.id,
  });
  const g = card.guest;
  return {
    businessDate: settings.businessDate,
    wifi: { name: settings.wifiName, password: settings.wifiPassword },
    stay: {
      id: s.id,
      number: s.number,
      status: s.status,
      arrival: s.arrival,
      departure: s.departure,
      adults: s.adults,
      children: s.children,
      roomTypeId: s.roomTypeId,
      roomId: s.roomId,
      typeCode: card.typeCode,
      totalCents: s.totalCents,
      eta: s.eta,
      notes: s.notes,
      precheckinAt: s.precheckinAt,
      precheckinSigned: !!s.precheckinSignature,
      accountName: card.accountName,
    },
    guest: {
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      fatherName: g.fatherName,
      phone: g.phone,
      nationality: g.nationality,
      documentType: g.documentType,
      documentNumber: g.documentNumber,
      birthDate: g.birthDate,
      vip: g.vip,
      blacklisted: g.blacklisted,
      preferences: g.preferences,
    },
    identityComplete: identityComplete(g),
    folioId: card.folios.find((f) => f.status === "open")?.id ?? card.folios[0]?.id ?? null,
    paidCents,
    /** What is still to pay for the whole stay (nights not posted yet included). */
    dueCents: Math.max(0, Math.max(s.totalCents, postedCents) - paidCents),
    firstNightCents: card.nights[0]?.rateCents ?? 0,
    rooms,
  };
}

// ─── Automatic room allocation ───────────────────────────────────────────────

export const autoAssignSchema = z
  .object({
    from: z.string().refine(isDay, "invalid_date"),
    to: z.string().refine(isDay, "invalid_date"),
  })
  .refine((v) => v.to > v.from && nightsBetween(v.from, v.to) <= 62, {
    message: "invalid_range",
    path: ["to"],
  });

/**
 * Gives a room to every booking arriving in [from, to) that has none: a free room of its type for
 * the whole stay, packed tight (the room whose previous guest leaves closest to the arrival, so
 * free nights stay together and long stays still fit), clean rooms and lower floors first. A guest
 * arriving today never gets a room someone is still in. Types are locked meanwhile, so a booking
 * made at the same time cannot take the same room.
 */
export async function autoAssignRooms(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof autoAssignSchema>,
) {
  assertCan(ctx, "frontdesk.manage");
  const q = autoAssignSchema.parse(raw);
  const rid = ctx.restaurant.id;
  const { businessDate } = await getPmsSettings(db, rid, ctx.restaurant.timezone);
  const from = q.from < businessDate ? businessDate : q.from;
  if (q.to <= from) return { assigned: 0, left: 0 };
  return db.transaction(async (tx) => {
    const pending = await tx
      .select({
        id: stays.id,
        roomTypeId: stays.roomTypeId,
        arrival: stays.arrival,
        departure: stays.departure,
      })
      .from(stays)
      .where(
        and(
          eq(stays.restaurantId, rid),
          inArray(stays.status, ["tentative", "confirmed"]),
          isNull(stays.roomId),
          gte(stays.arrival, from),
          lt(stays.arrival, q.to),
        ),
      )
      // Longest stays first on each day: they are the hardest to fit.
      .orderBy(asc(stays.arrival), desc(stays.departure));
    if (!pending.length) return { assigned: 0, left: 0 };
    const typeIds = [...new Set(pending.map((s) => s.roomTypeId))].sort();
    for (const id of typeIds)
      await tx.select({ id: roomTypes.id }).from(roomTypes).where(eq(roomTypes.id, id)).for("update");
    const lastDeparture = pending.reduce(
      (m, s) => (s.departure > m ? s.departure : m),
      pending[0]!.departure,
    );
    const [rooms, taken] = await Promise.all([
      tx
        .select({ id: diningTables.id, roomTypeId: diningTables.roomTypeId })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.restaurantId, rid),
            eq(diningTables.kind, "room"),
            isNull(diningTables.deletedAt),
            sql`${diningTables.housekeeping} <> 'out_of_order'`,
            inArray(diningTables.roomTypeId, typeIds),
          ),
        )
        .orderBy(
          sql`${diningTables.housekeeping} in ('clean','inspected') desc`,
          asc(diningTables.number),
          asc(diningTables.label),
        ),
      tx
        .select({
          roomId: stays.roomId,
          arrival: stays.arrival,
          departure: stays.departure,
          status: stays.status,
        })
        .from(stays)
        .where(
          and(
            eq(stays.restaurantId, rid),
            inArray(stays.status, ["tentative", "confirmed", "in_house"]),
            isNotNull(stays.roomId),
            lt(stays.arrival, lastDeparture),
            gt(stays.departure, from < businessDate ? from : businessDate),
          ),
        ),
    ]);
    const busy = new Map<string, { a: string; d: string }[]>();
    const occupiedNow = new Set<string>();
    for (const t of taken) {
      busy.set(t.roomId!, [...(busy.get(t.roomId!) ?? []), { a: t.arrival, d: t.departure }]);
      if (t.status === "in_house") occupiedNow.add(t.roomId!);
    }
    let assigned = 0;
    for (const s of pending) {
      let best: string | null = null;
      let bestGap = Infinity;
      for (const r of rooms) {
        if (r.roomTypeId !== s.roomTypeId) continue;
        if (s.arrival <= businessDate && occupiedNow.has(r.id)) continue;
        const list = busy.get(r.id) ?? [];
        if (list.some((x) => x.a < s.departure && x.d > s.arrival)) continue;
        const before = list.reduce<string | null>(
          (m, x) => (x.d <= s.arrival && (!m || x.d > m) ? x.d : m),
          null,
        );
        const gap = before ? nightsBetween(before, s.arrival) : 10_000;
        if (gap < bestGap) {
          best = r.id;
          bestGap = gap;
          if (gap === 0) break;
        }
      }
      if (!best) continue;
      busy.set(best, [...(busy.get(best) ?? []), { a: s.arrival, d: s.departure }]);
      await tx
        .update(stays)
        .set({ roomId: best })
        .where(and(eq(stays.id, s.id), isNull(stays.roomId)));
      assigned++;
    }
    if (assigned)
      await recordAudit(tx, {
        action: "stay.rooms_auto_assigned",
        actorUserId: ctx.user.id,
        restaurantId: rid,
        entityType: "restaurant",
        entityId: rid,
        metadata: { from, to: q.to, assigned },
      });
    return { assigned, left: pending.length - assigned };
  });
}
