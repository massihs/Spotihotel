import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { EDITION } from "@/config/edition";
import { db } from "@/server/db/client";

/** GET /api/health — liveness + database reachability, for the container health check. */
export async function GET() {
  await connection();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, edition: EDITION }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, edition: EDITION, error: "database" }, { status: 503 });
  }
}
