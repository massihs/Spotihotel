import { and, count, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { categories, diningTables, products, restaurantMembers, restaurants } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";

/** Counts used by the onboarding checklist. All queries are scoped to ctx.restaurant.id. */
export async function getSetupOverview(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const rid = ctx.restaurant.id;

  const [[t], [c], [p], [m], [r]] = await Promise.all([
    db
      .select({ n: count() })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt))),
    db
      .select({ n: count() })
      .from(categories)
      .where(and(eq(categories.restaurantId, rid), isNull(categories.deletedAt))),
    db
      .select({ n: count() })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt))),
    db
      .select({ n: count() })
      .from(restaurantMembers)
      .where(and(eq(restaurantMembers.restaurantId, rid), eq(restaurantMembers.status, "active"))),
    db
      .select({ phone: restaurants.phone, address: restaurants.addressLine1 })
      .from(restaurants)
      .where(eq(restaurants.id, rid)),
  ]);

  return {
    tables: t?.n ?? 0,
    categories: c?.n ?? 0,
    products: p?.n ?? 0,
    members: m?.n ?? 0,
    profileComplete: Boolean(r?.phone && r?.address),
  };
}
