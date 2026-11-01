import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { DEFAULT_PLANS } from "../../src/server/modules/catalog/defaults";

/** Recreates the test database schema from the committed migrations before the run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://spotifood:spotifood@localhost:5432/spotifood_test";
  if (!/test/.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);
  const pool = new Pool({ connectionString: url });
  await pool.query(
    "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;",
  );
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  // Plans exist in every real environment (seeded); new organizations get the Free plan.
  for (const p of DEFAULT_PLANS) {
    await pool.query(
      "INSERT INTO plans (id, code, name, price_monthly_cents, limits, sort_order) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)",
      [p.code, p.name, p.priceMonthlyCents, JSON.stringify(p.limits), p.sortOrder],
    );
  }
  await pool.end();
}
