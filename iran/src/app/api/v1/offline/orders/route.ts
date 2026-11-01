import { db } from "@/server/db/client";
import { errorResponse } from "@/server/actions";
import { authenticateDevice, bearer, importOfflineOrders } from "@/server/modules/offline/service";

/**
 * POST /api/v1/offline/orders — `{ orders: [...] }` taken while the internet was down.
 * Idempotent per order (`ref`): safe to resend. Returns one result per order.
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateDevice(db, bearer(req), req.headers.get("x-app-version"));
    if (!auth) return Response.json({ error: "unauthorized" }, { status: 401 });
    const res = await importOfflineOrders(db, auth, await req.json());
    return Response.json(res, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
