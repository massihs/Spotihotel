import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./types";

/**
 * DEVELOPMENT ONLY — a fake online PSP. The guest is sent to /pay/mock/{paymentId}, a page
 * clearly labelled "simulated", where they choose success or failure. Disabled in production
 * by the environment check (ENABLE_MOCK_PAYMENTS is refused when NODE_ENV=production).
 */
const secret = () => process.env.APP_SECRET ?? "";

export function mockSignature(paymentId: string) {
  return createHmac("sha256", secret()).update(`mock:${paymentId}`).digest("base64url");
}

export function verifyMockSignature(paymentId: string, sig: string) {
  const a = Buffer.from(mockSignature(paymentId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function mockEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.ENABLE_MOCK_PAYMENTS === "true" || process.env.ENABLE_MOCK_PAYMENTS === "1")
  );
}

export const mockProvider: PaymentProvider = {
  code: "mock_online",
  kind: "online",
  async createPayment(input) {
    if (!mockEnabled()) throw new Error("Mock payments are disabled");
    const url = new URL(`/pay/mock/${input.paymentId}`, process.env.APP_URL ?? "http://localhost:3000");
    url.searchParams.set("sig", mockSignature(input.paymentId));
    url.searchParams.set("return", input.returnUrl);
    return { status: "requires_action", redirectUrl: url.toString(), providerRef: `mock_${input.paymentId}` };
  },
  async refund() {
    return { providerRef: `mock_refund_${Date.now()}` };
  },
};
