import { db } from "@/server/db/client";
import { errorResponse } from "@/server/actions";
import { handleWebhook } from "@/server/modules/payments/service";

/**
 * POST /api/v1/payments/webhooks/{provider}
 * Public endpoint called by the PSP. Authenticity comes from the provider's signature
 * (verified on the raw body), never from the caller. Handling is idempotent, so PSP retries are safe.
 * 2xx = processed or deliberately ignored; 401 = bad signature; 5xx = retry later.
 */
export async function POST(req: Request, { params }: RouteContext<"/api/v1/payments/webhooks/[provider]">) {
  try {
    const { provider } = await params;
    const raw = await req.text();
    if (raw.length > 512 * 1024) return Response.json({ error: { code: "VALIDATION" } }, { status: 413 });
    const result = await handleWebhook(db, provider, raw, req.headers);
    return Response.json({ received: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
