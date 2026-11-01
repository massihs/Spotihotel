import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** Either the root db or a transaction handle — services accept both. */
export type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalForDb = globalThis as unknown as { __sfPool?: Pool; __sfDb?: Database };

function createDb(): Database {
  const pool =
    globalForDb.__sfPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
    });
  // Reuse the pool across hot reloads in development.
  if (process.env.NODE_ENV !== "production") globalForDb.__sfPool = pool;
  return drizzle(pool, { schema, casing: "snake_case" });
}

export const db: Database = globalForDb.__sfDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__sfDb = db;

export { schema };
