import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { mockEnabled, verifyMockSignature } from "@/server/infra/payments/mock";
import { getPaymentForCheckout } from "@/server/modules/payments/service";
import { SubmitButton } from "@/components/ui/form";
import { completeMockPaymentAction } from "./actions";

export const metadata: Metadata = { robots: { index: false }, referrer: "no-referrer" };

/**
 * DEVELOPMENT ONLY — simulated checkout page of the mock PSP ("mock_online").
 * Clearly labelled; unavailable when mock payments are disabled (always in production).
 */
export default function MockCheckoutPage(props: PageProps<"/[locale]/pay/mock/[paymentId]">) {
  return (
    <Suspense
      fallback={<div className="mx-auto mt-24 h-64 max-w-md animate-pulse rounded-2xl bg-surface-2" />}
    >
      <MockCheckout {...props} />
    </Suspense>
  );
}

async function MockCheckout({ params, searchParams }: PageProps<"/[locale]/pay/mock/[paymentId]">) {
  const [{ paymentId }, sp] = await Promise.all([params, searchParams]);
  const sig = typeof sp.sig === "string" ? sp.sig : "";
  const ret = typeof sp.return === "string" ? sp.return : "";
  if (!mockEnabled() || !verifyMockSignature(paymentId, sig)) notFound();
  const [payment, t, format] = await Promise.all([
    getPaymentForCheckout(db, paymentId),
    getTranslations("mockPay"),
    getFormatter(),
  ]);
  if (!payment || payment.provider !== "mock_online") notFound();
  const pending = payment.status === "pending" || payment.status === "requires_action";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p
        role="note"
        className="rounded-xl border-2 border-dashed border-warning bg-warning-soft px-4 py-3 text-center text-sm font-semibold text-warning"
      >
        {t("banner")}
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-fg-muted">{payment.restaurantName}</p>
        <p className="mt-2 text-4xl font-semibold tabular-nums">
          {format.number(payment.amountCents / 100, { style: "currency", currency: payment.currency })}
        </p>
        <p className="mt-2 text-sm text-fg-muted">{t("explain")}</p>
        {pending ? (
          <div className="mt-6 grid gap-3">
            {(["success", "failure"] as const).map((outcome) => (
              <form key={outcome} action={completeMockPaymentAction}>
                <input type="hidden" name="paymentId" value={payment.id} />
                <input type="hidden" name="sig" value={sig} />
                <input type="hidden" name="return" value={ret} />
                <input type="hidden" name="outcome" value={outcome} />
                <SubmitButton
                  variant={outcome === "success" ? "primary" : "secondary"}
                  className="h-12 w-full"
                >
                  {t(outcome)}
                </SubmitButton>
              </form>
            ))}
          </div>
        ) : (
          <p className="mt-6 font-medium">{t("alreadyProcessed")}</p>
        )}
      </div>
    </main>
  );
}
