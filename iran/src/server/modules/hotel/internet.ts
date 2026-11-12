import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, internetAccounts, internetProfiles, stays } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { mainFolioOf, postLine } from "@/server/modules/pms/folios";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { wallTime } from "@/lib/period";
import { servicesSettings } from "./services";

/**
 * Guest internet (اینترنت): plans (پروفایل: speed, data, length, devices, price) and the guests'
 * logins (کاربران اینترنت), created by hand or at check-in, charged to the bill when the plan has a
 * price, disabled at check-out. The hotel's hotspot reads them (or the desk copies them over).
 */

export const internetProfileSchema = z.object({
  name: z.string().trim().min(1).max(60),
  downKbps: z.coerce.number().int().min(0).max(10_000_000).default(0),
  upKbps: z.coerce.number().int().min(0).max(10_000_000).default(0),
  quotaMb: z.coerce.number().int().min(1).max(10_000_000).nullish(),
  days: z.coerce.number().int().min(1).max(365).nullish(),
  devices: z.coerce.number().int().min(1).max(20).default(2),
  priceCents: z.coerce.number().int().min(0).max(1_000_000_000_000).default(0),
  active: z.coerce.boolean().default(true),
});

export async function listInternetProfiles(db: DbOrTx, restaurantId: string) {
  return db
    .select()
    .from(internetProfiles)
    .where(and(eq(internetProfiles.restaurantId, restaurantId), isNull(internetProfiles.deletedAt)))
    .orderBy(asc(internetProfiles.priceCents), asc(internetProfiles.name));
}

export async function saveInternetProfile(
  db: Database,
  ctx: RestaurantContext,
  id: string | null,
  raw: z.input<typeof internetProfileSchema>,
) {
  assertCan(ctx, "rates.manage");
  const v = internetProfileSchema.parse(raw);
  const values = { ...v, quotaMb: v.quotaMb ?? null, days: v.days ?? null };
  if (!id) {
    const [row] = await db
      .insert(internetProfiles)
      .values({ ...values, restaurantId: ctx.restaurant.id })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(internetProfiles)
    .set(values)
    .where(and(eq(internetProfiles.id, id), eq(internetProfiles.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!row) throw notFound();
  return row;
}

export async function deleteInternetProfile(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "rates.manage");
  await db
    .update(internetProfiles)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(internetProfiles.id, id), eq(internetProfiles.restaurantId, ctx.restaurant.id)));
}

const ALPHA = "abcdefghjkmnpqrstuvwxyz";
const randomFrom = (chars: string, n: number) =>
  Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
const digits = (n: number) => randomFrom("0123456789", n);

/** Accounts past their end are marked expired (on every read: no scheduled job needed). */
async function expire(db: DbOrTx, restaurantId: string) {
  await db
    .update(internetAccounts)
    .set({ status: "expired" })
    .where(
      and(
        eq(internetAccounts.restaurantId, restaurantId),
        eq(internetAccounts.status, "active"),
        lt(internetAccounts.validUntil, new Date()),
      ),
    );
}

