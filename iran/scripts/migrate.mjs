// Applies pending SQL migrations from ./drizzle. Used by the production container at start-up
// (plain Node, no TypeScript tooling needed). Safe to run concurrently: Drizzle takes a lock.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const name = process.env.DATABASE_URL_DIRECT ? "DATABASE_URL_DIRECT" : "DATABASE_URL";
const url = process.env[name]?.trim();
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// Start-up diagnostic, never printing the password itself: which variable, which server, and
// hints for the usual copy/paste mistakes (spaces, unencoded special characters).
let target = "(unparsable URL)";
try {
  const u = new URL(url);
  const pw = decodeURIComponent(u.password);
  target = `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}${u.pathname} (password: ${pw.length} chars)`;
} catch {}
console.log(`→ connecting to PostgreSQL via ${name}: ${target}`);
if ((url.match(/@/g) ?? []).length > 1) {
  console.warn("! the URL contains several '@': special characters in the password must be URL-encoded");
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("✓ database migrations applied");
} catch (e) {
  const err = e?.cause ?? e; // Drizzle wraps the driver error
  const hints = {
    "28P01": "wrong user or password: copy the connection URI again from the Liara database page",
    "3D000": "database name does not exist: check the part after the last '/'",
    ENOTFOUND: "host not found: app and database must share the private network, or use the public URI",
    ECONNREFUSED: "connection refused: wrong host/port, or the database is stopped",
    ETIMEDOUT: "timeout: app and database are probably not on the same network",
  };
  console.error(`✗ database connection failed (${err.code ?? "unknown"}): ${hints[err.code] ?? err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
