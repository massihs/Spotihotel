import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { edition } from "@/config/edition";
import { tidy, type Nutrition } from "@/lib/nutrition";
import {
  ACTIVITY,
  dailyNeeds,
  GOALS,
  LIMITS,
  SEXES,
  type Activity,
  type BodyProfile,
  type Sex,
  type WeightGoal,
} from "@/lib/nutrition-goals";
import { normalizeIranMobile } from "@/lib/phone";
import { burnPasswordCheck, hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "@/server/auth/password";
import { newSessionToken, sha256 } from "@/server/auth/tokens";
import type { DbOrTx } from "@/server/db/client";
import { dinerOtps, diners, dinerSessions, orders } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { sendCode } from "@/server/infra/sms";

export const DINER_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 45 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 5 * 60_000;
const CODE_TRIES = 5;

export type Diner = typeof diners.$inferSelect;

/** A short code is only safe hashed with the server secret (6 digits are trivial to brute-force). */
const codeHash = (phone: string, code: string) =>
  createHmac("sha256", process.env.APP_SECRET ?? "dev")
    .update(`diner-otp:${phone}:${code}`)
    .digest("hex");

function parsePhone(raw: string) {
  const n = normalizeIranMobile(String(raw ?? ""));
  if (!n) throw new AppError("VALIDATION", "invalid_phone", { field: "phone" });
  return n;
}

export const emailSignupSchema = z.object({
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH, "password_too_short").max(200),
});
export const emailLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

/** Sends a 6-digit sign-in code by SMS. Rate limited per number and per address. */
export async function requestPhoneCode(db: DbOrTx, rawPhone: string, meta: { ip?: string | null } = {}) {
  const phone = parsePhone(rawPhone);
  await enforceRateLimit("dinerCodeIp", meta.ip ?? "unknown");
  await enforceRateLimit("dinerCode", phone);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // A new code replaces the previous ones.
  await db
    .update(dinerOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(dinerOtps.phone, phone), isNull(dinerOtps.consumedAt)));
  await db.insert(dinerOtps).values({
    phone,
    codeHash: codeHash(phone, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  const text =
    edition.defaultLocale === "fa"
      ? `کد ورود اسپاتیفود: ${code}\nاین کد را به کسی ندهید.`
      : `Spotifood code: ${code}`;
  await sendCode(phone, code, text);
  return { phone };
}

/**
 * Checks a code. On success: the diner with this number (created on first sign-in), or — when
 * `attachTo` is given — that signed-in diner, who now owns the verified number. Past orders
 * placed with this number in any Spotifood restaurant are attached to the account.
 */
export async function verifyPhoneCode(
  db: DbOrTx,
  input: { phone: string; code: string; attachTo?: string | null; locale?: string | null },
): Promise<Diner> {
  const phone = parsePhone(input.phone);
  const code = String(input.code).replace(/\D/g, "");
  await enforceRateLimit("dinerVerify", phone);
  const [otp] = await db
    .select()
    .from(dinerOtps)
    .where(and(eq(dinerOtps.phone, phone), isNull(dinerOtps.consumedAt), gt(dinerOtps.expiresAt, new Date())))
    .orderBy(desc(dinerOtps.createdAt))
    .limit(1);
  if (!otp || otp.attempts >= CODE_TRIES) throw new AppError("VALIDATION", "code_expired");
  const ok =
    code.length === 6 && timingSafeEqual(Buffer.from(codeHash(phone, code)), Buffer.from(otp.codeHash));
  if (!ok) {
    await db
      .update(dinerOtps)
      .set({ attempts: sql`${dinerOtps.attempts} + 1` })
      .where(eq(dinerOtps.id, otp.id));
    throw new AppError("VALIDATION", otp.attempts + 1 >= CODE_TRIES ? "code_expired" : "code_invalid");
  }
  // Single use, even under a double submit.
  const [used] = await db
    .update(dinerOtps)
    .set({ consumedAt: new Date() })
    .where(and(eq(dinerOtps.id, otp.id), isNull(dinerOtps.consumedAt)))
    .returning({ id: dinerOtps.id });
  if (!used) throw new AppError("VALIDATION", "code_expired");

  const [owner] = await db
    .select()
    .from(diners)
    .where(and(eq(diners.phone, phone), isNull(diners.deletedAt)));
  let diner: Diner;
  if (input.attachTo) {
    if (owner && owner.id !== input.attachTo) throw new AppError("CONFLICT", "phone_taken");
    const [d] = await db
      .update(diners)
      .set({ phone, phoneVerifiedAt: new Date() })
      .where(and(eq(diners.id, input.attachTo), isNull(diners.deletedAt)))
      .returning();
    if (!d) throw new AppError("UNAUTHENTICATED");
    diner = d;
  } else if (owner) {
    const [d] = await db
      .update(diners)
      .set({ phoneVerifiedAt: owner.phoneVerifiedAt ?? new Date(), lastLoginAt: new Date() })
      .where(eq(diners.id, owner.id))
      .returning();
    diner = d!;
  } else {
    const [d] = await db
      .insert(diners)
      .values({
        phone,
        phoneVerifiedAt: new Date(),
        locale: input.locale ?? null,
        timezone: edition.restaurantDefaults.timezone,
        lastLoginAt: new Date(),
      })
      .returning();
    diner = d!;
  }
  await claimOrders(db, diner);
  return diner;
}

export async function signupWithEmail(
  db: DbOrTx,
  raw: z.input<typeof emailSignupSchema>,
  meta: { ip?: string | null; locale?: string | null } = {},
): Promise<Diner> {
  const input = emailSignupSchema.parse(raw);
  await enforceRateLimit("signup", `diner:${meta.ip ?? "unknown"}`);
  const [taken] = await db
    .select({ id: diners.id })
    .from(diners)
    .where(and(eq(diners.email, input.email), isNull(diners.deletedAt)));
  if (taken) throw new AppError("CONFLICT", "email_taken");
  const [d] = await db
    .insert(diners)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name || null,
      locale: meta.locale ?? null,
      timezone: edition.restaurantDefaults.timezone,
      lastLoginAt: new Date(),
    })
    .returning();
  return d!;
}

