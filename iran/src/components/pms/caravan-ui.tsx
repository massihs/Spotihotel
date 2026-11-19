"use client";

import { Copy, KeyRound, MoonStar, UsersRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { useRun } from "@/components/ui/sheet-kit";
import {
  caravanAction,
  caravanCheckInAction,
  featuresAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, inputCls } from "./kit";

/** A block run as a pilgrim caravan: programme, the leader's private page, check-in at once. */
export function CaravanPanel({
  rid,
  blockId,
  caravan,
  schedule,
  leaderUrl,
  canManage,
}: {
  rid: string;
  blockId: string;
  caravan: boolean;
  schedule: string | null;
  leaderUrl: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("caravan");
  const r = useRun();
  const [on, setOn] = useState(caravan);
  const [text, setText] = useState(schedule ?? "");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ done: number; waiting: number } | null>(null);
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <h3 className="flex items-center gap-2 font-bold">
        <span className="shade-fill grid size-9 place-items-center rounded-xl">
          <UsersRound className="size-[1.1rem]" aria-hidden="true" />
        </span>
        {t("title")}
      </h3>
      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={on}
          disabled={!canManage}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1 size-4"
        />
        <span>
          <span className="font-semibold">{t("enable")}</span>
          <span className="block text-xs text-fg-muted">{t("enableHint")}</span>
        </span>
      </label>
      {on ? (
        <label className="block text-sm">
          <span className="font-semibold">{t("schedule")}</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!canManage}
            rows={5}
            placeholder={t("schedulePlaceholder")}
            className={`${inputCls} mt-1 h-auto py-2 leading-7`}
          />
        </label>
      ) : null}
      {canManage ? (
        <Button
          size="sm"
          disabled={r.pending}
          onClick={() => r.run(() => caravanAction(rid, blockId, { caravan: on, schedule: text }))}
        >
          {t("save")}
        </Button>
      ) : null}
      {caravan && leaderUrl ? (
        <div className="space-y-2 rounded-xl bg-surface-2/70 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
            <KeyRound className="size-3.5" aria-hidden="true" />
            {t("leaderLink")}
          </p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2.5 py-2 text-xs">
              {leaderUrl}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(leaderUrl);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              {copied ? t("copied") : t("copy")}
            </Button>
          </div>
          {canManage ? (
            <Button
              className="w-full"
              disabled={r.pending}
              onClick={() =>
                r.run(async () => {
                  const res = await caravanCheckInAction(rid, blockId);
                  if (res?.ok && res.data) setResult(res.data as { done: number; waiting: number });
                  return res;
                })
              }
            >
              <UsersRound className="size-4" aria-hidden="true" />
              {t("checkInAll")}
            </Button>
          ) : null}
          {result ? <p className="text-sm font-semibold text-success">{t("checkedIn", result)}</p> : null}
        </div>
      ) : null}
      <FormError error={r.error} />
    </section>
  );
}

/** The hotel's own features: Ramadan dates, tips, the offer to early arrivals. */
export function FeaturesForm({
  rid,
  ramadan,
  tipsEnabled,
  readyOffer,
}: {
  rid: string;
  ramadan: { from?: string; to?: string };
  tipsEnabled: boolean;
  readyOffer: { enabled: boolean; pct: number };
}) {
  const t = useTranslations("caravan.features");
  const r = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      action={(fd) =>
        r.run(async () => {
          const res = await featuresAction(rid, {
            ramadan: {
              from: String(fd.get("rFrom") ?? "") || undefined,
              to: String(fd.get("rTo") ?? "") || undefined,
            },
            tips: { enabled: fd.get("tips") === "on", presets: [] },
            readyOffer: { enabled: fd.get("offer") === "on", pct: Number(fd.get("pct") || 0) },
          });
          if (res?.ok) setSaved(true);
          return res;
        })
      }
    >
      <h3 className="flex items-center gap-2 font-bold">
        <span className="shade-fill grid size-9 place-items-center rounded-xl">
          <MoonStar className="size-[1.1rem]" aria-hidden="true" />
        </span>
        {t("title")}
      </h3>
      <fieldset>
        <legend className="text-sm font-semibold">{t("ramadan")}</legend>
        <p className="text-xs text-fg-muted">{t("ramadanHint")}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <DateInput name="rFrom" defaultValue={ramadan.from} aria-label={t("from")} />
          <DateInput name="rTo" defaultValue={ramadan.to} aria-label={t("to")} />
        </div>
      </fieldset>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="tips" defaultChecked={tipsEnabled} className="mt-1 size-4" />
        <span>
          <span className="font-semibold">{t("tips")}</span>
          <span className="block text-xs text-fg-muted">{t("tipsHint")}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <label className="flex items-start gap-2.5">
          <input type="checkbox" name="offer" defaultChecked={readyOffer.enabled} className="mt-1 size-4" />
          <span>
            <span className="font-semibold">{t("offer")}</span>
            <span className="block text-xs text-fg-muted">{t("offerHint")}</span>
          </span>
        </label>
        <input
          name="pct"
          inputMode="numeric"
          defaultValue={readyOffer.pct}
          className={`${inputCls} w-20`}
          aria-label={t("pct")}
        />
        <span className="text-fg-muted">%</span>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={r.pending}>
          {t("save")}
        </Button>
        {saved ? <span className="text-sm text-success">{t("saved")}</span> : null}
      </div>
      <FormError error={r.error} />
    </form>
  );
}
