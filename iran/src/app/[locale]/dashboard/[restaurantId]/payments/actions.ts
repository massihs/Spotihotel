"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
import { parseMoneyInput } from "@/lib/money";
import { issueInvoiceAsStaff } from "@/server/modules/invoices/service";
import { cancelPendingPayment, recordStaffPayment, refundPayment } from "@/server/modules/payments/service";

/** Cash / terminal collected for a table, a guest or one order. The amount is computed server-side. */
export async function recordPaymentAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const tenderedRaw = String(fd.get("tendered") ?? "").trim();
    const tendered = tenderedRaw ? parseMoneyInput(tenderedRaw, ctx.restaurant.currency) : null;
    if (tenderedRaw && tendered === null)
      throw new AppError("VALIDATION", "invalid_price", { field: "tendered" });
    const payment = await recordStaffPayment(db, ctx, {
      tableSessionId: fd.get("tableSessionId") ? String(fd.get("tableSessionId")) : null,
      orderId: fd.get("orderId") ? String(fd.get("orderId")) : null,
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
    const amount = parseMoneyInput(String(fd.get("amount") ?? ""), ctx.restaurant.currency);
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

/** Issues (or reopens) the invoice of a payment; buyer details make it a named invoice. */
export async function issueInvoiceAction(
  restaurantId: string,
  paymentId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const f = (k: string) => String(fd.get(k) ?? "");
    const buyer = f("buyerName").trim()
      ? {
          name: f("buyerName"),
          nationalId: f("buyerNationalId"),
          economicCode: f("buyerEconomicCode"),
          phone: f("buyerPhone"),
          address: f("buyerAddress"),
          postalCode: f("buyerPostalCode"),
        }
      : null;
    const invoice = await issueInvoiceAsStaff(db, ctx, paymentId, buyer);
    refresh();
    return { token: invoice.publicToken, number: invoice.number };
  });
}
