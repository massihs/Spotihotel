import { and, asc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  hotelGuests,
  hotelServices,
  serviceBookings,
  stays,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { dayStart, localDay, wallTime } from "@/lib/period";
import { addDays, isDay, serviceSlots } from "./calc";
import { mainFolioOf, postLine } from "./folios";
import { guestName } from "./guests";
import { getPmsSettings } from "./setup";

export const SERVICE_KINDS = [
  "spa",
  "sauna",
  "pool",
  "massage",
  "hammam",
  "gym",
  "beauty",
  "tennis",
  "other",
] as const;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const serviceSchema = z
  .object({
    kind: z.enum(SERVICE_KINDS),
    name: z.string().trim().min(1).max(120),
    description: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    durationMin: z.coerce.number().int().min(5).max(600),
    priceCents: z.coerce.number().int().min(0).max(1_000_000_000_000),
    capacity: z.coerce.number().int().min(1).max(500),
    opensAt: hhmm,
    closesAt: hhmm,
    slotStepMin: z.coerce.number().int().min(5).max(240).default(30),
    guestBookable: z.coerce.boolean().default(true),
    active: z.coerce.boolean().default(true),
  })
  .refine((v) => v.opensAt < v.closesAt, { message: "invalid_hours", path: ["closesAt"] });

export async function listServices(db: DbOrTx, restaurantId: string, opts: { guestOnly?: boolean } = {}) {
  return db
    .select()
    .from(hotelServices)
    .where(
      and(
        eq(hotelServices.restaurantId, restaurantId),
        isNull(hotelServices.deletedAt),
        opts.guestOnly
          ? and(eq(hotelServices.active, true), eq(hotelServices.guestBookable, true))
          : undefined,
      ),
    )
    .orderBy(asc(hotelServices.sortOrder), asc(hotelServices.name));
}

export async function saveService(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof serviceSchema>,
) {
  assertCan(ctx, "rates.manage");
  const input = serviceSchema.parse(raw);
  if (!id) {
    const [row] = await db
      .insert(hotelServices)
      .values({ ...input, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(hotelServices)
    .set(input)
    .where(
      and(
        eq(hotelServices.id, id),
        eq(hotelServices.restaurantId, ctx.restaurant.id),
        isNull(hotelServices.deletedAt),
      ),
    )
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function deleteService(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  const [row] = await db
    .update(hotelServices)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(hotelServices.id, id), eq(hotelServices.restaurantId, ctx.restaurant.id)))
    .returning({ id: hotelServices.id });
  if (!row) throw notFound();
}

const LIVE_BOOKING = ["booked", "done"] as const;

/** Start times of a day with the places left at each (the guest's and the desk's slot picker). */
export async function serviceDay(
  db: DbOrTx,
  restaurant: { id: string; timezone: string },
  serviceId: string,
  day: string,
  now = new Date(),
) {
  if (!isUuid(serviceId) || !isDay(day)) throw notFound();
  const [svc] = await db
    .select()
    .from(hotelServices)
    .where(
      and(
        eq(hotelServices.id, serviceId),
        eq(hotelServices.restaurantId, restaurant.id),
        isNull(hotelServices.deletedAt),
      ),
    );
  if (!svc) throw notFound();
  const tz = restaurant.timezone;
  const booked = await db
    .select({
      startsAt: serviceBookings.startsAt,
      endsAt: serviceBookings.endsAt,
      people: serviceBookings.people,
    })
    .from(serviceBookings)
    .where(
      and(
        eq(serviceBookings.serviceId, svc.id),
        inArray(serviceBookings.status, [...LIVE_BOOKING]),
        lt(serviceBookings.startsAt, dayStart(addDays(day, 1), tz)),
        gt(serviceBookings.endsAt, dayStart(day, tz)),
      ),
    );
  const slots = serviceSlots(svc.opensAt, svc.closesAt, svc.slotStepMin, svc.durationMin).map((time) => {
    const start = wallTime(day, time, tz);
    const end = new Date(start.getTime() + svc.durationMin * 60_000);
    const taken = booked
      .filter((b) => b.startsAt < end && b.endsAt > start)
      .reduce((s, b) => s + b.people, 0);
    return {
      time,
      startsAt: start.toISOString(),
      left: Math.max(0, svc.capacity - taken),
      past: start <= now,
    };
  });
  return { service: svc, day, slots };
}

export const bookingSchema = z.object({
  serviceId: z.uuid(),
  day: z.string().refine(isDay, "invalid_date"),
  time: hhmm,
  people: z.coerce.number().int().min(1).max(50).default(1),
  /** A hotel guest: the price goes on their room bill. */
  stayId: z
    .string()
    .transform((v) => v || null)
    .pipe(z.uuid().nullable())
    .nullable()
    .optional(),
  /** A visitor (day spa) when there is no stay. */
  guestName: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .max(24)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  staffName: z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || null)
    .nullable()
    .optional(),
  note: z
    .string()
    .trim()
    .max(300)
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

/**
 * Books a slot. Places are checked under the service's row lock (two guests cannot take the last
 * place). For a guest in house the price is charged to the room's folio at once.
 */
async function book(
  db: Database,
  restaurant: { id: string; timezone: string },
  input: z.output<typeof bookingSchema>,
  by: { userId: string | null; source: "staff" | "guest" },
  now = new Date(),
) {
  const rid = restaurant.id;
  return db.transaction(async (tx) => {
    const [svc] = await tx
      .select()
      .from(hotelServices)
      .where(
        and(
          eq(hotelServices.id, input.serviceId),
          eq(hotelServices.restaurantId, rid),
          isNull(hotelServices.deletedAt),
          eq(hotelServices.active, true),
        ),
      )
      .for("update");
    if (!svc) throw notFound();
    if (by.source === "guest" && !svc.guestBookable) throw notFound();
    const slots = serviceSlots(svc.opensAt, svc.closesAt, svc.slotStepMin, svc.durationMin);
    if (!slots.includes(input.time)) throw validation("invalid_slot", { field: "time" });
    const startsAt = wallTime(input.day, input.time, restaurant.timezone);
    if (startsAt <= now) throw validation("slot_in_past", { field: "time" });
    const endsAt = new Date(startsAt.getTime() + svc.durationMin * 60_000);
    const [taken] = await tx
      .select({ n: sql<number>`coalesce(sum(${serviceBookings.people}),0)::int` })
      .from(serviceBookings)
      .where(
        and(
          eq(serviceBookings.serviceId, svc.id),
          inArray(serviceBookings.status, [...LIVE_BOOKING]),
          lt(serviceBookings.startsAt, endsAt),
          gt(serviceBookings.endsAt, startsAt),
        ),
      );
    if ((taken?.n ?? 0) + input.people > svc.capacity) throw conflict("slot_full");

    let stay: typeof stays.$inferSelect | null = null;
    let roomLabel: string | null = null;
    let name = input.guestName;
    let phone = input.phone ?? null;
    if (input.stayId) {
      const [row] = await tx
        .select({ s: stays, g: hotelGuests, room: diningTables.label })
        .from(stays)
        .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
        .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
        .where(and(eq(stays.id, input.stayId), eq(stays.restaurantId, rid)));
      if (!row) throw notFound();
      if (!["confirmed", "in_house", "tentative"].includes(row.s.status)) throw conflict("stay_closed");
      stay = row.s;
      roomLabel = row.room;
      name = guestName(row.g);
      phone ??= row.g.phone;
    }
    if (!name) throw validation("guest_required", { field: "guestName" });
    const priceCents = svc.priceCents * input.people;
    const [created] = await tx
      .insert(serviceBookings)
      .values({
        restaurantId: rid,
        serviceId: svc.id,
        stayId: stay?.id ?? null,
        roomLabel,
        guestName: name,
        phone,
        startsAt,
        endsAt,
        people: input.people,
        priceCents,
        source: by.source,
        staffName: input.staffName ?? null,
        note: input.note ?? null,
        createdByUserId: by.userId,
      })
      .returning();
    if (stay && priceCents > 0) {
      const settings = await getPmsSettings(tx, rid, restaurant.timezone);
      const folio = await mainFolioOf(tx, rid, stay.id);
      const line = await postLine(tx, rid, restaurant.timezone, {
        folioId: folio.id,
        kind: "charge",
        department: "spa",
        description: `${svc.name} · ${input.day} ${input.time}`,
        quantity: input.people,
        unitCents: svc.priceCents,
        amountCents: priceCents,
        taxRateBps: settings.serviceTaxBps,
        sourceType: "service_booking",
        sourceId: created!.id,
        userId: by.userId,
      });
      await tx
        .update(serviceBookings)
        .set({ folioLineId: line.id })
        .where(eq(serviceBookings.id, created!.id));
    }
    await recordAudit(tx, {
      action: "service.booked",
      actorUserId: by.userId,
      actorType: by.source === "guest" ? "guest" : undefined,
      restaurantId: rid,
      entityType: "service_booking",
      entityId: created!.id,
      metadata: { service: svc.name, startsAt: startsAt.toISOString(), people: input.people },
    });
    await emit(tx, { topic: topics.restaurant(rid), type: "notification.created" });
    return created!;
  });
}

export async function bookServiceAsStaff(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof bookingSchema>,
  now = new Date(),
) {
  assertCan(ctx, "frontdesk.manage");
  return book(db, ctx.restaurant, bookingSchema.parse(raw), { userId: ctx.user.id, source: "staff" }, now);
}

/** From the room's QR: only for the guest in that room, charged to its bill. */
export async function bookServiceAsGuest(
  db: Database,
  restaurant: { id: string; timezone: string },
  stayId: string,
  raw: z.input<typeof bookingSchema>,
  now = new Date(),
) {
  const input = bookingSchema.parse({ ...raw, stayId });
  return book(db, restaurant, input, { userId: null, source: "guest" }, now);
}

/** Cancels a booking; what was charged to the room is voided. */
export async function cancelServiceBooking(
  db: Database,
  restaurant: { id: string; timezone: string },
  bookingId: string,
  by: { userId: string | null; stayId?: string },
  now = new Date(),
) {
  const rid = restaurant.id;
  return db.transaction(async (tx) => {
    const [b] = await tx
      .select()
      .from(serviceBookings)
      .where(and(eq(serviceBookings.id, bookingId), eq(serviceBookings.restaurantId, rid)))
      .for("update");
    if (!b || (by.stayId && b.stayId !== by.stayId)) throw notFound();
    if (b.status !== "booked") throw conflict("not_cancellable");
    // Guests cancel themselves until the slot starts; staff any time.
    if (!by.userId && b.startsAt <= now) throw conflict("too_late");
    await tx.update(serviceBookings).set({ status: "cancelled" }).where(eq(serviceBookings.id, b.id));
    if (b.folioLineId) {
      await tx
        .update(folioLines)
        .set({ voidedAt: new Date(), voidReason: "service_cancelled", voidedByUserId: by.userId })
        .where(and(eq(folioLines.id, b.folioLineId), isNull(folioLines.voidedAt)));
    }
    await recordAudit(tx, {
      action: "service.cancelled",
      actorUserId: by.userId,
      actorType: by.userId ? undefined : "guest",
      restaurantId: rid,
      entityType: "service_booking",
      entityId: b.id,
    });
  });
}

export async function setServiceBookingStatus(
  db: Database,
  ctx: RestaurantContext,
  bookingId: string,
  status: "done" | "no_show",
) {
  assertCan(ctx, "frontdesk.manage");
  const [row] = await db
    .update(serviceBookings)
    .set({ status })
    .where(
      and(
        eq(serviceBookings.id, bookingId),
        eq(serviceBookings.restaurantId, ctx.restaurant.id),
        eq(serviceBookings.status, "booked"),
      ),
    )
    .returning({ id: serviceBookings.id });
  if (!row) throw conflict("not_booked");
}

/** The spa desk's day: every booking by service and time. */
export async function wellnessDay(db: DbOrTx, ctx: RestaurantContext, day?: string) {
  assertCan(ctx, "frontdesk.view");
  const tz = ctx.restaurant.timezone;
  const d = day && isDay(day) ? day : localDay(new Date(), tz);
  const [services, bookings] = await Promise.all([
    listServices(db, ctx.restaurant.id),
    db
      .select()
      .from(serviceBookings)
      .where(
        and(
          eq(serviceBookings.restaurantId, ctx.restaurant.id),
          ne(serviceBookings.status, "cancelled"),
          lt(serviceBookings.startsAt, dayStart(addDays(d, 1), tz)),
          gt(serviceBookings.endsAt, dayStart(d, tz)),
        ),
      )
      .orderBy(asc(serviceBookings.startsAt)),
  ]);
  return { day: d, services, bookings };
}

/** A stay's wellness bookings (guest portal, reservation card). */
export async function bookingsOfStay(db: DbOrTx, restaurantId: string, stayId: string) {
  return db
    .select({
      id: serviceBookings.id,
      service: hotelServices.name,
      kind: hotelServices.kind,
      startsAt: serviceBookings.startsAt,
      people: serviceBookings.people,
      priceCents: serviceBookings.priceCents,
      status: serviceBookings.status,
    })
    .from(serviceBookings)
    .innerJoin(hotelServices, eq(hotelServices.id, serviceBookings.serviceId))
    .where(and(eq(serviceBookings.restaurantId, restaurantId), eq(serviceBookings.stayId, stayId)))
    .orderBy(asc(serviceBookings.startsAt));
}
