import { NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { completeCheckout } from "@/server/modules/billing/service";

/**
 * GET /api/v1/billing/return?id={billingPaymentId}&Authority=…&Status=OK|NOK
 * Zarinpal sends the restaurant owner back here after paying their Spotifood plan. The payment
 * is verified server-to-server before the period is extended; then back to the billing page.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = new URL(env().APP_URL).origin;
  let target = new URL("/dashboard", origin);
  try {
    const res = await completeCheckout(db, url.searchParams.get("id") ?? "", url.searchParams);
    if (res?.restaurantId) {
      target = new URL(`/dashboard/${res.restaurantId}/billing`, origin);
      target.searchParams.set(res.paid ? "paid" : "failed", "1");
    }
  } catch (e) {
    console.error("[billing] return handling failed", e);
  }
  return NextResponse.redirect(target, 303);
}
