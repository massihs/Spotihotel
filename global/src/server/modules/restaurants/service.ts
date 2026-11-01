import { edition } from "@/config/edition";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import {
  organizationMembers,
  organizations,
  plans,
  restaurantMembers,
  restaurantSettings,
  restaurants,
  subscriptions,
  taxRates,
} from "@/server/db/schema";
import { slugify } from "@/lib/slug";
import { randomToken } from "@/lib/ids";

/** Default French VAT rates for restaurants. Editable per restaurant. */
export const DEFAULT_TAX_RATES = edition.defaultTaxRates;

export async function uniqueRestaurantSlug(db: DbOrTx, name: string): Promise<string> {
  const base = slugify(name) || "restaurant";
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? base : `${base}-${randomToken(4).toLowerCase()}`;
    const [hit] = await db
      .select({ id: restaurants.id })
      .from(restaurants)
      .where(eq(restaurants.slug, candidate))
      .limit(1);
    if (!hit) return candidate;
  }
  return `${base}-${randomToken(8).toLowerCase()}`;
}

/**
 * Creates a restaurant with its settings, default tax rates and owner membership.
 * Must be called inside a transaction.
 */
export async function createRestaurant(
  tx: DbOrTx,
  input: {
    organizationId: string;
    ownerUserId: string;
    name: string;
    currency?: string;
    timezone?: string;
    country?: string;
    defaultLocale?: string;
  },
) {
  const slug = await uniqueRestaurantSlug(tx, input.name);
  const [restaurant] = await tx
    .insert(restaurants)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      slug,
      currency: input.currency ?? edition.restaurantDefaults.currency,
      timezone: input.timezone ?? edition.restaurantDefaults.timezone,
      country: input.country ?? edition.restaurantDefaults.country,
      defaultLocale: input.defaultLocale ?? edition.defaultLocale,
    })
    .returning();

  const prefix = (slugify(input.name).replace(/[^a-z]/g, "")[0] ?? "a").toUpperCase();
  await tx.insert(restaurantSettings).values({
    restaurantId: restaurant!.id,
    orderPrefix: prefix,
    enabledLocales: [...edition.restaurantLocales],
  });
  await tx.insert(taxRates).values(DEFAULT_TAX_RATES.map((r) => ({ ...r, restaurantId: restaurant!.id })));
  await tx.insert(restaurantMembers).values({
    restaurantId: restaurant!.id,
    userId: input.ownerUserId,
    role: "owner",
  });
  return restaurant!;
}

/** New organization + free-plan subscription (if a free plan is configured). */
export async function createOrganization(
  tx: DbOrTx,
  input: { name: string; ownerUserId: string; billingEmail?: string },
) {
  const [org] = await tx
    .insert(organizations)
    .values({ name: input.name, billingEmail: input.billingEmail })
    .returning();
  await tx
    .insert(organizationMembers)
    .values({ organizationId: org!.id, userId: input.ownerUserId, role: "owner" });

  const [free] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "free")).limit(1);
  if (free) {
    await tx.insert(subscriptions).values({ organizationId: org!.id, planId: free.id, status: "active" });
  }
  return org!;
}

export async function setRestaurantStatus(
  db: DbOrTx,
  restaurantId: string,
  status: "active" | "suspended",
  reason?: string,
) {
  const [row] = await db
    .update(restaurants)
    .set({ status, suspendedReason: status === "suspended" ? (reason ?? null) : null })
    .where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt)))
    .returning({ id: restaurants.id, status: restaurants.status });
  return row ?? null;
}

/** Atomically increments a per-restaurant counter and returns the new value. */
export async function nextCounterValue(tx: DbOrTx, restaurantId: string, name: string, start = 1000) {
  const result = await tx.execute<{ value: string }>(sql`
    INSERT INTO counters (restaurant_id, name, value) VALUES (${restaurantId}, ${name}, ${start})
    ON CONFLICT (restaurant_id, name) DO UPDATE SET value = counters.value + 1
    RETURNING value
  `);
  return Number(result.rows[0]!.value);
}
