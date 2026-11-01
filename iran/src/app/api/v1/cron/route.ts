import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { sendDueFeedback } from "@/server/modules/feedback/service";
import { sendAllDueReminders } from "@/server/modules/reservations/service";

/**
 * POST /api/v1/cron with header `x-cron-key: $CRON_SECRET` — periodic jobs (satisfaction texts,
 * booking reminders).
 * Called every 10 minutes by .github/workflows/uptime.yml. Off when CRON_SECRET is unset; the
 * dashboards also run the same sweeps when they load.
 */
export async function POST(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  const ok =
    secret.length >= 16 &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ ok: false }, { status: 401 });
  const feedback = await sendDueFeedback(db);
  const reminders = await sendAllDueReminders(db);
  return Response.json({ ok: true, feedback, reminders }, { headers: { "Cache-Control": "no-store" } });
}
