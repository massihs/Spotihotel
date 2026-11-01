import { connection } from "next/server";
import { db } from "@/server/db/client";
import { errorResponse } from "@/server/actions";
import { authenticateDevice, bearer, getSnapshot } from "@/server/modules/offline/service";

/**
 * GET /api/v1/offline/snapshot — menu, tables, stations, printers and team for the desktop app,
 * refreshed while online so it can keep working when the internet drops. Device token auth.
 */
export async function GET(req: Request) {
  await connection();
  try {
    const auth = await authenticateDevice(db, bearer(req), req.headers.get("x-app-version"));
    if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json(await getSnapshot(db, auth), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
