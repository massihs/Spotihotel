import { db } from "@/server/db/client";
import { recordHit } from "@/server/modules/ops/audience";

/** POST /api/v1/hit {path, referrer, locale} — a public page view (see modules/ops/audience). */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      path?: unknown;
      referrer?: unknown;
      locale?: unknown;
    };
    if (typeof body.path !== "string") return new Response(null, { status: 204 });
    await recordHit(db, {
      path: body.path,
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      locale: typeof body.locale === "string" ? body.locale : null,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      ua: req.headers.get("user-agent") ?? "",
    });
  } catch (e) {
    console.error("[audience] hit failed", e);
  }
  return new Response(null, { status: 204 });
}
