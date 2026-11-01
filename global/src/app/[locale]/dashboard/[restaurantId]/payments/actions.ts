"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
import { parseMoney } from "@/lib/money";
import { cancelPendingPayment, recordStaffPayment, refundPayment } from "@/server/modules/payments/service";

/** Cash / terminal collected at the table. The amount is computed server-side from unpaid orders. */
export async function recordPaymentAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const tenderedRaw = String(fd.get("tendered") ?? "").trim();
    const tendered = tenderedRaw ? parseMoney(tenderedRaw) : null;
    if (tenderedRaw && tendered === null)
      throw new AppError("VALIDATION", "invalid_price", { field: "tendered" });
    const payment = await recordStaffPayment(db, ctx, {
      tableSessionId: String(fd.get("tableSessionId") ?? ""),
      participantId: fd.get("participantId") ? String(fd.get("participantId")) : null,
      provider: String(fd.get("provider") ?? "") as "cash",
      tenderedCents: tendered,
      idempotencyKey: String(fd.get("idempotencyKey") ?? ""),
    });
    refresh();
    return { amountCents: payment.amountCents };
  });
}

export async function refundAction(restaurantId: string, paymentId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const amount = parseMoney(String(fd.get("amount") ?? ""));
    if (!amount) throw new AppError("VALIDATION", "invalid_price", { field: "amount" });
    await refundPayment(db, ctx, paymentId, {
      amountCents: amount,
      reason: String(fd.get("reason") ?? ""),
    });
    refresh();
  });
}

export async function cancelPendingPaymentAction(restaurantId: string, paymentId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await cancelPendingPayment(db, ctx, paymentId);
    refresh();
  });
}
