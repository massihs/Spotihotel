import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { hotelGuests, restaurants, roomTypes, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { emit, topics } from "@/server/infra/realtime";
import { sms } from "@/server/infra/sms";
import { env } from "@/server/env";
import { conflict, notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { guestFields, nationalCodeOk, nationalCodeRule } from "./guests";

/**
 * Online pre-check-in: before arriving, the guest opens a private link (the booking's code),
 * fills the registration card the police asks for (father's name, national code or passport,
 * birth date…), gives an arrival time and signs. The front desk sees the booking as
 * pre-registered and only hands over the key.
 */
const OPEN = ["tentative", "confirmed"];

export const precheckinLink = (code: string) => `${env().APP_URL}/precheckin/${code}`;

/** What the guest sees on the pre-check-in page (no internal ids). */
export async function precheckinView(db: DbOrTx, code: string) {
  if (!/^[A-Za-z0-9_-]{8,16}$/.test(code)) return null;
  const [row] = await db
    .select({
      stay: stays,
      guest: hotelGuests,
      hotel: { name: restaurants.name, brandColor: restaurants.brandColor, timezone: restaurants.timezone },
      typeName: roomTypes.name,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .innerJoin(restaurants, eq(restaurants.id, stays.restaurantId))
    .innerJoin(roomTypes, eq(roomTypes.id, stays.roomTypeId))
    .where(eq(stays.code, code));
  if (!row) return null;
  const g = row.guest;
  return {
    hotel: row.hotel,
    number: row.stay.number,
    status: row.stay.status,
    arrival: row.stay.arrival,
    departure: row.stay.departure,
    adults: row.stay.adults,
    children: row.stay.children,
    roomType: row.typeName,
    eta: row.stay.eta,
    open: OPEN.includes(row.stay.status),
    done: !!row.stay.precheckinAt,
    guest: {
      firstName: g.firstName,
      lastName: g.lastName,
      fatherName: g.fatherName,
      phone: g.phone,
      email: g.email,
      nationality: g.nationality,
      documentType: g.documentType,
      documentNumber: g.documentNumber,
      birthDate: g.birthDate,
      address: g.address,
    },
  };
}

export const precheckinSchema = guestFields
  .pick({
    firstName: true,
    fatherName: true,
    phone: true,
    email: true,
    nationality: true,
    documentType: true,
    documentNumber: true,
    birthDate: true,
    address: true,
  })
  .extend({
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
    requests: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => v || null)
      .nullable()
      .optional(),
    /** The guest types their full name as a signature of the registration card. */
    signature: z.string().trim().min(3).max(120),
    accept: z.literal(true),
  })
  .refine(nationalCodeOk, nationalCodeRule)
  .refine((v) => !!v.documentType && !!v.documentNumber, {
    message: "document_required",
    path: ["documentNumber"],
  });

export async function submitPrecheckin(db: Database, code: string, raw: z.input<typeof precheckinSchema>) {
  const input = precheckinSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [s] = await tx.select().from(stays).where(eq(stays.code, code)).for("update");
    if (!s) throw notFound();
    if (!OPEN.includes(s.status)) throw conflict("stay_closed");
    const { eta, requests, signature, accept: _a, ...guest } = input;
    await tx
      .update(hotelGuests)
      .set(Object.fromEntries(Object.entries(guest).filter(([, v]) => v !== undefined)))
      .where(and(eq(hotelGuests.id, s.guestId), eq(hotelGuests.restaurantId, s.restaurantId)));
    await tx
      .update(stays)
      .set({
        precheckinAt: new Date(),
        precheckinSignature: signature,
        eta: eta ?? s.eta,
        notes: requests ? [s.notes, `— ${requests}`].filter(Boolean).join("\n") : s.notes,
      })
      .where(eq(stays.id, s.id));
    await recordAudit(tx, {
      action: "stay.precheckin",
      actorType: "guest",
      restaurantId: s.restaurantId,
      entityType: "stay",
      entityId: s.id,
      metadata: { number: s.number },
    });
    await emit(tx, { topic: topics.restaurant(s.restaurantId), type: "notification.created" });
    return { number: s.number };
  });
}

/** Front desk: texts the guest their pre-check-in link (SMS), returns the link to copy. */
export async function sendPrecheckinLink(db: DbOrTx, ctx: RestaurantContext, stayId: string) {
  assertCan(ctx, "frontdesk.manage");
  const [row] = await db
    .select({
      code: stays.code,
      status: stays.status,
      phone: hotelGuests.phone,
      firstName: hotelGuests.firstName,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .where(and(eq(stays.id, stayId), eq(stays.restaurantId, ctx.restaurant.id)));
  if (!row) throw notFound();
  if (!OPEN.includes(row.status)) throw conflict("stay_closed");
  const link = precheckinLink(row.code);
  let sent = false;
  if (row.phone) {
    if (!/^[+0-9۰-۹ ()-]{8,24}$/.test(row.phone)) throw validation("invalid_phone");
    try {
      await sms().send(
        row.phone,
        `${ctx.restaurant.name}: ${row.firstName ? `${row.firstName}، ` : ""}برای پذیرش سریع، فرم ورود را از قبل تکمیل کنید: ${link}`,
      );
      sent = true;
    } catch (e) {
      console.error("[precheckin] sms failed", e instanceof Error ? e.message : e);
    }
  }
  await recordAudit(db, {
    action: "stay.precheckin_link_sent",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "stay",
    entityId: stayId,
    metadata: { sms: sent },
  });
  return { link, sent };
}
