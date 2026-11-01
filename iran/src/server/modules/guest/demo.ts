import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import { diningTables, restaurants } from "@/server/db/schema";

/** The restaurant behind /demo (seeded with SEED_PUBLIC_DEMO=true). */
export const demoSlug = () => process.env.DEMO_RESTAURANT_SLUG || "restaurant-demo";

/**
 * A table of the demo restaurant for a visitor: a free one at random (each visitor gets their
 * own table), else any table. Null when there is no demo restaurant.
 */
export async function pickDemoTable(db: Database): Promise<string | null> {
  const rows = await db
    .select({
      qrToken: diningTables.qrToken,
      busy: sql<boolean>`exists (select 1 from table_sessions s where s.table_id = ${diningTables.id} and s.status = 'open')`,
    })
    .from(diningTables)
    .innerJoin(restaurants, eq(restaurants.id, diningTables.restaurantId))
    .where(
      and(
        eq(restaurants.slug, demoSlug()),
        eq(restaurants.status, "active"),
        isNull(diningTables.deletedAt),
        eq(diningTables.qrEnabled, true),
      ),
    );
  if (rows.length === 0) return null;
  const free = rows.filter((r) => !r.busy);
  const pool = free.length ? free : rows;
  return pool[Math.floor(Math.random() * pool.length)]!.qrToken;
}
