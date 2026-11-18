import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/server/db/client";
import { pmsSettings, roomTypes } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { getPmsSettings } from "./setup";
import { getFeatures, saveFeatures } from "./features";

/**
 * سپر ریال (Rial shield): room rates set in dollars, euros or gold coins, kept in rials by the
 * hotel's own rates. Every business day the rial base rate of each indexed room type moves toward
 * its value (at most `maxDailyChangeBps` a day, rounded), and nights sold before a fall of the
 * rial are listed.
 */

type Currency = { code: string; rateCents: number };

/** The rial price of an indexed room type: foreign amount × rate, rounded to `roundCents`. */
export function indexedTarget(indexAmountCents: number, rateCents: number, roundCents: number) {
  const raw = (indexAmountCents / 100) * rateCents;
  return Math.max(roundCents, Math.round(raw / roundCents) * roundCents);
}

/** One day's move from the current price toward the target, capped, rounded. */
export function smoothedRate(current: number, target: number, maxDailyChangeBps: number, roundCents: number) {
  if (!current || maxDailyChangeBps <= 0) return target;
  const cap = (current * maxDailyChangeBps) / 10_000;
  const next = Math.abs(target - current) <= cap ? target : current + Math.sign(target - current) * cap;
  return Math.max(roundCents, Math.round(next / roundCents) * roundCents);
}

export type ShieldRow = {
  id: string;
  code: string;
  name: string;
  indexCurrency: string | null;
  indexAmountCents: number | null;
  baseRateCents: number;
  targetCents: number | null;
};

/** Brings the indexed room types toward their rial value (once a business day unless forced). */
export async function applyRialShield(db: DbOrTx, ctx: RestaurantContext, opts: { force?: boolean } = {}) {
  const rid = ctx.restaurant.id;
  const [settings, features] = await Promise.all([
    getPmsSettings(db, rid, ctx.restaurant.timezone),
    getFeatures(db, rid),
  ]);
  const today = settings.businessDate;
  if (!opts.force && features.shield.lastRun === today) return { changed: 0 };
  const rates = new Map((settings.currencies as Currency[]).map((c) => [c.code, c.rateCents]));
  const types = await db
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.restaurantId, rid), isNotNull(roomTypes.indexCurrency)));
  let changed = 0;
  for (const t of types) {
    const rate = rates.get(t.indexCurrency!);
    if (!rate || !t.indexAmountCents) continue;
    const target = indexedTarget(t.indexAmountCents, rate, features.shield.roundCents);
    const next = smoothedRate(
      t.baseRateCents,
      target,
      features.shield.maxDailyChangeBps,
      features.shield.roundCents,
    );
    if (next === t.baseRateCents) continue;
    await db.update(roomTypes).set({ baseRateCents: next }).where(eq(roomTypes.id, t.id));
    await recordAudit(db, {
      action: "pms.shield_rate",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "room_type",
      entityId: t.id,
      metadata: { from: t.baseRateCents, to: next, target, currency: t.indexCurrency, rate },
    });
    changed++;
  }
  await saveFeatures(db, rid, { shield: { ...features.shield, lastRun: today } });
  return { changed };
}

export async function shieldView(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const [settings, features, types] = await Promise.all([
    getPmsSettings(db, rid, ctx.restaurant.timezone),
    getFeatures(db, rid),
    db
      .select({
        id: roomTypes.id,
        code: roomTypes.code,
        name: roomTypes.name,
        indexCurrency: roomTypes.indexCurrency,
        indexAmountCents: roomTypes.indexAmountCents,
        baseRateCents: roomTypes.baseRateCents,
      })
      .from(roomTypes)
      .where(eq(roomTypes.restaurantId, rid))
      .orderBy(asc(roomTypes.sortOrder), asc(roomTypes.baseRateCents)),
  ]);
  const rates = new Map((settings.currencies as Currency[]).map((c) => [c.code, c.rateCents]));
  const rows: ShieldRow[] = types.map((t) => {
    const rate = t.indexCurrency ? rates.get(t.indexCurrency) : undefined;
    return {
      ...t,
      targetCents:
        rate && t.indexAmountCents
          ? indexedTarget(t.indexAmountCents, rate, features.shield.roundCents)
          : null,
    };
  });
  // Future nights of indexed types sold below 85% of today's rial value.
  const indexed = rows.filter((r) => r.targetCents);
  let underpriced: { stayId: string; number: number; guest: string; nights: number; lossCents: number }[] =
    [];
  if (indexed.length) {
    const targets = sql.join(
      indexed.map((r) => sql`(${r.id}::uuid, ${r.targetCents}::bigint)`),
      sql`, `,
    );
    const res = await db.execute<{
      stay_id: string;
      number: number;
      guest: string;
      nights: number;
      loss: number;
    }>(sql`
      with t(type_id, target) as (values ${targets})
      select s.id as stay_id, s.number, g.last_name || ' ' || coalesce(g.first_name, '') as guest,
             count(*)::int as nights, sum(t.target - n.rate_cents) as loss
        from stay_nights n
        join stays s on s.id = n.stay_id
        join hotel_guests g on g.id = s.guest_id
        join t on t.type_id = s.room_type_id
       where n.restaurant_id = ${rid} and n.day >= ${settings.businessDate} and n.posted_at is null
         and s.status in ('tentative', 'confirmed') and n.rate_cents < t.target * 0.85
       group by s.id, s.number, g.last_name, g.first_name
       order by sum(t.target - n.rate_cents) desc
       limit 50`);
    underpriced = res.rows.map((r) => ({
      stayId: r.stay_id,
      number: Number(r.number),
      guest: r.guest.trim(),
      nights: Number(r.nights),
      lossCents: Number(r.loss),
    }));
  }
  return {
    currencies: settings.currencies as Currency[],
    shield: features.shield,
    today: settings.businessDate,
    rows,
    underpriced,
  };
}

export const shieldSchema = z.object({
  currencies: z
    .array(
      z.object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/),
        rateCents: z.coerce.number().int().min(1),
      }),
    )
    .max(12),
  maxDailyChangeBps: z.coerce.number().int().min(0).max(10_000),
  roundCents: z.coerce.number().int().min(1),
  types: z.array(
    z.object({
      id: z.string().uuid(),
      indexCurrency: z.string().trim().toUpperCase().max(8).nullable(),
      indexAmountCents: z.coerce.number().int().min(0).nullable(),
    }),
  ),
});

/** Saves the rates, the indexing of each room type, and brings the rates in line right away. */
export async function saveShield(db: DbOrTx, ctx: RestaurantContext, input: z.input<typeof shieldSchema>) {
  assertCan(ctx, "restaurant.manage");
  const v = shieldSchema.parse(input);
  const rid = ctx.restaurant.id;
  await db.update(pmsSettings).set({ currencies: v.currencies }).where(eq(pmsSettings.restaurantId, rid));
  const f = await getFeatures(db, rid);
  await saveFeatures(db, rid, {
    shield: { ...f.shield, maxDailyChangeBps: v.maxDailyChangeBps, roundCents: v.roundCents },
  });
  for (const t of v.types)
    await db
      .update(roomTypes)
      .set({
        indexCurrency: t.indexCurrency && t.indexAmountCents ? t.indexCurrency : null,
        indexAmountCents: t.indexCurrency && t.indexAmountCents ? t.indexAmountCents : null,
      })
      .where(and(eq(roomTypes.id, t.id), eq(roomTypes.restaurantId, rid)));
  await recordAudit(db, { action: "pms.shield_saved", actorUserId: ctx.user.id, restaurantId: rid });
  return applyRialShield(db, ctx, { force: true });
}
