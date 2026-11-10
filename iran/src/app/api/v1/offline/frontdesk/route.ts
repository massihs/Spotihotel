import { connection } from "next/server";
import { db } from "@/server/db/client";
import { errorResponse } from "@/server/actions";
import { authenticateDevice, bearer } from "@/server/modules/offline/service";
import { frontdeskSnapshot } from "@/server/modules/offline/frontdesk";

/**
 * GET /api/v1/offline/frontdesk — the reception's emergency copy for the hotel's desktop app
 * (rooms, guests in house, arrivals, departures, balances). Device token auth; 404 for a
 * restaurant.
 */
export async function GET(req: Request) {
  await connection();
  try {
    const auth = await authenticateDevice(db, bearer(req), req.headers.get("x-app-version"));
    if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
    return Response.json(await frontdeskSnapshot(db, auth), {
      headers: { "cache-control": "no-store, private" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
