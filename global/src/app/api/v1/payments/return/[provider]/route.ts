import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { handlePaymentReturn } from "@/server/modules/payments/service";

/**
 * GET /api/v1/payments/return/{provider}?payment={id}&…
 * Where redirect-based PSPs (Zarinpal) send the guest back. The query string is never trusted:
 * the provider re-verifies the payment server-to-server before anything is marked paid.
 * Always ends with a redirect to the guest's payment status page (same origin only).
 */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/payments/return/[provider]">) {
  const { provider } = await params;
  const url = new URL(req.url);
  const appOrigin = new URL(env().APP_URL).origin;
  let target = new URL("/table/orders", appOrigin);
  try {
    const { paymentId, returnUrl } = await handlePaymentReturn(db, provider, url.searchParams);
    if (returnUrl && new URL(returnUrl).origin === appOrigin) target = new URL(returnUrl);
    else target.searchParams.set("payment", paymentId);
  } catch (e) {
    console.error("[payments] return handling failed", e);
  }
  return NextResponse.redirect(target, 303);
}
