"use client";

import { Coins, Plus, RefreshCw, Trash2 } from "@/components/icons";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import { applyShieldAction, saveShieldAction } from "@/app/[locale]/dashboard/[restaurantId]/shield/actions";
import { FormError, inputCls } from "./kit";

type Row = {
  id: string;
  code: string;
  name: string;
  indexCurrency: string | null;
  indexAmountCents: number | null;
  baseRateCents: number;
  targetCents: number | null;
};

/** Suggested codes: dollar, euro, dirham, lira, and the Emami gold coin (XAU here). */
const SUGGESTED = ["USD", "EUR", "AED", "TRY", "XAU"];

/** Rates of the currencies and the room types priced in them. */
export function ShieldForm({
  rid,
  currency,
  currencies,
  shield,
  rows,
  canManage,
}: {
  rid: string;
  currency: string;
  currencies: { code: string; rateCents: number }[];
  shield: { maxDailyChangeBps: number; roundCents: number };
  rows: Row[];
  canManage: boolean;
}) {
  const t = useTranslations("shield");
  const locale = useLocale();
  const money = useMoney(currency);
  const r = useRun();
  const [list, setList] = useState(currencies.length ? currencies : [{ code: "USD", rateCents: 0 }]);
  const [types, setTypes] = useState(
    rows.map((x) => ({
      id: x.id,
      indexCurrency: x.indexCurrency ?? "",
      amount: x.indexAmountCents ? String(x.indexAmountCents / 100) : "",
    })),
  );
  const [done, setDone] = useState<number | null>(null);

  const submit = (fd: FormData) =>
    r.run(async () => {
      const res = await saveShieldAction(rid, {
        currencies: list
          .map((c, i) => ({
            code: c.code,
            rateCents: parseMoneyInput(String(fd.get(`rate-${i}`) ?? ""), currency) ?? 0,
          }))
          .filter((c) => c.code && c.rateCents > 0),
        maxDailyChangeBps: Math.round(Number(fd.get("maxPct") || 0) * 100),
        roundCents: parseMoneyInput(String(fd.get("round") ?? ""), currency) || shield.roundCents,
        types: types.map((x) => ({
          id: x.id,
          indexCurrency: x.indexCurrency || null,
          indexAmountCents: x.amount ? Math.round(Number(x.amount.replace(",", ".")) * 100) : null,
        })),
      });
      if (res && res.ok) setDone(res.data?.changed ?? 0);
      return res;
    });

  return (
    <form action={submit} className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="flex items-center gap-2 font-bold">
          <span className="shade-fill k-cut grid size-9 place-items-center">
            <Coins className="size-[1.1rem]" aria-hidden="true" />
          </span>
          {t("ratesTitle")}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">{t("ratesHint")}</p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c, i) => (
            <li key={i} className="space-y-2 rounded-xl bg-surface-2/60 p-3">
              <div className="flex items-center gap-2">
                <input
                  list="shield-codes"
                  value={c.code}
                  disabled={!canManage}
                  onChange={(e) =>
                    setList(list.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))
                  }
                  className={`${inputCls} w-24 font-mono font-bold uppercase`}
                  maxLength={3}
                  aria-label={t("code")}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg-muted">
                  {t.has(`codes.${c.code}`) ? t(`codes.${c.code}` as "codes.USD") : ""}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setList(list.filter((_, j) => j !== i))}
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-surface"
                    aria-label={t("remove")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <MoneyField
                name={`rate-${i}`}
                currency={currency}
                label={t("rateOf", { code: c.code || "…" })}
                defaultValue={centsToInput(c.rateCents || null, locale, currency)}
                disabled={!canManage}
              />
            </li>
          ))}
        </ul>
        <datalist id="shield-codes">
          {SUGGESTED.map((s) => (
            <option key={s} value={s}>
              {t.has(`codes.${s}`) ? t(`codes.${s}`) : s}
            </option>
          ))}
        </datalist>
        {canManage ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setList([...list, { code: "", rateCents: 0 }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addCurrency")}
          </Button>
        ) : null}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]">
        <div className="shade-wash border-b border-border px-5 py-4">
          <h2 className="font-bold">{t("typesTitle")}</h2>
          <p className="mt-1 text-sm text-fg-muted">{t("typesHint")}</p>
        </div>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="shade-head border-b border-border text-xs text-fg-muted">
            <tr>
              <th className="px-4 py-3 text-start">{t("type")}</th>
              <th className="px-4 py-3 text-start">{t("indexedIn")}</th>
              <th className="px-4 py-3 text-end">{t("today")}</th>
              <th className="px-4 py-3 text-end">{t("target")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((x, i) => {
              const v = types[i]!;
              const gap = x.targetCents
                ? Math.round(((x.targetCents - x.baseRateCents) / x.baseRateCents) * 100)
                : null;
              return (
                <tr key={x.id}>
                  <td className="px-4 py-3">
                    <span className="shade-soft me-2 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold">
                      {x.code}
                    </span>
                    <span className="font-semibold">{x.name}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <select
                        value={v.indexCurrency}
                        disabled={!canManage}
                        onChange={(e) =>
                          setTypes(
                            types.map((y, j) => (j === i ? { ...y, indexCurrency: e.target.value } : y)),
                          )
                        }
                        className={`${inputCls} w-28`}
                        aria-label={t("indexedIn")}
                      >
                        <option value="">{t("rialOnly")}</option>
                        {list
                          .filter((c) => c.code)
                          .map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                      </select>
                      {v.indexCurrency ? (
                        <input
                          inputMode="decimal"
                          dir="ltr"
                          value={v.amount}
                          disabled={!canManage}
                          onChange={(e) =>
                            setTypes(types.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))
                          }
                          placeholder="85"
                          className={`${inputCls} w-28 text-end tabular-nums`}
                          aria-label={t("amountIn", { code: v.indexCurrency })}
                        />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-end font-semibold tabular-nums">{money(x.baseRateCents)}</td>
                  <td className="px-4 py-3 text-end tabular-nums">
                    {x.targetCents ? (
                      <>
                        <span className="block font-bold">{money(x.targetCents)}</span>
                        {gap ? (
                          <span className={`text-xs ${gap > 0 ? "text-warning" : "text-success"}`}>
                            {gap > 0 ? "+" : ""}
                            {gap}%
                          </span>
                        ) : (
                          <span className="text-xs text-success">{t("inLine")}</span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)] sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold">{t("maxPct")}</span>
          <span className="block text-xs text-fg-muted">{t("maxPctHint")}</span>
          <input
            name="maxPct"
            inputMode="decimal"
            defaultValue={String(shield.maxDailyChangeBps / 100)}
            disabled={!canManage}
            className={`${inputCls} mt-2 w-32`}
          />
        </label>
        <div className="text-sm">
          <MoneyField
            name="round"
            currency={currency}
            label={t("round")}
            hint={t("roundHint")}
            defaultValue={centsToInput(shield.roundCents, locale, currency)}
            disabled={!canManage}
          />
        </div>
      </section>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={r.pending}>
            {t("save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={r.pending}
            onClick={() =>
              r.run(async () => {
                const res = await applyShieldAction(rid);
                if (res && res.ok) setDone(res.data?.changed ?? 0);
                return res;
              })
            }
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {t("applyNow")}
          </Button>
          {done != null ? <span className="text-sm text-success">{t("applied", { n: done })}</span> : null}
          <FormError error={r.error} />
        </div>
      ) : null}
    </form>
  );
}
