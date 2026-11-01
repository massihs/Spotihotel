"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import { updateKpiGoalsAction } from "./online-actions";

export function GoalsForm({
  restaurantId,
  currency,
  disabled,
  values,
}: {
  restaurantId: string;
  currency: string;
  disabled: boolean;
  values: { dailyRevenueCents?: number | null; maxPrepMinutes?: number | null; minRating?: number | null };
}) {
  const t = useTranslations("kpi.settings");
  const locale = useLocale();
  const [revenue, setRevenue] = useState(
    values.dailyRevenueCents ? centsToInput(values.dailyRevenueCents, locale, currency) : "",
  );
  const [prep, setPrep] = useState(values.maxPrepMinutes ? String(values.maxPrepMinutes) : "");
  const [rating, setRating] = useState(values.minRating ? String(values.minRating) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateKpiGoalsAction(restaurantId, {
            dailyRevenueCents: revenue.trim() ? parseMoneyInput(revenue, currency) : null,
            maxPrepMinutes: prep.trim() ? Number(prep) : null,
            minRating: rating.trim() ? Number(rating.replace(",", ".")) : null,
          });
          setMsg(res?.ok ? t("saved") : t("error"));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("revenue")}</span>
          <Input
            value={revenue}
            inputMode="numeric"
            disabled={disabled}
            placeholder={t("none")}
            onChange={(e) => setRevenue(e.currentTarget.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("prep")}</span>
          <Input
            value={prep}
            type="number"
            min={1}
            max={240}
            disabled={disabled}
            placeholder={t("none")}
            onChange={(e) => setPrep(e.currentTarget.value)}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">{t("rating")}</span>
          <Input
            value={rating}
            inputMode="decimal"
            disabled={disabled}
            placeholder={t("none")}
            onChange={(e) => setRating(e.currentTarget.value)}
          />
        </label>
      </div>
      <p className="text-xs text-fg-muted">{t("hint")}</p>
      {!disabled ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          {msg ? <span className="text-sm text-fg-muted">{msg}</span> : null}
        </div>
      ) : null}
    </form>
  );
}
