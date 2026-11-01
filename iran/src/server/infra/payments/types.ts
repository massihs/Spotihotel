/**
 * Payment provider abstraction. Business code never talks to a PSP directly:
 * it asks the registry for a provider and handles the normalized results.
 */
export const PROVIDER_CODES = [
  "cash",
  "on_site_terminal",
  "pay_later",
  "mock_online",
  "stripe",
  "zarinpal",
] as const;
export type ProviderCode = (typeof PROVIDER_CODES)[number];

/** offline = recorded by staff (money changes hands at the table); online = the guest pays on their phone. */
export type ProviderKind = "offline" | "online";

export type CreatePaymentInput = {
  paymentId: string;
  amountCents: number;
  currency: string;
  description: string;
  /** Where the guest lands at the end (our payment status page). */
  returnUrl: string;
  /**
   * Our server endpoint the PSP redirects the guest to (redirect-based PSPs such as Zarinpal,
   * which confirm through that redirect instead of a webhook).
   */
  callbackUrl: string;
  /** Idempotency key forwarded to the PSP, so retries never charge twice. */
  idempotencyKey: string;
  /**
   * The restaurant's account at the PSP (e.g. a Stripe Connect account id).
   * Null while the platform has not onboarded the restaurant.
   */
  merchantAccount: string | null;
};

export type CreatePaymentResult =
  | { status: "succeeded"; providerRef?: string }
  | { status: "requires_action"; redirectUrl: string; providerRef: string };

/** Normalized webhook outcome. */
export type PaymentWebhookEvent =
  | {
      type: "payment.succeeded";
      paymentId: string;
      providerRef: string;
      /** Amount the PSP actually captured, checked against our record before confirming. */
      amountCents?: number;
      extra?: Record<string, string>;
    }
  | { type: "payment.failed"; paymentId: string; providerRef: string; reason?: string }
  | { type: "ignored" };

export interface PaymentProvider {
  code: ProviderCode;
  kind: ProviderKind;
  /** Online providers start a checkout; offline providers simply succeed (staff confirmed it). */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /**
   * Redirect-based PSPs: called when the guest comes back to `callbackUrl`. Must confirm the
   * outcome server-to-server with the PSP (the query string alone is never trusted).
   */
  verifyReturn?(input: {
    query: URLSearchParams;
    payment: {
      id: string;
      amountCents: number;
      currency: string;
      providerRef: string | null;
      /** Merchant account used when the payment was created (must be reused to verify it). */
      merchantAccount: string | null;
    };
  }): Promise<PaymentWebhookEvent>;
  /** Verifies the signature and parses a webhook. Throws on an invalid signature. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent>;
  refund(input: {
    providerRef: string | null;
    metadata: Record<string, unknown>;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{
    providerRef?: string;
  }>;
}
