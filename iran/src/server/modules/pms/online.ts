import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { ratePlans, restaurants } from "@/server/db/schema";
import { notFound, validation } from "@/server/errors";
import type { RestaurantContext } from "@/server/tenancy";
import { sms } from "@/server/infra/sms";
import { normalizeDigits } from "@/lib/money";
import { isIranNationalCode } from "@/lib/iran-id";
import { isDay, nightsBetween } from "./calc";
import { computeBookingOptions } from "./booking";
import { precheckinLink } from "./precheckin";
import { createStay } from "./stays";

/**
 * The hotel's own booking page (/h/slug): guests see the rooms free for their dates and the
 * prices of the plans sold online, book directly (no platform commission) and get the link to
 * fill their police registration before they come.
 */

/** A hotel taking bookings on its page: an active hotel. */
export async function onlineHotel(db: DbOrTx, slug: string) {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  const [r] = await db
    .select({
      id: restaurants.id,
      organizationId: restaurants.organizationId,
      slug: restaurants.slug,
      name: restaurants.name,
      status: restaurants.status,
      currency: restaurants.currency,
      timezone: restaurants.timezone,
      defaultLocale: restaurants.defaultLocale,
      logoKey: restaurants.logoKey,
      kind: restaurants.kind,
      brandColor: restaurants.brandColor,
      phone: restaurants.phone,
      email: restaurants.email,
      addressLine1: restaurants.addressLine1,
      city: restaurants.city,
    })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.slug, slug),
        eq(restaurants.kind, "hotel"),
        eq(restaurants.status, "active"),
        isNull(restaurants.deletedAt),
      ),
    );
  return r ?? null;
}

export const onlineSearchSchema = z.object({
  arrival: z.string().refine(isDay, "invalid_date"),
  departure: z.string().refine(isDay, "invalid_date"),
  adults: z.coerce.number().int().min(1).max(8).default(2),
  children: z.coerce.number().int().min(0).max(8).default(0),
  promoCode: z.string().trim().max(32).optional(),
});

