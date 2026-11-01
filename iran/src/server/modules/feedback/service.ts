import { randomBytes, randomInt } from "node:crypto";
import { notifyTeam } from "@/server/modules/team/sections";
import { and, avg, count, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  coupons,
  feedbackRequests,
  orders,
  restaurantSettings,
  restaurants,
  reviews,
  type WheelPrize,
} from "@/server/db/schema";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { recordAudit } from "@/server/audit";
import { env } from "@/server/env";
import { conflict, notFound } from "@/server/errors";
import { sms } from "@/server/infra/sms";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/**
 * Satisfaction (Z-5). When an order with a phone number is served, a survey is scheduled
 * (feedbackDelayMinutes later); a sweep texts the link /f/{token}. A rating of 2 or less
 * alerts the team at once; with the wheel on, the guest then spins for a single-use coupon.
 */
export const UNHAPPY_MAX = 2;
const COUPON_DAYS = 30;

/** Called when an order is served (inside its transaction). One survey per order. */
export async function scheduleFeedback(
  tx: DbOrTx,
  order: { id: string; restaurantId: string; customerPhone: string | null },
  now = new Date(),
) {
  if (!order.customerPhone) return;
  const [s] = await tx
    .select({ on: restaurantSettings.feedbackSmsEnabled, delay: restaurantSettings.feedbackDelayMinutes })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, order.restaurantId));
  if (!s?.on) return;
  await tx
    .insert(feedbackRequests)
    .values({
      restaurantId: order.restaurantId,
      orderId: order.id,
      token: randomBytes(16).toString("base64url").slice(0, 22),
      phone: order.customerPhone,
      dueAt: new Date(now.getTime() + Math.max(0, s.delay) * 60_000),
    })
    .onConflictDoNothing();
}

async function smsText(locale: string, values: Record<string, string>) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  return createTranslator({ locale: l, messages, namespace: "sms.feedback" })("ask", values);
}

/** Texts the surveys that are due (all restaurants, or one). Each is claimed before sending. */
export async function sendDueFeedback(db: Database, restaurantId?: string, now = new Date()) {
  const due = await db
    .update(feedbackRequests)
    .set({ sentAt: now })
    .where(
      and(
        isNull(feedbackRequests.sentAt),
        lte(feedbackRequests.dueAt, now),
        // Not older than a day: a backlog after downtime is not worth texting.
        gte(feedbackRequests.dueAt, new Date(now.getTime() - 86_400_000)),
        restaurantId ? eq(feedbackRequests.restaurantId, restaurantId) : undefined,
      ),
    )
    .returning({
      token: feedbackRequests.token,
      phone: feedbackRequests.phone,
      restaurantId: feedbackRequests.restaurantId,
    });
  for (const f of due) {
    const [r] = await db
      .select({ name: restaurants.name, locale: restaurants.defaultLocale })
      .from(restaurants)
      .where(eq(restaurants.id, f.restaurantId));
    if (!r) continue;
    const text = await smsText(r.locale, { restaurant: r.name, link: `${env().APP_URL}/f/${f.token}` });
    await sms()
      .send(f.phone, text)
      .catch((e) => console.error("[feedback] sms failed", e instanceof Error ? e.message : e));
  }
  return due.length;
}

async function byToken(db: DbOrTx, token: string) {
  if (!/^[A-Za-z0-9_-]{10,32}$/.test(token)) return null;
  const [row] = await db
    .select({
      f: feedbackRequests,
      restaurantName: restaurants.name,
      logoKey: restaurants.logoKey,
      brandColor: restaurants.brandColor,
      wheelEnabled: restaurantSettings.wheelEnabled,
      wheelPrizes: restaurantSettings.wheelPrizes,
      orderNumber: orders.number,
      currency: restaurants.currency,
    })
    .from(feedbackRequests)
    .innerJoin(restaurants, eq(restaurants.id, feedbackRequests.restaurantId))
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .innerJoin(orders, eq(orders.id, feedbackRequests.orderId))
    .where(eq(feedbackRequests.token, token));
  return row ?? null;
}

const usablePrizes = (p: WheelPrize[]) => p.filter((x) => x.weight > 0 && x.label.trim()).slice(0, 8);

/** What the public survey page shows. */
export async function getFeedbackPage(db: Database, token: string) {
  const row = await byToken(db, token);
  if (!row) return null;
  const prizes = row.wheelEnabled ? usablePrizes(row.wheelPrizes) : [];
  return {
    restaurantName: row.restaurantName,
    logoKey: row.logoKey,
    brandColor: row.brandColor,
    orderNumber: row.orderNumber,
    currency: row.currency,
    rating: row.f.rating,
    answered: row.f.answeredAt != null,
    wheel: prizes.length >= 2 ? prizes.map((p) => p.label) : null,
    prize: row.f.spunAt ? { label: row.f.prizeLabel, couponCode: row.f.couponCode } : null,
  };
}

const answerSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** The guest rates. Once only. A low rating notifies the team right away. */
export async function submitFeedback(db: Database, token: string, raw: unknown) {
  const input = answerSchema.parse(raw);
  const row = await byToken(db, token);
  if (!row) throw notFound();
  return db.transaction(async (tx) => {
    const [done] = await tx
      .update(feedbackRequests)
      .set({ rating: input.rating, comment: input.comment || null, answeredAt: new Date() })
      .where(and(eq(feedbackRequests.id, row.f.id), isNull(feedbackRequests.answeredAt)))
      .returning({ id: feedbackRequests.id });
    if (!done) throw conflict("already_answered");
    await tx.insert(reviews).values({
      restaurantId: row.f.restaurantId,
      orderId: row.f.orderId,
      rating: input.rating,
      comment: input.comment || null,
    });
    if (input.rating <= UNHAPPY_MAX) {
      await notifyTeam(tx, {
        restaurantId: row.f.restaurantId,
        type: "feedback.unhappy",
        payload: {
          rating: input.rating,
          number: row.orderNumber,
          comment: (input.comment ?? "").slice(0, 140),
          phone: row.f.phone,
        },
      });
    }
    return { rating: input.rating };
  });
}

