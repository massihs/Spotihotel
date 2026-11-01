// Applies pending SQL migrations from ./drizzle. Used by the production container at start-up
// (plain Node, no TypeScript tooling needed). Safe to run concurrently: Drizzle takes a lock.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("✓ database migrations applied");
} finally {
  await pool.end();
}