export async function listInternetAccounts(db: DbOrTx, ctx: RestaurantContext, q?: string, status?: string) {
  assertCan(ctx, "frontdesk.view");
  await expire(db, ctx.restaurant.id);
  const rows = await db
    .select({
      id: internetAccounts.id,
      username: internetAccounts.username,
      password: internetAccounts.password,
      status: internetAccounts.status,
      validUntil: internetAccounts.validUntil,
      usedMb: internetAccounts.usedMb,
      guestName: internetAccounts.guestName,
      room: diningTables.label,
      stayId: internetAccounts.stayId,
      profile: internetProfiles.name,
      quotaMb: internetProfiles.quotaMb,
      createdAt: internetAccounts.createdAt,
    })
    .from(internetAccounts)
    .leftJoin(diningTables, eq(diningTables.id, internetAccounts.roomId))
    .leftJoin(internetProfiles, eq(internetProfiles.id, internetAccounts.profileId))
    .where(
      and(
        eq(internetAccounts.restaurantId, ctx.restaurant.id),
        status ? eq(internetAccounts.status, status) : undefined,
        q
          ? sql`(${internetAccounts.username} ilike ${`%${q}%`} or ${internetAccounts.guestName} ilike ${`%${q}%`} or ${diningTables.label} ilike ${`%${q}%`})`
          : undefined,
      ),
    )
    .orderBy(desc(internetAccounts.createdAt))
    .limit(500);
  return rows.map((r) => ({
    ...r,
    validUntil: r.validUntil?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export const internetAccountSchema = z.object({
  profileId: z.uuid(),
  roomId: z.uuid().nullish(),
  guestName: z.string().trim().max(120).optional(),
  username: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9._-]*$/)
    .optional(),
  password: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
  /** Charge the plan's price to the stay's bill. */
  charge: z.coerce.boolean().default(true),
});

/** The end of a login: the plan's length, else the stay's check-out (its day at check-out time). */
function endOf(days: number | null | undefined, departure: string | null, checkOutTime: string, tz: string) {
  if (days) return new Date(Date.now() + days * 86_400_000);
  if (departure) return wallTime(departure, checkOutTime, tz);
  return null;
}

async function createAccount(
  tx: DbOrTx,
  ctx: RestaurantContext,
  input: z.output<typeof internetAccountSchema>,
  by: { userId: string | null },
) {
  const rid = ctx.restaurant.id;
  const [profile] = await tx
    .select()
    .from(internetProfiles)
    .where(
      and(
        eq(internetProfiles.id, input.profileId),
        eq(internetProfiles.restaurantId, rid),
        isNull(internetProfiles.deletedAt),
      ),
    );
  if (!profile) throw notFound("profile_not_found");
  const conf = (await servicesSettings(tx, rid, ctx.restaurant.timezone)).internet;
  const pms = await getPmsSettings(tx, rid, ctx.restaurant.timezone);
  let room: { id: string; label: string } | null = null;
  let stay: { id: string; departure: string; guest: string } | null = null;
  if (input.roomId) {
    const [r] = await tx
      .select({ id: diningTables.id, label: diningTables.label })
      .from(diningTables)
      .where(and(eq(diningTables.id, input.roomId), eq(diningTables.restaurantId, rid)));
    if (!r) throw notFound();
    room = r;
    const [s] = await tx
      .select({
        id: stays.id,
        departure: stays.departure,
        guest: sql<string>`trim(concat_ws(' ', ${hotelGuests.firstName}, ${hotelGuests.lastName}))`,
      })
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .where(and(eq(stays.restaurantId, rid), eq(stays.roomId, r.id), eq(stays.status, "in_house")));
    stay = s ?? null;
  }
  // A username: the one typed, else the room's number (with a suffix if taken), else random.
  const taken = async (u: string) =>
    (
      await tx
        .select({ id: internetAccounts.id })
        .from(internetAccounts)
        .where(and(eq(internetAccounts.restaurantId, rid), eq(internetAccounts.username, u)))
    ).length > 0;
  let username = input.username || "";
  if (username) {
    if (await taken(username)) throw conflict("username_taken");
  } else {
    const base =
      conf.usernameMode === "room" && room
        ? `r${room.label.replace(/[^A-Za-z0-9]/g, "")}`
        : randomFrom(ALPHA, 5);
    username = base;
    for (let i = 2; await taken(username); i++) username = `${base}-${i}`;
  }
  const password = input.password || digits(conf.passwordLength);
  const [acc] = await tx
    .insert(internetAccounts)
    .values({
      restaurantId: rid,
      username,
      password,
      profileId: profile.id,
      stayId: stay?.id ?? null,
      roomId: room?.id ?? null,
      guestName: input.guestName || stay?.guest || null,
      status: "active",
      validUntil: endOf(profile.days, stay?.departure ?? null, pms.checkOutTime, ctx.restaurant.timezone),
      note: input.note || null,
      createdByUserId: by.userId,
    })
    .returning();
  if (input.charge && profile.priceCents > 0 && stay) {
    const folio = await mainFolioOf(tx, rid, stay.id);
    await postLine(tx, rid, ctx.restaurant.timezone, {
      folioId: folio.id,
      kind: "charge",
      department: "internet",
      description: profile.name,
      unitCents: profile.priceCents,
      amountCents: profile.priceCents,
      taxRateBps: pms.serviceTaxBps,
      sourceType: "internet",
      sourceId: acc!.id,
      userId: by.userId,
    });
  }
  await recordAudit(tx, {
    action: "internet.account",
    actorUserId: by.userId,
    restaurantId: rid,
    entityType: "internet_account",
    entityId: acc!.id,
    metadata: { username, profile: profile.name },
  });
  return acc!;
}

export async function createInternetAccount(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof internetAccountSchema>,
) {
  assertCan(ctx, "folio.post");
  const input = internetAccountSchema.parse(raw);
  return db.transaction((tx) => createAccount(tx, ctx, input, { userId: ctx.user.id }));
}

export async function setInternetAccountStatus(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  raw: string,
) {
  assertCan(ctx, "folio.post");
  const status = z.enum(["active", "disabled"]).parse(raw);
  const [row] = await db
    .update(internetAccounts)
    .set({ status })
    .where(and(eq(internetAccounts.id, id), eq(internetAccounts.restaurantId, ctx.restaurant.id)))
    .returning({ id: internetAccounts.id });
  if (!row) throw notFound();
}

/** A new password, or a few more days of access. */
export async function updateInternetAccount(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  op: { resetPassword?: boolean; extendDays?: number },
) {
  assertCan(ctx, "folio.post");
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).internet;
  const [acc] = await db
    .select()
    .from(internetAccounts)
    .where(and(eq(internetAccounts.id, id), eq(internetAccounts.restaurantId, ctx.restaurant.id)));
  if (!acc) throw notFound();
  const extend = z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .parse(op.extendDays ?? 0);
  const from = acc.validUntil && acc.validUntil > new Date() ? acc.validUntil : new Date();
  await db
    .update(internetAccounts)
    .set({
      ...(op.resetPassword ? { password: digits(conf.passwordLength) } : {}),
      ...(extend ? { validUntil: new Date(from.getTime() + extend * 86_400_000), status: "active" } : {}),
    })
    .where(eq(internetAccounts.id, acc.id));
}

export async function deleteInternetAccount(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "folio.adjust");
  await db
    .delete(internetAccounts)
    .where(and(eq(internetAccounts.id, id), eq(internetAccounts.restaurantId, ctx.restaurant.id)));
}

