import { db } from "@/server/db/client";
import { authenticateAgent, leaseJobs } from "@/server/modules/printing/service";

/**
 * Local print agent: pulls the tickets to print (rendered ESC/POS, base64) for its restaurant.
 * Auth: `Authorization: Bearer <agent token>` (Settings → Printers).
 */
export async function GET(req: Request) {
  const token =
    req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? null;
  const rid = await authenticateAgent(db, token);
  if (!rid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const jobs = await leaseJobs(db, rid);
  return Response.json({ jobs }, { headers: { "cache-control": "no-store" } });
}
