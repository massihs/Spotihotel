import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { orders, organizations, plans, restaurants, subscriptions, users } from "@/server/db/schema";

export async function getPlatformStats(db: DbOrTx) {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [r] = await db
    .select({
      active: sql<number>`count(*) filter (where ${restaurants.status} = 'active')`.mapWith(Number),
      suspended: sql<number>`count(*) filter (where ${restaurants.status} = 'suspended')`.mapWith(Number),
      new30d: sql<number>`count(*) filter (where ${restaurants.createdAt} >= ${since30d})`.mapWith(Number),
    })
    .from(restaurants)
    .where(isNull(restaurants.deletedAt));

  const [u] = await db.select({ total: count() }).from(users).where(isNull(users.deletedAt));

  const [o] = await db
    .select({
      orders: count(),
      revenueCents:
        sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.paymentStatus} = 'paid'), 0)`.mapWith(
          Number,
        ),
    })
    .from(orders)
    .where(sql`${orders.status} <> 'cancelled'`);

  const subs = await db
    .select({ plan: plans.code, total: count() })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(sql`${subscriptions.status} in ('active','trialing')`)
    .groupBy(plans.code);

  return {
    restaurants: { active: r?.active ?? 0, suspended: r?.suspended ?? 0, new30d: r?.new30d ?? 0 },
    users: u?.total ?? 0,
    orders: o?.orders ?? 0,
    // Note: multi-currency platforms must group by currency; MVP assumes one platform currency.
    revenueCents: o?.revenueCents ?? 0,
    subscriptionsByPlan: Object.fromEntries(subs.map((s) => [s.plan, s.total])),
  };
}

export async function listRestaurantsForAdmin(
  db: DbOrTx,
  opts: { q?: string; status?: "active" | "suspended"; limit?: number; offset?: number } = {},
) {
  const filters = [isNull(restaurants.deletedAt)];
  if (opts.status) filters.push(eq(restaurants.status, opts.status));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(restaurants.name, like), ilike(restaurants.slug, like))!);
  }
  return db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      slug: restaurants.slug,
      status: restaurants.status,
      city: restaurants.city,
      createdAt: restaurants.createdAt,
      organizationId: restaurants.organizationId,
      organizationName: organizations.name,
      ordersCount:
        sql<number>`(select count(*) from orders o where o.restaurant_id = "restaurants"."id")`.mapWith(
          Number,
        ),
    })
    .from(restaurants)
    .innerJoin(organizations, eq(organizations.id, restaurants.organizationId))
    .where(and(...filters))
    .orderBy(desc(restaurants.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .offset(opts.offset ?? 0);
}

export async function listUsersForAdmin(
  db: DbOrTx,
  opts: { q?: string; limit?: number; offset?: number } = {},
) {
  const filters = [isNull(users.deletedAt)];
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(or(ilike(users.email, like), ilike(users.fullName, like))!);
  }
  return db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      isSuperAdmin: users.isSuperAdmin,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      restaurantsCount:
        sql<number>`(select count(*) from restaurant_members rm where rm.user_id = "users"."id")`.mapWith(
          Number,
        ),
    })
    .from(users)
    .where(and(...filters))
    .orderBy(desc(users.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200))
    .offset(opts.offset ?? 0);
}

/**
 * Growth (admin overview): orders per day, restaurants that order (7 / 30 days), new sign-ups
 * per week, restaurants lost (ordered in the 30 days before, not in the last 30), and those at
 * risk (last order 14 to 60 days ago).
 */
export async function getGrowthMetrics(db: DbOrTx, now = new Date()) {
  const d = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const live = sql`${orders.status} <> 'cancelled'`;
  const [byDay, [active], [lost], signups, atRisk] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.placedAt} at time zone 'Asia/Tehran'), 'YYYY-MM-DD')`,
        orders: sql<number>`count(*)`.mapWith(Number),
        restaurants: sql<number>`count(distinct ${orders.restaurantId})`.mapWith(Number),
      })
      .from(orders)
      .where(sql`${live} and ${orders.placedAt} >= ${d(30)}`)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        d7: sql<number>`count(distinct ${orders.restaurantId}) filter (where ${orders.placedAt} >= ${d(7)})`.mapWith(
          Number,
        ),
        d30: sql<number>`count(distinct ${orders.restaurantId}) filter (where ${orders.placedAt} >= ${d(30)})`.mapWith(
          Number,
        ),
      })
      .from(orders)
      .where(live),
    db
      .execute<{ n: number }>(
        sql`
      select count(*)::int as n from (
        select restaurant_id from orders
        where status <> 'cancelled' and placed_at >= ${d(60)} and placed_at < ${d(30)}
        except
        select restaurant_id from orders where status <> 'cancelled' and placed_at >= ${d(30)}
      ) x`,
      )
      .then((r) => r.rows as { n: number }[]),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${restaurants.createdAt}), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(restaurants)
      .where(sql`${restaurants.deletedAt} is null and ${restaurants.createdAt} >= ${d(56)}`)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        id: restaurants.id,
        name: restaurants.name,
        lastOrderAt: sql<Date>`max(${orders.placedAt})`.mapWith((v: string) => new Date(v)),
        orders30: sql<number>`count(*) filter (where ${orders.placedAt} >= ${d(60)})`.mapWith(Number),
      })
      .from(orders)
      .innerJoin(restaurants, eq(restaurants.id, orders.restaurantId))
      .where(sql`${live} and ${restaurants.deletedAt} is null and ${restaurants.status} = 'active'`)
      .groupBy(restaurants.id, restaurants.name)
      .having(sql`max(${orders.placedAt}) < ${d(14)} and max(${orders.placedAt}) >= ${d(60)}`)
      .orderBy(sql`3`)
      .limit(20),
  ]);
  return {
    byDay,
    active7d: active?.d7 ?? 0,
    active30d: active?.d30 ?? 0,
    lost30d: lost?.n ?? 0,
    signups,
    atRisk,
  };
}
