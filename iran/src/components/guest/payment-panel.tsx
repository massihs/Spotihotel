"use client";

import { Banknote, CreditCard, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import {
  cancelPaymentAction,
  getInvoiceAction,
  requestPaymentAction,
  startOnlinePaymentAction,
} from "@/app/[locale]/table/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type GuestPaymentView = {
  dueCents: number;
  pendingCents: number;
  paidCents: number;
  pending: { id: string; amountCents: number; redirectUrl: string | null } | null;
  methods: { online: string[]; offline: string[]; payLater: boolean };
  /** The guest's settled payments (each can produce an invoice). */
  history: { id: string; provider: string; status: string; amountCents: number }[];
};

const newKey = () => crypto.randomUUID().replaceAll("-", "");

/** Payment status → banner shown when the guest comes back from the PSP. */
function returnedKey(status: string) {
  if (status === "requires_action" || status === "pending") return "pending";
  if (status === "failed" || status === "cancelled") return status;
  return "succeeded"; // succeeded, or refunded since
}

/** "Pay my share": online checkout, or call the team to pay at the table. */
export function PaymentPanel({
  state,
  currency,
  returned,
}: {
  state: GuestPaymentView;
  currency: string;
  /** Status of the payment the guest just came back from (PSP return URL), if any. */
  returned: string | null;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const money = (c: number) => formatMoney(c, currency, locale);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [key, setKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);

  const fail = (code: string) => {
    setError(t.has(`errorCodes.${code}`) ? t(`errorCodes.${code}`) : t("errorCodes.internal"));
    setKey(newKey());
  };

  const payOnline = (provider: string) =>
    startTransition(async () => {
      setError(null);
      const res = await startOnlinePaymentAction(provider, key);
      if (!res || !res.ok) return fail(res?.ok === false ? res.error : "internal");
      if (res.data) window.location.assign(res.data.redirectUrl);
    });

  const cancel = (paymentId: string) =>
    startTransition(async () => {
      const res = await cancelPaymentAction(paymentId);
      if (res?.ok === false) fail(res.error);
    });

  const openInvoice = (paymentId: string) =>
    startTransition(async () => {
      setError(null);
      const res = await getInvoiceAction(paymentId);
      if (res?.ok && res.data) router.push(`/invoice/${res.data.token}`);
      else fail(res?.ok === false ? res.error : "internal");
    });

  const callStaff = (method: "cash" | "card" | "any") =>
    startTransition(async () => {
      setError(null);
      const res = await requestPaymentAction(method);
      setAsking(false);
      if (res?.ok) setToast(t("pay.staffNotified"));
      else fail(res?.ok === false ? res.error : "internal");
    });

  const offlineAvailable = state.methods.offline.length > 0 || state.methods.payLater;
  const nothingDue = state.dueCents === 0 && !state.pending;

  return (
    <section aria-labelledby="pay-title" className="mt-4 rounded-2xl border border-border bg-surface p-5">
      <h2 id="pay-title" className="flex items-center gap-2 text-lg font-semibold">
        <Wallet className="size-5" aria-hidden="true" />
        {t("pay.title")}
      </h2>

      {returned ? (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-2xl px-4 py-3 text-sm font-semibold",
            returnedKey(returned) === "succeeded"
              ? "bg-success-soft text-success"
              : returnedKey(returned) !== "pending"
                ? "bg-danger-soft text-danger"
                : "bg-surface-2 text-fg",
          )}
        >
          {t(`pay.returned.${returnedKey(returned)}`)}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex items-baseline justify-between">
          <dt className="font-medium">{t("pay.due")}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{money(state.dueCents)}</dd>
        </div>
        {state.paidCents > 0 ? (
          <div className="flex justify-between text-fg-muted">
            <dt>{t("pay.alreadyPaid")}</dt>
            <dd className="tabular-nums">{money(state.paidCents)}</dd>
          </div>
        ) : null}
      </dl>

      {state.history.some((p) => p.status !== "refunded") ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
          {state.history
            .filter((p) => p.status !== "refunded")
            .map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-fg-muted">
                  {t(`invoice.provider.${p.provider}`)} · {money(p.amountCents)}
                </span>
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => openInvoice(p.id)}>
                  {t("invoice.get")}
                </Button>
              </li>
            ))}
        </ul>
      ) : null}

      {state.pending ? (
        <div className="mt-3 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-medium">{t("pay.inProgress", { amount: money(state.pending.amountCents) })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.pending.redirectUrl ? (
              <a
                href={state.pending.redirectUrl}
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 font-semibold text-accent-fg"
              >
                {t("pay.resume")}
              </a>
            ) : null}
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => cancel(state.pending!.id)}>
              {t("pay.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {nothingDue ? (
        <p className="mt-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm font-bold text-accent-text">
          ✓ {t("pay.allSettled")}
        </p>
      ) : null}

      {state.dueCents > 0 ? (
        <div className="mt-5 grid gap-2.5">
          {state.methods.online.map((provider) => (
            <Button
              key={provider}
              size="xl"
              disabled={pending}
              aria-busy={pending}
              onClick={() => payOnline(provider)}
            >
              {provider === "mock_online"
                ? t("pay.payOnlineSimulated", { amount: money(state.dueCents) })
                : t("pay.payOnline", { amount: money(state.dueCents) })}
            </Button>
          ))}
          {offlineAvailable ? (
            asking ? (
              <div className="rounded-2xl bg-surface-2 p-4">
                <p className="text-sm font-bold">{t("pay.howAtTable")}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {state.methods.offline.includes("on_site_terminal") ? (
                    <Button variant="outline" size="lg" disabled={pending} onClick={() => callStaff("card")}>
                      <CreditCard className="size-5" aria-hidden="true" />
                      {t("pay.card")}
                    </Button>
                  ) : null}
                  {state.methods.offline.includes("cash") ? (
                    <Button variant="outline" size="lg" disabled={pending} onClick={() => callStaff("cash")}>
                      <Banknote className="size-5" aria-hidden="true" />
                      {t("pay.cash")}
                    </Button>
                  ) : null}
                </div>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAsking(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="xl"
                disabled={pending}
                onClick={() => (state.methods.offline.length > 0 ? setAsking(true) : callStaff("any"))}
              >
                {t("pay.payAtTable")}
              </Button>
            )
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Toast message={toast} onDone={clearToast} className="bottom-28" />
    </section>
  );
}
