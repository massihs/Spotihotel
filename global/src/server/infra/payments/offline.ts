import type { PaymentProvider, ProviderCode } from "./types";

/**
 * Cash / card terminal at the table: the staff member confirms they collected the money,
 * so the payment is recorded as succeeded immediately. Refunds are handed back in person.
 */
export function offlineProvider(code: Extract<ProviderCode, "cash" | "on_site_terminal">): PaymentProvider {
  return {
    code,
    kind: "offline",
    async createPayment() {
      return { status: "succeeded" };
    },
    async refund() {
      return {};
    },
  };
}
