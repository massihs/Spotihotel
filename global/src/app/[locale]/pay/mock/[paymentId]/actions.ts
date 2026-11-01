"use server";

import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { mockEnabled, verifyMockSignature } from "@/server/infra/payments/mock";
import { confirmPayment, failPayment } from "@/server/modules/payments/service";

/** Only same-origin return URLs: the signed link must never become an open redirect. */
function safeReturn(raw: string) {
  try {
    const url = new URL(raw);
    if (url.origin === new URL(env().APP_URL).origin) return url.toString();
  } catch {
    /* fall through */
  }
  return "/table/orders";
}

/**
 * DEVELOPMENT ONLY — plays the role of the PSP webhook for the simulated provider.
 * Requires the HMAC-signed link issued when the payment was created.
 */
export async function completeMockPaymentAction(fd: FormData) {
  if (!mockEnabled()) throw new Error("Mock payments are disabled");
  const paymentId = String(fd.get("paymentId") ?? "");
  const sig = String(fd.get("sig") ?? "");
  if (!verifyMockSignature(paymentId, sig)) throw new Error("Invalid signature");
  if (fd.get("outcome") === "success") {
    await confirmPayment(db, { paymentId, provider: "mock_online", providerRef: `mock_${paymentId}` });
  } else {
    await failPayment(db, { paymentId, provider: "mock_online", reason: "declined_simulated" });
  }
  redirect(safeReturn(String(fd.get("return") ?? "")));
}