export async function loginWithEmail(
  db: DbOrTx,
  raw: z.input<typeof emailLoginSchema>,
  meta: { ip?: string | null } = {},
): Promise<Diner | null> {
  const input = emailLoginSchema.parse(raw);
  await enforceRateLimit("login", `diner:${meta.ip ?? "unknown"}:${input.email}`);
  const [d] = await db
    .select()
    .from(diners)
    .where(and(eq(diners.email, input.email), isNull(diners.deletedAt)));
  if (!d?.passwordHash) {
    await burnPasswordCheck(input.password);
    return null;
  }
  if (!(await verifyPassword(d.passwordHash, input.password))) return null;
  await db.update(diners).set({ lastLoginAt: new Date() }).where(eq(diners.id, d.id));
  return d;
}

/**
 * Attaches the orders placed with the diner's verified number (any restaurant) that belong
 * to nobody yet — except those before a "clear my history".
 */
export async function claimOrders(
  db: DbOrTx,
  diner: Pick<Diner, "id" | "phone" | "phoneVerifiedAt" | "historySince">,
) {
  if (!diner.phone || !diner.phoneVerifiedAt) return 0;
  const rows = await db
    .update(orders)
    .set({ dinerId: diner.id })
    .where(
      and(
        eq(orders.customerPhone, diner.phone),
        isNull(orders.dinerId),
        diner.historySince ? gte(orders.placedAt, diner.historySince) : undefined,
      ),
    )
    .returning({ id: orders.id });
  return rows.length;
}

// ── Sessions ──────────────────────────────────────────────────────────────────────────────

