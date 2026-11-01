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
