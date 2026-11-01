import { db } from "@/server/db/client";
import { ackJob, authenticateAgent } from "@/server/modules/printing/service";

/** The agent reports a job printed (`{ ok: true }`) or failed (`{ ok: false, error }`). */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/print/agent/jobs/[jobId]">) {
  const token =
    req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? null;
  const rid = await authenticateAgent(db, token);
  if (!rid) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const body = (await req.json().catch(() => ({}))) as { ok?: unknown; error?: unknown };
  try {
    await ackJob(db, rid, jobId, body.ok === true, typeof body.error === "string" ? body.error : undefined);
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
