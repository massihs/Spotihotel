"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import { updateFeedbackSettingsAction } from "./actions";

type Prize = { label: string; kind: "percent" | "amount" | "none"; value: number; weight: number };
type Row = { label: string; kind: Prize["kind"]; value: string; weight: string };

export function FeedbackSettingsForm({
  restaurantId,
  currency,
  disabled,
  values,
}: {
  restaurantId: string;
  currency: string;
  disabled: boolean;
  values: {
    feedbackSmsEnabled: boolean;
    feedbackDelayMinutes: number;
    wheelEnabled: boolean;
    wheelPrizes: Prize[];
  };
}) {
  const t = useTranslations("feedback.settings");
  const locale = useLocale();
  const [sms, setSms] = useState(values.feedbackSmsEnabled);
  const [delay, setDelay] = useState(String(values.feedbackDelayMinutes));
  const [wheel, setWheel] = useState(values.wheelEnabled);
  const [rows, setRows] = useState<Row[]>(
    values.wheelPrizes.map((p) => ({
      label: p.label,
      kind: p.kind,
      value: p.kind === "amount" ? centsToInput(p.value, locale, currency) : String(p.value),
      weight: String(p.weight),
    })),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = () =>
    startTransition(async () => {
      const wheelPrizes = rows
        .filter((r) => r.label.trim())
        .map((r) => ({
          label: r.label.trim(),
          kind: r.kind,
          value:
            r.kind === "amount"
              ? (parseMoneyInput(r.value, currency) ?? 0)
              : r.kind === "percent"
                ? Number(r.value) || 0
                : 0,
          weight: Math.max(0, Math.trunc(Number(r.weight) || 0)),
        }));
      const res = await updateFeedbackSettingsAction(restaurantId, {
        feedbackSmsEnabled: sms,
        feedbackDelayMinutes: Number(delay) || 0,
        wheelEnabled: wheel,
        wheelPrizes,
      });
      setMsg(res?.ok ? t("saved") : t("error"));
    });

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
        <Checkbox
          checked={sms}
          disabled={disabled}
          onChange={(e) => setSms(e.currentTarget.checked)}
          label={t("sms")}
          description={t("smsHint")}
        />
        <label className="flex items-center gap-3 text-sm">
          <span>{t("delay")}</span>
          <Input
            type="number"
            min={0}
            max={1440}
            value={delay}
            disabled={disabled || !sms}
            onChange={(e) => setDelay(e.currentTarget.value)}
            className="h-10 w-24"
          />
          <span className="text-fg-muted">{t("minutes")}</span>
        </label>
      </div>
      <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
        <Checkbox
          checked={wheel}
          disabled={disabled}
          onChange={(e) => setWheel(e.currentTarget.checked)}
          label={t("wheel")}
          description={t("wheelHint")}
        />
        {wheel ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_auto] items-center gap-2 border-b border-border pb-2 last:border-0"
              >
                <Input
                  value={r.label}
                  maxLength={60}
                  placeholder={t("prizeLabel")}
                  aria-label={t("prizeLabel")}
                  disabled={disabled}
                  onChange={(e) => set(i, { label: e.currentTarget.value })}
                  className="col-span-4 h-10"
                />
                <select
                  value={r.kind}
                  disabled={disabled}
                  onChange={(e) => set(i, { kind: e.currentTarget.value as Row["kind"] })}
                  className="h-10 rounded-lg border border-border bg-surface px-2 text-sm"
                  aria-label={t("kind")}
                >
                  <option value="percent">{t("kindPercent")}</option>
                  <option value="amount">{t("kindAmount")}</option>
                  <option value="none">{t("kindNone")}</option>
                </select>
                <Input
                  value={r.value}
                  inputMode="numeric"
                  disabled={disabled || r.kind === "none"}
                  aria-label={t("value")}
                  placeholder={r.kind === "percent" ? "%" : t("value")}
                  onChange={(e) => set(i, { value: e.currentTarget.value })}
                  className="h-10"
                />
                <Input
                  value={r.weight}
                  inputMode="numeric"
                  disabled={disabled}
                  aria-label={t("weight")}
                  title={t("weight")}
                  onChange={(e) => set(i, { weight: e.currentTarget.value })}
                  className="h-10"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={t("remove")}
                  onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            {rows.length < 8 ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  setRows((x) => [...x, { label: "", kind: "percent", value: "10", weight: "1" }])
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("addPrize")}
              </Button>
            ) : null}
            <p className="text-xs text-fg-muted">{t("weightHint")}</p>
          </div>
        ) : null}
      </div>
      {!disabled ? (
        <div className="flex items-center gap-3">
          <Button disabled={pending} onClick={save}>
            {t("save")}
          </Button>
          {msg ? <span className="text-sm text-fg-muted">{msg}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
