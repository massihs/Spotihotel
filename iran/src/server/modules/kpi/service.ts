import { and, avg, eq, gte, isNotNull, sql } from "drizzle-orm";
import { notifyTeam } from "@/server/modules/team/sections";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  feedbackRequests,
  notifications,
  orders,
  payments,
  restaurantSettings,
  type KpiGoals,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/**
 * Targets (Z-7): today's takings, kitchen time (accepted → ready, last hour and today), and the
 * guests' rating (7 days). The overview shows progress; a missed target notifies the team, at
 * most once per alert and per day (kitchen: every 2 hours).
 */
export const kpiGoalsSchema = z.object({
  dailyRevenueCents: z.coerce.number().int().min(0).max(1e15).nullable(),
  maxPrepMinutes: z.coerce.number().int().min(1).max(240).nullable(),
  minRating: z.coerce.number().min(1).max(5).nullable(),
});

export async function getKpiGoals(db: DbOrTx, restaurantId: string): Promise<KpiGoals> {
  const [s] = await db
    .select({ g: restaurantSettings.kpiGoals })
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, restaurantId));
  return s?.g ?? {};
}

export async function updateKpiGoals(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  const input = kpiGoalsSchema.parse(raw);
  await db
    .update(restaurantSettings)
    .set({ kpiGoals: input })
    .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
  await recordAudit(db, {
    action: "restaurant.settings_updated",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    metadata: { kpiGoals: input },
  });
}

async function measure(db: DbOrTx, restaurantId: string, timezone: string, now: Date) {
  const dayStart = sql`(date_trunc('day', ${now}::timestamptz at time zone ${timezone}) at time zone ${timezone})`;
  const prep = (since: ReturnType<typeof sql>) =>
    db
      .select({
        m: sql<number | null>`avg(extract(epoch from (${orders.readyAt} - ${orders.acceptedAt})) / 60)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, restaurantId),
          isNotNull(orders.readyAt),
          isNotNull(orders.acceptedAt),
          gte(orders.readyAt, since),
        ),
      );
  const [[rev], [prepToday], [prepHour], [rating]] = await Promise.all([
    db
      .select({ c: sql<string | null>`sum(${payments.amountCents})` })
      .from(payments)
      .where(
        and(
          eq(payments.restaurantId, restaurantId),
          eq(payments.status, "succeeded"),
          gte(payments.succeededAt, dayStart),
        ),
      ),
    prep(dayStart),
    prep(sql`${now}::timestamptz - interval '1 hour'`),
    db
      .select({ r: avg(feedbackRequests.rating) })
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.restaurantId, restaurantId),
          isNotNull(feedbackRequests.answeredAt),
          gte(feedbackRequests.answeredAt, new Date(now.getTime() - 7 * 86_400_000)),
        ),
      ),
  ]);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    revenueTodayCents: Number(rev?.c ?? 0),
    prepTodayMinutes: num(prepToday?.m),
    prepLastHourMinutes: num(prepHour?.m),
    rating7d: num(rating?.r),
  };
}

export async function getKpiStatus(db: Database, ctx: RestaurantContext, now = new Date()) {
  assertCan(ctx, "restaurant.view");
  const [goals, m] = await Promise.all([
    getKpiGoals(db, ctx.restaurant.id),
    measure(db, ctx.restaurant.id, ctx.restaurant.timezone, now),
  ]);
  return { goals, ...m };
}

/** Lazy sweep (dashboard loads): notifies a missed target, deduplicated. */
export async function checkKpiAlerts(
  db: Database,
  restaurant: { id: string; timezone: string },
  now = new Date(),
) {
  const goals = await getKpiGoals(db, restaurant.id);
  if (!goals.dailyRevenueCents && !goals.maxPrepMinutes && !goals.minRating) return [];
  const m = await measure(db, restaurant.id, restaurant.timezone, now);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: restaurant.timezone,
    }).format(now),
  );
  const due: { type: string; within: number; payload: Record<string, unknown> }[] = [];
  if (goals.maxPrepMinutes && m.prepLastHourMinutes != null && m.prepLastHourMinutes > goals.maxPrepMinutes)
    due.push({
      type: "kpi.prep_slow",
      within: 2 * 3600_000,
      payload: { minutes: Math.round(m.prepLastHourMinutes), goal: goals.maxPrepMinutes },
    });
  if (goals.minRating && m.rating7d != null && m.rating7d < goals.minRating)
    due.push({
      type: "kpi.rating_low",
      within: 86_400_000,
      payload: { rating: Math.round(m.rating7d * 10) / 10, goal: goals.minRating },
    });
  // Late evening: the day's takings are known.
  if (goals.dailyRevenueCents && hour >= 22 && m.revenueTodayCents < goals.dailyRevenueCents)
    due.push({
      type: "kpi.revenue_missed",
      within: 12 * 3600_000,
      payload: { amountCents: m.revenueTodayCents, goalCents: goals.dailyRevenueCents },
    });
  const sent: string[] = [];
  for (const a of due) {
    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.restaurantId, restaurant.id),
          eq(notifications.type, a.type),
          gte(notifications.createdAt, new Date(now.getTime() - a.within)),
        ),
      )
      .limit(1);
    if (recent) continue;
    await notifyTeam(db, { restaurantId: restaurant.id, type: a.type, payload: a.payload, createdAt: now });
    sent.push(a.type);
  }
  return sent;
}
