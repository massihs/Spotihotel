import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider, PaymentWebhookEvent } from "./types";

/**
 * Stripe Checkout through the REST API (no SDK dependency).
 * NOT yet exercised against the live Stripe API in this repository (no keys in CI):
 * request shapes follow Stripe's documented API; webhook signature verification is unit-tested.
 *
 * Multi-tenant note: with `merchantAccount` set, calls are made on behalf of the restaurant's
 * Stripe Connect account (Stripe-Account header), so funds land on the restaurant's account.
 */
const API = "https://api.stripe.com/v1";
const TOLERANCE_SECONDS = 300;

function form(data: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) body.append(k, String(v));
  return body;
}

async function stripeRequest(
  path: string,
  body: URLSearchParams,
  opts: { idempotencyKey: string; account: string | null },
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": opts.idempotencyKey,
      ...(opts.account ? { "Stripe-Account": opts.account } : {}),
    },
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? res.statusText;
    throw new Error(`Stripe error: ${err}`);
  }
  return json;
}

/** Verifies the `Stripe-Signature` header (v1 = HMAC-SHA256 of `${t}.${body}`), with replay tolerance. */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!Number.isFinite(t) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return signatures.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
}

export const stripeProvider: PaymentProvider = {
  code: "stripe",
  kind: "online",
  async createPayment(input) {
    const session = await stripeRequest(
      "/checkout/sessions",
      form({
        mode: "payment",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": input.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": input.amountCents,
        "line_items[0][price_data][product_data][name]": input.description,
        client_reference_id: input.paymentId,
        "metadata[paymentId]": input.paymentId,
        "payment_intent_data[metadata][paymentId]": input.paymentId,
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
        // Stripe minimum: 30 minutes. An expired session sends checkout.session.expired → payment failed.
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      }),
      { idempotencyKey: input.idempotencyKey, account: input.merchantAccount },
    );
    return { status: "requires_action", redirectUrl: String(session.url), providerRef: String(session.id) };
  },

  async parseWebhook(rawBody, headers): Promise<PaymentWebhookEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !verifyStripeSignature(rawBody, headers.get("stripe-signature"), secret)) {
      throw new Error("Invalid Stripe signature");
    }
    const event = JSON.parse(rawBody) as { type: string; data: { object: Record<string, unknown> } };
    const obj = event.data.object;
    const paymentId = String(
      obj.client_reference_id ?? (obj.metadata as Record<string, string> | undefined)?.paymentId ?? "",
    );
    if (!paymentId) return { type: "ignored" };
    if (event.type === "checkout.session.completed" && obj.payment_status === "paid") {
      return {
        type: "payment.succeeded",
        paymentId,
        providerRef: String(obj.id),
        amountCents: typeof obj.amount_total === "number" ? obj.amount_total : undefined,
        extra: { paymentIntent: String(obj.payment_intent ?? "") },
      };
    }
    if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      return { type: "payment.failed", paymentId, providerRef: String(obj.id), reason: event.type };
    }
    return { type: "ignored" };
  },

  async refund({ metadata, amountCents, idempotencyKey }) {
    const paymentIntent = String(metadata.paymentIntent ?? "");
    if (!paymentIntent) throw new Error("Missing Stripe payment intent");
    const refund = await stripeRequest(
      "/refunds",
      form({ payment_intent: paymentIntent, amount: amountCents }),
      {
        idempotencyKey,
        account: (metadata.merchantAccount as string | undefined) ?? null,
      },
    );
    return { providerRef: String(refund.id) };
  },
};