/** Room types with the offers a guest can book online for the dates (cheapest first). */
export async function onlineOffers(db: DbOrTx, slug: string, raw: z.input<typeof onlineSearchSchema>) {
  const hotel = await onlineHotel(db, slug);
  if (!hotel) throw notFound();
  const q = onlineSearchSchema.parse(raw);
  if (q.departure <= q.arrival || nightsBetween(q.arrival, q.departure) > 30)
    throw validation("invalid_range", { field: "departure" });
  const o = await computeBookingOptions(db, { restaurant: hotel }, q, { onlineOnly: true });
  const types = o.types
    .filter((t) => t.quotes.length)
    .map((t) => {
      const offers = t.quotes
        .filter((x) => !x.issues.length)
        .map((x) => ({
          ratePlanId: x.ratePlanId,
          name: x.name,
          mealPlan: x.mealPlan,
          refundable: x.refundable,
          cancelHours: x.cancelHours,
          totalCents: x.totalCents,
          perNightCents: x.perNightCents,
          discountCents: x.discountCents,
        }))
        .sort((a, b) => a.totalCents - b.totalCents);
      const minStay = Math.max(
        0,
        ...t.quotes.filter((x) => x.issues.includes("min_stay")).map((x) => x.minStay),
      );
      // Closed to arrival or departure that day, or longer than allowed: not bookable as asked.
      const restricted = t.quotes.some((x) =>
        x.issues.some((i) => ["closed_to_arrival", "closed_to_departure", "max_stay"].includes(i)),
      );
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        maxOccupancy: t.maxOccupancy,
        amenities: t.amenities,
        /** Rooms still free over the whole stay (shown when few are left). */
        left: t.available,
        fits: t.fits,
        closed: t.closed,
        minStay: offers.length ? 0 : minStay,
        restricted: !offers.length && restricted,
        offers: t.available > 0 && t.fits ? offers : [],
        fromCents: offers[0]?.totalCents ?? null,
      };
    })
    .sort(
      (a, b) =>
        Number(!a.offers.length) - Number(!b.offers.length) || (a.fromCents ?? 0) - (b.fromCents ?? 0),
    );
  return {
    arrival: o.arrival,
    departure: o.departure,
    adults: o.adults,
    children: o.children,
    nights: o.nights,
    today: o.businessDate,
    types,
    promo: o.promo,
  };
}

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const onlineBookSchema = onlineSearchSchema
  .extend({
    roomTypeId: z.uuid(),
    ratePlanId: z.uuid().nullable().optional(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .transform((v) => normalizeDigits(v).replace(/[\s()-]/g, ""))
      .pipe(z.string().regex(/^\+?\d{7,15}$/, "invalid_phone")),
    email: z
      .string()
      .trim()
      .max(320)
      .transform((v) => v.toLowerCase() || null)
      .pipe(z.email().nullable())
      .nullable()
      .optional(),
    foreign: z.coerce.boolean().default(false),
    /** Iranian guests may give their national code now (the police register needs it at arrival). */
    nationalCode: z
      .string()
      .transform((v) => normalizeDigits(v).replace(/\D/g, "") || null)
      .nullable()
      .optional(),
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
    notes: optText(500),
    /** Left empty by people, filled by bots. */
    website: z.string().max(0, "spam").optional(),
  })
  .refine((v) => v.foreign || !v.nationalCode || isIranNationalCode(v.nationalCode), {
    message: "invalid_national_code",
    path: ["nationalCode"],
  });

/** A booking made by a guest on the hotel's page: no member of staff behind it (audited as the system). */
function websiteContext(hotel: NonNullable<Awaited<ReturnType<typeof onlineHotel>>>): RestaurantContext {
  return {
    user: {
      id: null as unknown as string,
      email: "",
      fullName: "website",
      locale: null,
      isSuperAdmin: false,
    },
    restaurant: hotel,
    role: "staff",
    permissions: new Set(["frontdesk.view", "frontdesk.manage"]),
    viaSuperAdmin: false,
  };
}

/** Books the offer for the guest: confirmed, source "website", price as quoted (rechecked). */
export async function onlineBook(db: Database, slug: string, raw: z.input<typeof onlineBookSchema>) {
  const hotel = await onlineHotel(db, slug);
  if (!hotel) throw notFound();
  const input = onlineBookSchema.parse(raw);
  if (input.departure <= input.arrival || nightsBetween(input.arrival, input.departure) > 30)
    throw validation("invalid_range", { field: "departure" });
  let plan: typeof ratePlans.$inferSelect | null = null;
  if (input.ratePlanId) {
    const [p] = await db
      .select()
      .from(ratePlans)
      .where(
        and(
          eq(ratePlans.id, input.ratePlanId),
          eq(ratePlans.restaurantId, hotel.id),
          eq(ratePlans.active, true),
          eq(ratePlans.bookableOnline, true),
          isNull(ratePlans.deletedAt),
        ),
      );
    if (!p) throw notFound("rate_not_found");
    plan = p;
  }
  const iranian = !input.foreign;
  const stay = await createStay(db, websiteContext(hotel), {
    guest: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email ?? null,
      nationality: iranian ? "IR" : null,
      documentType: iranian && input.nationalCode ? "id_card" : null,
      documentNumber: iranian ? (input.nationalCode ?? null) : null,
    },
    roomTypeId: input.roomTypeId,
    ratePlanId: plan?.id ?? null,
    arrival: input.arrival,
    departure: input.departure,
    adults: input.adults,
    children: input.children,
    source: "website",
    status: "confirmed",
    guarantee: "none",
    eta: input.eta ?? null,
    notes: input.notes ?? null,
    promoCode: input.promoCode || null,
  });
  const link = precheckinLink(stay.code);
  // A text with the booking number and the online registration link (logged only without a provider).
  await sms()
    .send(input.phone, `${hotel.name}\n#${stay.number} ${input.arrival} → ${input.departure}\n${link}`)
    .catch(() => {});
  return {
    number: stay.number,
    code: stay.code,
    arrival: stay.arrival,
    departure: stay.departure,
    totalCents: stay.totalCents,
    planName: plan?.name ?? null,
    refundable: plan?.refundable ?? true,
    cancelHours: plan?.cancelHours ?? 24,
    precheckin: `/precheckin/${stay.code}`,
  };
}
