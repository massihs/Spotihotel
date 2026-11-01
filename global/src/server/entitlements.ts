import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  diningTables,
  plans,
  restaurantMembers,
  restaurants,
  subscriptions,
  type PlanLimits,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { DEFAULT_PLANS } from "@/server/modules/catalog/defaults";

const FALLBACK = DEFAULT_PLANS.find((p) => p.code === "free")!;

export type Entitlements = { planCode: string; limits: PlanLimits };

/** Plan of the restaurant's organization (active/trialing subscription), falling back to Free. */
export async function getEntitlements(db: DbOrTx, restaurantId: string): Promise<Entitlements> {
  const [row] = await db
    .select({ code: plans.code, limits: plans.limits })
    .from(restaurants)
    .innerJoin(subscriptions, eq(subscriptions.organizationId, restaurants.organizationId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(restaurants.id, restaurantId), inArray(subscriptions.status, ["active", "trialing"])))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row
    ? { planCode: row.code, limits: row.limits }
    : { planCode: FALLBACK.code, limits: FALLBACK.limits };
}

export function hasFeature(e: Entitlements, feature: string) {
  return e.limits.features.includes(feature);
}

/**
 * Serializes quota checks for one restaurant within the current transaction
 * (row lock on the tenant), so two concurrent creations cannot both pass the limit.
 */
export async function lockRestaurant(tx: DbOrTx, restaurantId: string) {
  await tx.execute(sql`SELECT 1 FROM ${restaurants} WHERE ${restaurants.id} = ${restaurantId} FOR UPDATE`);
}

export async function assertTableQuota(tx: DbOrTx, restaurantId: string, adding: number) {
  const { limits } = await getEntitlements(tx, restaurantId);
  if (limits.maxTables === null) return;
  const [r] = await tx
    .select({ n: count() })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, restaurantId), isNull(diningTables.deletedAt)));
  if ((r?.n ?? 0) + adding > limits.maxTables) {
    throw new AppError("PLAN_LIMIT", "plan_limit_tables", { limit: limits.maxTables, current: r?.n ?? 0 });
  }
}

export async function assertStaffQuota(tx: DbOrTx, restaurantId: string) {
  const { limits } = await getEntitlements(tx, restaurantId);
  if (limits.maxStaff === null) return;
  const [r] = await tx
    .select({ n: count() })
    .from(restaurantMembers)
    .where(and(eq(restaurantMembers.restaurantId, restaurantId), eq(restaurantMembers.status, "active")));
  if ((r?.n ?? 0) + 1 > limits.maxStaff) {
    throw new AppError("PLAN_LIMIT", "plan_limit_staff", { limit: limits.maxStaff });
  }
}
