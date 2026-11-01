"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { startCheckoutAction } from "./actions";

export type CheckoutPlan = {
  code: string;
  name: string;
  priceMonthlyCents: number;
  features: string[];
};

const MONTHS = [1, 3, 12] as const;

/** Pick a plan and a duration, then off to Zarinpal. */
export function Checkout({
  restaurantId,
  plans,
  currency,
  currentPlan,
  canPay,
}: {
  restaurantId: string;
  plans: CheckoutPlan[];
  currency: string;
  currentPlan: string | null;
  canPay: boolean;
}) {
  const t = useTranslations("billing");
  const te = useTranslations();
  const locale = useLocale();
  const [plan, setPlan] = useState(
    currentPlan && plans.some((p) => p.code === currentPlan) ? currentPlan : plans[0]?.code,
  );
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const chosen = plans.find((p) => p.code === plan);
  const total = chosen ? chosen.priceMonthlyCents * (months === 12 ? 10 : months) : 0;
  const money = (c: number) => formatMoney(c, currency, locale);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <button
            key={p.code}
            type="button"
            onClick={() => setPlan(p.code)}
            aria-pressed={plan === p.code}
            className={cn(
              "flex flex-col rounded-2xl border-2 bg-surface p-4 text-start transition-colors",
              plan === p.code ? "border-accent" : "border-border hover:border-fg-subtle",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-bold">{p.name}</p>
              {plan === p.code ? <Check className="size-5 text-accent" aria-hidden="true" /> : null}
            </div>
            <p className="mt-1 text-sm">
              <span className="text-xl font-bold tabular-nums">{money(p.priceMonthlyCents)}</span>{" "}
              <span className="text-fg-muted">{t("perMonth")}</span>
            </p>
            {p.features.length ? (
              <ul className="mt-3 space-y-1 text-sm text-fg-muted">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            ) : null}
          </button>
        ))}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("duration")}</legend>
        <div className="flex flex-wrap gap-2">
          {MONTHS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonths(m)}
              aria-pressed={months === m}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold",
                months === m ? "border-fg bg-fg text-bg" : "border-border bg-surface hover:border-fg-subtle",
              )}
            >
              {t("months", { count: m })}
              {m === 12 ? <span className="ms-1.5 text-success">{t("twoFree")}</span> : null}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4">
        <p className="text-sm">
          {t("total")} <span className="text-xl font-bold tabular-nums">{money(total)}</span>
        </p>
        <Button
          size="lg"
          disabled={!canPay || !chosen || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await startCheckoutAction(restaurantId, chosen!.code, months);
              if (res?.ok && res.data?.redirectUrl) {
                window.location.assign(res.data.redirectUrl);
                return;
              }
              const key = `errorCodes.${res?.ok === false ? res.error : "internal"}`;
              setError(te.has(key) ? te(key) : te("errorCodes.internal"));
            })
          }
        >
          {pending ? t("redirecting") : t("pay")}
        </Button>
      </div>
      {!canPay ? <p className="text-sm text-fg-muted">{t("ownerOnly")}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