/** At check-in: a login on the default plan, when the hotel asks for it (best effort). */
export async function internetOnCheckIn(
  db: Database,
  ctx: RestaurantContext,
  stayId: string,
  roomId: string,
) {
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).internet;
  if (!conf.autoCreate || !conf.profileId) return;
  const [existing] = await db
    .select({ id: internetAccounts.id })
    .from(internetAccounts)
    .where(and(eq(internetAccounts.stayId, stayId), eq(internetAccounts.status, "active")));
  if (existing) return;
  await db.transaction((tx) =>
    createAccount(tx, ctx, internetAccountSchema.parse({ profileId: conf.profileId, roomId, charge: true }), {
      userId: ctx.user.id,
    }),
  );
}

/** At check-out: the stay's logins stop working. */
export async function internetOnCheckOut(db: Database, ctx: RestaurantContext, stayId: string) {
  const conf = (await servicesSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).internet;
  if (!conf.disableOnCheckout) return;
  await db
    .update(internetAccounts)
    .set({ status: "disabled" })
    .where(
      and(
        eq(internetAccounts.restaurantId, ctx.restaurant.id),
        eq(internetAccounts.stayId, stayId),
        eq(internetAccounts.status, "active"),
      ),
    );
}

/** The guest's own login, for the room portal. */
export async function internetOfStay(db: DbOrTx, restaurantId: string, stayId: string) {
  const [acc] = await db
    .select({ username: internetAccounts.username, password: internetAccounts.password })
    .from(internetAccounts)
    .where(
      and(
        eq(internetAccounts.restaurantId, restaurantId),
        eq(internetAccounts.stayId, stayId),
        inArray(internetAccounts.status, ["active"]),
      ),
    )
    .orderBy(desc(internetAccounts.createdAt))
    .limit(1);
  return acc ?? null;
}