export async function createDinerSession(db: DbOrTx, dinerId: string) {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + DINER_SESSION_TTL_MS);
  await db.insert(dinerSessions).values({ dinerId, tokenHash, expiresAt });
  // Housekeeping: expired sessions of this diner.
  await db
    .delete(dinerSessions)
    .where(and(eq(dinerSessions.dinerId, dinerId), lt(dinerSessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export async function validateDinerSession(db: DbOrTx, token: string | undefined | null) {
  if (!token || token.length > 128) return null;
  const now = new Date();
  const [row] = await db
    .select({ session: dinerSessions, diner: diners })
    .from(dinerSessions)
    .innerJoin(diners, eq(diners.id, dinerSessions.dinerId))
    .where(
      and(
        eq(dinerSessions.tokenHash, sha256(token)),
        gt(dinerSessions.expiresAt, now),
        isNull(diners.deletedAt),
      ),
    );
  if (!row) return null;
  if (row.session.expiresAt.getTime() - now.getTime() < RENEW_THRESHOLD_MS)
    await db
      .update(dinerSessions)
      .set({ expiresAt: new Date(now.getTime() + DINER_SESSION_TTL_MS) })
      .where(eq(dinerSessions.id, row.session.id));
  return { sessionId: row.session.id, diner: row.diner };
}

export async function revokeDinerSession(db: DbOrTx, token: string | undefined | null) {
  if (token) await db.delete(dinerSessions).where(eq(dinerSessions.tokenHash, sha256(token)));
}

// ── Profile, goals, privacy ─────────────────────────────────────────────────────────────

const goalNumber = z.coerce.number().min(0).max(100_000).optional();
export const goalsSchema = z.object({
  kcal: goalNumber,
  proteinG: goalNumber,
  carbsG: goalNumber,
  sugarG: goalNumber,
  fatG: goalNumber,
  fiberG: goalNumber,
  saltG: goalNumber,
});

export async function updateDinerProfile(
  db: DbOrTx,
  dinerId: string,
  input: { name?: string | null; goals?: Nutrition | null },
) {
  const patch: Partial<typeof diners.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name?.trim().slice(0, 80) || null;
  if (input.goals !== undefined) {
    const g = input.goals ? tidy(goalsSchema.parse(input.goals)) : null;
    if (g && Object.keys(g).length) {
      patch.goals = g;
      patch.goalsManual = true;
    } else {
      // Emptied: back to the goals calculated from the body profile (or the reference intakes).
      const [d] = await db.select().from(diners).where(eq(diners.id, dinerId));
      const body = d ? bodyProfileOf(d) : null;
      patch.goals = body ? dailyNeeds(body).goals : null;
      patch.goalsManual = false;
    }
  }
  await db.update(diners).set(patch).where(eq(diners.id, dinerId));
}

export const bodySchema = z.object({
  sex: z.enum(SEXES),
  age: z.coerce.number().int().min(LIMITS.age[0]).max(LIMITS.age[1]),
  weightKg: z.coerce.number().min(LIMITS.weightKg[0]).max(LIMITS.weightKg[1]),
  heightCm: z.coerce.number().min(LIMITS.heightCm[0]).max(LIMITS.heightCm[1]),
  activity: z.enum(Object.keys(ACTIVITY) as [Activity, ...Activity[]]).default("light"),
  goal: z.enum(Object.keys(GOALS) as [WeightGoal, ...WeightGoal[]]).default("maintain"),
});

/** The diner's body profile, when complete (age from the birth year). */
export function bodyProfileOf(d: Diner): BodyProfile | null {
  if (!d.sex || !d.birthYear || !d.weightKg || !d.heightCm) return null;
  return {
    sex: d.sex as Sex,
    age: new Date().getFullYear() - d.birthYear,
    weightKg: d.weightKg,
    heightCm: d.heightCm,
    activity: (d.activity as Activity) ?? "light",
    goal: (d.weightGoal as WeightGoal) ?? "maintain",
  };
}

/**
 * The question asked at sign-up: count calories or not, and if so the body profile that gives
 * the daily needs. The calculated goals replace the previous ones unless the diner typed theirs.
 */
export async function setCalorieTracking(
  db: DbOrTx,
  dinerId: string,
  input: { track: boolean; body?: z.input<typeof bodySchema> },
) {
  if (!input.track) {
    await db
      .update(diners)
      .set({ trackCalories: false, updatedAt: new Date() })
      .where(eq(diners.id, dinerId));
    return null;
  }
  const b = bodySchema.parse(input.body ?? {});
  const [d] = await db.select({ goalsManual: diners.goalsManual }).from(diners).where(eq(diners.id, dinerId));
  const needs = dailyNeeds(b);
  await db
    .update(diners)
    .set({
      trackCalories: true,
      sex: b.sex,
      birthYear: new Date().getFullYear() - b.age,
      weightKg: b.weightKg,
      heightCm: b.heightCm,
      activity: b.activity,
      weightGoal: b.goal,
      ...(d?.goalsManual ? {} : { goals: needs.goals }),
      updatedAt: new Date(),
    })
    .where(eq(diners.id, dinerId));
  return needs;
}

/** Detaches every order from the account; they are not attached again by the phone number. */
export async function clearDinerHistory(db: DbOrTx, dinerId: string) {
  await db.update(orders).set({ dinerId: null }).where(eq(orders.dinerId, dinerId));
  await db
    .update(diners)
    .set({ historySince: new Date(), updatedAt: new Date() })
    .where(eq(diners.id, dinerId));
}

/** Deletes the account: orders stay with the restaurants (their records) but lose the link. */
export async function deleteDiner(db: DbOrTx, dinerId: string) {
  await db.update(orders).set({ dinerId: null }).where(eq(orders.dinerId, dinerId));
  await db.delete(diners).where(eq(diners.id, dinerId));
}

/**
 * The account an order belongs to: the signed-in diner, else the diner whose verified number
 * was given with the order (the restaurant's own records are not shared — only the link).
 */
export async function dinerForOrder(
  db: DbOrTx,
  input: { dinerId?: string | null; phone?: string | null },
): Promise<string | null> {
  if (input.dinerId) {
    const [d] = await db
      .select({ id: diners.id })
      .from(diners)
      .where(and(eq(diners.id, input.dinerId), isNull(diners.deletedAt)));
    if (d) return d.id;
  }
  const phone = input.phone ? normalizeIranMobile(input.phone) : null;
  if (!phone) return null;
  const [d] = await db
    .select({ id: diners.id })
    .from(diners)
    .where(
      and(eq(diners.phone, phone), isNull(diners.deletedAt), sql`${diners.phoneVerifiedAt} is not null`),
    );
  return d?.id ?? null;
}

/** Signing in at the table: this seat's orders (still unattached) join the account. */
export async function claimSeatOrders(db: DbOrTx, dinerId: string, participantId: string) {
  const rows = await db
    .update(orders)
    .set({ dinerId })
    .where(and(eq(orders.participantId, participantId), isNull(orders.dinerId)))
    .returning({ id: orders.id });
  return rows.length;
}