/** Weighted draw, server side. `rand` is injectable for tests. */
export function drawPrize(prizes: WheelPrize[], rand = (n: number) => randomInt(n)) {
  const total = prizes.reduce((s, p) => s + Math.trunc(p.weight), 0);
  let r = rand(total);
  for (let i = 0; i < prizes.length; i++) {
    r -= Math.trunc(prizes[i]!.weight);
    if (r < 0) return i;
  }
  return prizes.length - 1;
}

/** One spin per survey, after rating. A discount prize becomes a single-use coupon. */
export async function spinWheel(db: Database, token: string, rand?: (n: number) => number) {
  const row = await byToken(db, token);
  if (!row) throw notFound();
  const prizes = row.wheelEnabled ? usablePrizes(row.wheelPrizes) : [];
  if (prizes.length < 2) throw conflict("wheel_off");
  if (!row.f.answeredAt) throw conflict("rate_first");
  if (row.f.spunAt) {
    const index = Math.max(
      0,
      prizes.findIndex((p) => p.label === row.f.prizeLabel),
    );
    return { index, label: row.f.prizeLabel, couponCode: row.f.couponCode };
  }
  const index = drawPrize(prizes, rand);
  const prize = prizes[index]!;
  return db.transaction(async (tx) => {
    let code: string | null = null;
    if (prize.kind !== "none" && prize.value > 0) {
      code = `WIN-${randomBytes(4).toString("hex").toUpperCase()}`;
      await tx.insert(coupons).values({
        restaurantId: row.f.restaurantId,
        code,
        kind: prize.kind,
        value: prize.kind === "percent" ? Math.min(100, Math.trunc(prize.value)) : Math.trunc(prize.value),
        maxUses: 1,
        endsAt: new Date(Date.now() + COUPON_DAYS * 86_400_000),
      });
    }
    const [claimed] = await tx
      .update(feedbackRequests)
      .set({ spunAt: new Date(), prizeLabel: prize.label.slice(0, 60), couponCode: code })
      .where(and(eq(feedbackRequests.id, row.f.id), isNull(feedbackRequests.spunAt)))
      .returning({ id: feedbackRequests.id });
    if (!claimed) throw conflict("already_spun");
    return { index, label: prize.label, couponCode: code };
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getFeedbackOverview(db: Database, ctx: RestaurantContext, days = 30) {
  assertCan(ctx, "customers.view");
  const rid = ctx.restaurant.id;
  await sendDueFeedback(db, rid).catch(() => 0);
  const since = new Date(Date.now() - days * 86_400_000);
  const [[stats], [sent], list] = await Promise.all([
    db
      .select({
        n: count(),
        avg: avg(feedbackRequests.rating),
        unhappy: sql<number>`count(*) filter (where ${feedbackRequests.rating} <= ${UNHAPPY_MAX})`.mapWith(
          Number,
        ),
      })
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.restaurantId, rid),
          isNotNull(feedbackRequests.answeredAt),
          gte(feedbackRequests.answeredAt, since),
        ),
      ),
    db
      .select({ n: count() })
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.restaurantId, rid),
          isNotNull(feedbackRequests.sentAt),
          gte(feedbackRequests.sentAt, since),
        ),
      ),
    db
      .select({
        id: feedbackRequests.id,
        rating: feedbackRequests.rating,
        comment: feedbackRequests.comment,
        answeredAt: feedbackRequests.answeredAt,
        phone: feedbackRequests.phone,
        prizeLabel: feedbackRequests.prizeLabel,
        orderNumber: orders.number,
      })
      .from(feedbackRequests)
      .innerJoin(orders, eq(orders.id, feedbackRequests.orderId))
      .where(and(eq(feedbackRequests.restaurantId, rid), isNotNull(feedbackRequests.answeredAt)))
      .orderBy(desc(feedbackRequests.answeredAt))
      .limit(100),
  ]);
  return {
    answered: stats?.n ?? 0,
    sent: sent?.n ?? 0,
    average: stats?.avg != null ? Number(stats.avg) : null,
    unhappy: stats?.unhappy ?? 0,
    list,
  };
}

const prizeSchema = z.object({
  label: z.string().trim().min(1).max(60),
  kind: z.enum(["percent", "amount", "none"]),
  value: z.coerce.number().min(0).max(1e13),
  weight: z.coerce.number().int().min(0).max(1000),
});
export const feedbackSettingsSchema = z.object({
  feedbackSmsEnabled: z.boolean(),
  feedbackDelayMinutes: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  wheelEnabled: z.boolean(),
  wheelPrizes: z.array(prizeSchema).max(8),
});

export async function getFeedbackSettings(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "customers.view");
  const [s] = await db
    .select({
      feedbackSmsEnabled: restaurantSettings.feedbackSmsEnabled,
      feedbackDelayMinutes: restaurantSettings.feedbackDelayMinutes,
      wheelEnabled: restaurantSettings.wheelEnabled,
      wheelPrizes: restaurantSettings.wheelPrizes,
    })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  if (!s) throw notFound();
  return s;
}

export async function updateFeedbackSettings(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const input = feedbackSettingsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set(input)
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "restaurant.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: {
      feedback: input.feedbackSmsEnabled,
      wheel: input.wheelEnabled,
      prizes: input.wheelPrizes.length,
    },
  });
}
