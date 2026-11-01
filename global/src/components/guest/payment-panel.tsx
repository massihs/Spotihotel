"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useState, useTransition } from "react";
import {
  cancelPaymentAction,
  requestPaymentAction,
  startOnlinePaymentAction,
} from "@/app/[locale]/table/actions";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export type GuestPaymentView = {
  dueCents: number;
  pendingCents: number;
  paidCents: number;
  pending: { id: string; amountCents: number; redirectUrl: string | null } | null;
  methods: { online: string[]; offline: string[]; payLater: boolean };
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
  const format = useFormatter();
  const money = (c: number) => format.number(c / 100, { style: "currency", currency });
  const [pending, startTransition] = useTransition();
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
    <section aria-labelledby="pay-title" className="mt-5 rounded-2xl border border-border bg-surface p-4">
      <h2 id="pay-title" className="font-semibold">
        {t("pay.title")}
      </h2>

      {returned ? (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-xl px-3.5 py-2.5 text-sm font-medium",
            returnedKey(returned) === "succeeded"
              ? "bg-success-soft text-success"
              : returnedKey(returned) !== "pending"
                ? "bg-danger-soft text-danger"
                : "bg-accent-soft text-accent",
          )}
        >
          {t(`pay.returned.${returnedKey(returned)}`)}
        </p>
      ) : null}

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>{t("pay.due")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{money(state.dueCents)}</dd>
        </div>
        {state.paidCents > 0 ? (
          <div className="flex justify-between text-fg-muted">
            <dt>{t("pay.alreadyPaid")}</dt>
            <dd className="tabular-nums">{money(state.paidCents)}</dd>
          </div>
        ) : null}
      </dl>

      {state.pending ? (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-medium">{t("pay.inProgress", { amount: money(state.pending.amountCents) })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.pending.redirectUrl ? (
              <a
                href={state.pending.redirectUrl}
                className="inline-flex h-9 items-center rounded-lg bg-accent px-3 font-medium text-accent-fg"
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

      {nothingDue ? <p className="mt-3 text-sm font-medium text-success">✓ {t("pay.allSettled")}</p> : null}

      {state.dueCents > 0 ? (
        <div className="mt-4 grid gap-2">
          {state.methods.online.map((provider) => (
            <Button
              key={provider}
              size="lg"
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
              <div className="rounded-xl border border-border p-3">
                <p className="text-sm font-medium">{t("pay.howAtTable")}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {state.methods.offline.includes("on_site_terminal") ? (
                    <Button variant="secondary" disabled={pending} onClick={() => callStaff("card")}>
                      {t("pay.card")}
                    </Button>
                  ) : null}
                  {state.methods.offline.includes("cash") ? (
                    <Button variant="secondary" disabled={pending} onClick={() => callStaff("cash")}>
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
                variant="secondary"
                size="lg"
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
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Toast message={toast} onDone={clearToast} className="bottom-24" />
    </section>
  );
}
