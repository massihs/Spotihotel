import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { hotelAccounts, hotelGuests, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isDay } from "./calc";
import { isIranNationalCode } from "@/lib/iran-id";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const DOCUMENT_TYPES = ["passport", "id_card", "driving_licence"] as const;

export const guestFields = z.object({
  firstName: z.string().trim().max(80).default(""),
  fatherName: optText(80),
  lastName: z.string().trim().min(1).max(80),
  email: z
    .string()
    .trim()
    .max(320)
    .transform((v) => v.toLowerCase() || null)
    .pipe(z.email().nullable())
    .nullable()
    .optional(),
  phone: optText(24),
  nationality: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase() || null)
    .pipe(
      z
        .string()
        .regex(/^[A-Z]{2}$/)
        .nullable(),
    )
    .nullable()
    .optional(),
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
  documentNumber: optText(40),
  birthDate: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v == null || isDay(v), "invalid_date")
    .nullable()
    .optional(),
  address: optText(500),
  company: optText(120),
  vip: z.coerce.boolean().default(false),
  preferences: optText(1000),
  notes: optText(2000),
  blacklisted: z.coerce.boolean().default(false),
});

type GuestLike = {
  documentType?: string | null;
  documentNumber?: string | null;
  nationality?: string | null;
};
/** An Iranian national ID card carries a national code with a check digit. */
export const nationalCodeOk = (v: GuestLike) =>
  v.documentType !== "id_card" ||
  !v.documentNumber ||
  (!!v.nationality && v.nationality !== "IR") ||
  isIranNationalCode(v.documentNumber);
export const nationalCodeRule = { message: "invalid_national_code", path: ["documentNumber"] };

export const guestSchema = guestFields.refine(nationalCodeOk, nationalCodeRule);
export type GuestInput = z.input<typeof guestSchema>;

export async function createGuest(db: DbOrTx, ctx: RestaurantContext, raw: GuestInput) {
  assertCan(ctx, "frontdesk.manage");
  const input = guestSchema.parse(raw);
  const [row] = await db
    .insert(hotelGuests)
    .values({ ...input, restaurantId: ctx.restaurant.id })
    .returning();
  return row!;
}

export async function updateGuest(db: Database, ctx: RestaurantContext, id: string, raw: GuestInput) {
  assertCan(ctx, "frontdesk.manage");
  const input = guestSchema.parse(raw);
  const [row] = await db
    .update(hotelGuests)
    .set(input)
    .where(and(eq(hotelGuests.id, id), eq(hotelGuests.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!row) throw notFound();
  if (input.blacklisted)
    await recordAudit(db, {
      action: "pms.guest_blacklisted",
      actorUserId: ctx.user.id,
      restaurantId: ctx.restaurant.id,
      entityType: "hotel_guest",
      entityId: id,
    });
  return row;
}

export async function getGuest(db: DbOrTx, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "frontdesk.view");
  const [row] = await db
    .select()
    .from(hotelGuests)
    .where(and(eq(hotelGuests.id, id), eq(hotelGuests.restaurantId, ctx.restaurant.id)));
  if (!row) throw notFound();
  const history = await db
    .select({
      id: stays.id,
      number: stays.number,
      arrival: stays.arrival,
      departure: stays.departure,
      status: stays.status,
      totalCents: stays.totalCents,
    })
    .from(stays)
    .where(and(eq(stays.restaurantId, ctx.restaurant.id), eq(stays.guestId, id)))
    .orderBy(desc(stays.arrival))
    .limit(50);
  return { ...row, history };
}

/** Search by name, phone, email or document number (front desk lookup). */
export async function searchGuests(db: DbOrTx, ctx: RestaurantContext, q: string, limit = 30) {
  assertCan(ctx, "frontdesk.view");
  const term = q.trim().slice(0, 80);
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db
    .select({
      id: hotelGuests.id,
      firstName: hotelGuests.firstName,
      lastName: hotelGuests.lastName,
      phone: hotelGuests.phone,
      email: hotelGuests.email,
      nationality: hotelGuests.nationality,
      vip: hotelGuests.vip,
      blacklisted: hotelGuests.blacklisted,
      stays: sql<number>`(select count(*)::int from ${stays} s where s.guest_id = ${hotelGuests.id} and s.status in ('in_house','checked_out'))`,
    })
    .from(hotelGuests)
    .where(
      and(
        eq(hotelGuests.restaurantId, ctx.restaurant.id),
        term
          ? or(
              ilike(hotelGuests.lastName, like),
              ilike(hotelGuests.firstName, like),
              ilike(hotelGuests.phone, like),
              ilike(hotelGuests.email, like),
              ilike(hotelGuests.documentNumber, like),
            )
          : undefined,
      ),
    )
    .orderBy(term ? asc(hotelGuests.lastName) : desc(hotelGuests.createdAt))
    .limit(Math.min(limit, 200));
}

export const guestName = (g: { firstName: string; lastName: string }) =>
  [g.firstName, g.lastName].filter(Boolean).join(" ");

// ─── Company / agency accounts (city ledger) ─────────────────────────────────

export const ACCOUNT_KINDS = ["company", "agency", "ota"] as const;

export const accountSchema = z.object({
  kind: z.enum(ACCOUNT_KINDS).default("company"),
  name: z.string().trim().min(1).max(160),
  taxId: optText(40),
  email: optText(320),
  phone: optText(24),
  address: optText(500),
  creditLimitCents: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  commissionBps: z.coerce.number().int().min(0).max(5000).default(0),
  active: z.coerce.boolean().default(true),
});

export async function listAccounts(db: DbOrTx, restaurantId: string) {
  return db
    .select()
    .from(hotelAccounts)
    .where(eq(hotelAccounts.restaurantId, restaurantId))
    .orderBy(desc(hotelAccounts.active), asc(hotelAccounts.name));
}

export async function saveAccount(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof accountSchema>,
) {
  assertCan(ctx, "accounting.manage");
  const input = accountSchema.parse(raw);
  if (!id) {
    const [row] = await db
      .insert(hotelAccounts)
      .values({ ...input, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(hotelAccounts)
    .set(input)
    .where(and(eq(hotelAccounts.id, id), eq(hotelAccounts.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!row) throw notFound();
  return row;
}
