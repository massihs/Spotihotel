"use client";

import { ArrowLeftRight, Building2, Lock, Plus, Search, Trash2, Unlock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  closeShiftAction,
  moveLinesAction,
  openShiftAction,
  saveCashierSettingsAction,
  searchFoliosAction,
} from "@/app/[locale]/dashboard/[restaurantId]/cashier/actions";
import { transferToAccountAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { useLineLabel } from "./folio-panel";
import { FormError, Label, inputCls, useDay } from "./kit";

type Currency = { code: string; rateCents: number };
const card = "rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]";
const toCents = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, "")) * 100) || 0;

/** تحویل صندوق: open the shift with a float; close it by counting the cash and handing it over. */
export function ShiftPanel({
  rid,
  currency,
  shift,
  currencies,
  colleagues,
  defaultFloatCents,
}: {
  rid: string;
  currency: string;
  shift: {
    openedAt: string;
    openingFloatCents: number;
    expectedCashCents: number;
    byMethod: Record<string, number>;
    foreign: Record<string, number>;
    count: number;
  } | null;
  currencies: Currency[];
  colleagues: { id: string; name: string }[];
  defaultFloatCents: number;
}) {
  const t = useTranslations("cashier");
  const tPay = useTranslations("pms.method");
  const money = useMoney(currency);
  const r = useRun();
  const [result, setResult] = useState<{ differenceCents: number; expectedCashCents: number } | null>(null);
  const factor = currency === "IRR" ? 1000 : 100;
  const asInput = (c: number) =>
    String(currency === "IRR" ? Math.round(c / factor) : (c / factor).toFixed(2));

  if (!shift)
    return (
      <div className={card}>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Unlock className="size-5 text-accent-text" aria-hidden="true" />
          {t("openTitle")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">{t("openHint")}</p>
        {result ? (
          <p
            className={cn(
              "mb-4 rounded-xl px-4 py-3 text-sm font-semibold",
              result.differenceCents === 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
            )}
          >
            {result.differenceCents === 0
              ? t("closedExact")
              : t("closedDiff", { amount: money(result.differenceCents) })}
          </p>
        ) : null}
        <form
          className="flex flex-wrap items-end gap-3"
          action={(fd) =>
            r.run(() => openShiftAction(rid, parseMoneyInput(String(fd.get("float") ?? ""), currency) ?? 0))
          }
        >
          <div className="w-56">
            <MoneyField
              name="float"
              currency={currency}
              label={t("float")}
              defaultValue={asInput(defaultFloatCents)}
            />
          </div>
          <Button type="submit" disabled={r.pending}>
            {t("open")}
          </Button>
        </form>
        <div className="mt-2">
          <FormError error={r.error} />
        </div>
      </div>
    );

  const opened = new Date(shift.openedAt);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className={card}>
        <h2 className="text-lg font-bold">{t("currentTitle")}</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {t("since", { time: opened.toLocaleString(), n: shift.count })}
        </p>
        <dl className="mt-4 divide-y divide-border text-sm">
          <div className="flex justify-between py-2">
            <dt className="text-fg-muted">{t("float")}</dt>
            <dd className="tabular-nums">{money(shift.openingFloatCents)}</dd>
          </div>
          {Object.entries(shift.byMethod).map(([m, v]) => (
            <div key={m} className="flex justify-between py-2">
              <dt className="text-fg-muted">{tPay.has(m as "cash") ? tPay(m as "cash") : m}</dt>
              <dd className="tabular-nums">{money(v)}</dd>
            </div>
          ))}
          {Object.entries(shift.foreign).map(([c, v]) => (
            <div key={c} className="flex justify-between py-2">
              <dt className="text-fg-muted">{t("foreignCash", { code: c })}</dt>
              <dd className="tabular-nums" dir="ltr">
                {(v / 100).toLocaleString()} {c}
              </dd>
            </div>
          ))}
          <div className="flex justify-between py-2.5 text-base font-bold">
            <dt>{t("expectedCash")}</dt>
            <dd className="tabular-nums">{money(shift.expectedCashCents)}</dd>
          </div>
        </dl>
      </div>
      <form
        className={card}
        action={(fd) =>
          r.run(async () => {
            const res = await closeShiftAction(rid, {
              countedCashCents: parseMoneyInput(String(fd.get("counted") ?? ""), currency) ?? 0,
              countedForeign: Object.fromEntries(
                currencies.map((c) => [c.code, toCents(String(fd.get(`fx-${c.code}`) ?? ""))]),
              ),
              handedToUserId: String(fd.get("handedTo") ?? "") || null,
              note: String(fd.get("note") ?? ""),
            });
            if (res?.ok && res.data) setResult(res.data);
            return res;
          })
        }
      >
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Lock className="size-5 text-accent-text" aria-hidden="true" />
          {t("closeTitle")}
        </h2>
        <p className="mt-1 mb-4 text-sm text-fg-muted">{t("closeHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <MoneyField name="counted" currency={currency} label={t("countedCash")} required />
          {currencies.map((c) => (
            <label key={c.code} className="block">
              <Label>{t("countedForeign", { code: c.code })}</Label>
              <input
                name={`fx-${c.code}`}
                className={inputCls}
                inputMode="decimal"
                dir="ltr"
                defaultValue={shift.foreign[c.code] ? String(shift.foreign[c.code]! / 100) : ""}
              />
            </label>
          ))}
          <label className="block">
            <Label>{t("handedTo")}</Label>
            <select name="handedTo" className={inputCls} defaultValue="">
              <option value="">{t("nobody")}</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <Label>{t("note")}</Label>
            <input name="note" className={inputCls} maxLength={500} />
          </label>
        </div>
        <div className="mt-3">
          <FormError error={r.error} />
        </div>
        <Button type="submit" className="mt-3 w-full" disabled={r.pending}>
          {t("close")}
        </Button>
      </form>
    </div>
  );
}

/** Cashier settings: the default float and the foreign currencies taken, with their rate. */
export function CashierSettingsForm({
  rid,
  currency,
  settings,
  canEdit,
}: {
  rid: string;
  currency: string;
  settings: { deskFloatCents: number; currencies: Currency[] };
  canEdit: boolean;
}) {
  const t = useTranslations("cashier");
  const r = useRun();
  const factor = currency === "IRR" ? 1000 : 100;
  const asInput = (c: number) =>
    String(currency === "IRR" ? Math.round(c / factor) : (c / factor).toFixed(2));
  const [rows, setRows] = useState(
    settings.currencies.map((c) => ({ code: c.code, rate: asInput(c.rateCents) })),
  );
  const [saved, setSaved] = useState(false);
  return (
    <form
      className={cn(card, "max-w-2xl")}
      action={(fd) =>
        r.run(
          () =>
            saveCashierSettingsAction(rid, {
              deskFloatCents: parseMoneyInput(String(fd.get("float") ?? ""), currency) ?? 0,
              currencies: rows
                .filter((x) => x.code.trim())
                .map((x) => ({
                  code: x.code.trim().toUpperCase(),
                  rateCents: parseMoneyInput(x.rate, currency) ?? 0,
                })),
            }),
          () => setSaved(true),
        )
      }
    >
      <div className="w-60">
        <MoneyField
          name="float"
          currency={currency}
          label={t("defaultFloat")}
          defaultValue={asInput(settings.deskFloatCents)}
          disabled={!canEdit}
        />
      </div>
      <h3 className="mt-5 mb-1 font-semibold">{t("currencies")}</h3>
      <p className="mb-3 text-sm text-fg-muted">{t("currenciesHint")}</p>
      <div className="space-y-2">
        {rows.map((x, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={cn(inputCls, "w-24 uppercase")}
              value={x.code}
              maxLength={3}
              placeholder="USD"
              dir="ltr"
              disabled={!canEdit}
              onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, code: e.target.value } : y)))}
              aria-label={t("code")}
            />
            <span className="text-sm text-fg-muted">=</span>
            <input
              className={inputCls}
              value={x.rate}
              inputMode="numeric"
              dir="ltr"
              disabled={!canEdit}
              onChange={(e) => setRows(rows.map((y, j) => (j === i ? { ...y, rate: e.target.value } : y)))}
              aria-label={t("rate")}
            />
            {canEdit ? (
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center rounded-xl text-fg-muted ring-1 ring-border hover:text-danger"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                aria-label={t("remove")}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setRows([...rows, { code: "", rate: "" }])}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("addCurrency")}
          </Button>
          <div className="mt-3">
            <FormError error={r.error} />
          </div>
          {saved ? <p className="mt-2 text-sm text-success">{t("saved")}</p> : null}
          <Button type="submit" className="mt-4" disabled={r.pending}>
            {t("save")}
          </Button>
        </>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">{t("readOnly")}</p>
      )}
    </form>
  );
}

type FolioHit = {
  id: string;
  number: number;
  holder: string;
  room: string | null;
  stay: number | null;
  account: boolean;
  balanceCents: number;
  lines: {
    id: string;
    businessDate: string;
    kind: string;
    department: string;
    description: string;
    method: string | null;
    amountCents: number;
    quantity: number;
  }[];
};

/** Finds an open folio by booking or folio number, room, guest or company. */
function FolioFinder({
  rid,
  currency,
  label,
  picked,
  onPick,
  exclude,
}: {
  rid: string;
  currency: string;
  label: string;
  picked: FolioHit | null;
  onPick: (f: FolioHit | null) => void;
  exclude?: string;
}) {
  const t = useTranslations("cashier");
  const money = useMoney(currency);
  const r = useRun();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<FolioHit[] | null>(null);
  if (picked)
    return (
      <div className="rounded-xl bg-accent-soft p-3 ring-1 ring-accent/30">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <b>{t("folioN", { n: picked.number })}</b> — {picked.holder}
            {picked.room ? ` | ${t("roomN", { room: picked.room })}` : ""}
          </span>
          <button
            type="button"
            className="text-sm font-semibold text-accent-text"
            onClick={() => onPick(null)}
          >
            {t("change")}
          </button>
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          {t("balance")}: <b className="tabular-nums">{money(picked.balanceCents)}</b>
        </p>
      </div>
    );
  return (
    <div>
      <Label>{label}</Label>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          r.run(async () => {
            const res = await searchFoliosAction(rid, q);
            if (res?.ok) setHits((res.data as FolioHit[]).filter((f) => f.id !== exclude));
            return res;
          });
        }}
      >
        <input
          className={inputCls}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("findHint")}
        />
        <Button type="submit" variant="secondary" disabled={r.pending || !q.trim()}>
          <Search className="size-4" aria-hidden="true" />
        </Button>
      </form>
      <FormError error={r.error} />
      {hits ? (
        hits.length ? (
          <ul className="mt-2 divide-y divide-border rounded-xl ring-1 ring-border">
            {hits.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-sm hover:bg-surface-2"
                >
                  <span>
                    <b>{t("folioN", { n: f.number })}</b> — {f.holder}
                    {f.room ? ` | ${t("roomN", { room: f.room })}` : ""}
                    {f.account ? (
                      <Building2 className="ms-1 inline size-3.5 text-fg-muted" aria-label={t("company")} />
                    ) : null}
                  </span>
                  <span className="text-fg-muted tabular-nums">{money(f.balanceCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">{t("noFolio")}</p>
        )
      ) : null}
    </div>
  );
}

/** جابجایی حساب: postings moved from one open folio to another (a wrong room, a split bill). */
export function MoveLines({ rid, currency }: { rid: string; currency: string }) {
  const t = useTranslations("cashier");
  const money = useMoney(currency);
  const day = useDay();
  const label = useLineLabel();
  const r = useRun();
  const [from, setFrom] = useState<FolioHit | null>(null);
  const [to, setTo] = useState<FolioHit | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<number | null>(null);
  const movable = (from?.lines ?? []).filter((l) => l.kind !== "transfer");
  return (
    <div className={cn(card, "space-y-4")}>
      <p className="text-sm text-fg-muted">{t("moveHint")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <FolioFinder
          rid={rid}
          currency={currency}
          label={t("fromFolio")}
          picked={from}
          onPick={(f) => {
            setFrom(f);
            setSel(new Set());
            setDone(null);
          }}
        />
        <FolioFinder
          rid={rid}
          currency={currency}
          label={t("toFolio")}
          picked={to}
          onPick={setTo}
          exclude={from?.id}
        />
      </div>
      {from ? (
        movable.length ? (
          <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
            {movable.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={sel.has(l.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(l.id);
                      else n.delete(l.id);
                      setSel(n);
                    }}
                  />
                  <span className="w-16 text-xs text-fg-muted">{day(l.businessDate)}</span>
                  <span className="flex-1">
                    {label(l)}
                    {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                  </span>
                  <span className={cn("tabular-nums", l.amountCents < 0 && "text-success")}>
                    {money(l.amountCents)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">{t("nothingToMove")}</p>
        )
      ) : null}
      {done !== null ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{t("moved", { n: done })}</p>
      ) : null}
      <FormError error={r.error} />
      <Button
        disabled={!from || !to || !sel.size || r.pending}
        onClick={() =>
          r.run(
            () => moveLinesAction(rid, [...sel], to!.id),
            () => {
              setDone(sel.size);
              setFrom(null);
              setTo(null);
              setSel(new Set());
            },
          )
        }
      >
        <ArrowLeftRight className="size-4" aria-hidden="true" />
        {t("moveN", { n: sel.size })}
      </Button>
    </div>
  );
}

/** انتقال حساب: what a guest's folio owes goes to a company account (city ledger). */
export function TransferBalance({
  rid,
  currency,
  accounts,
}: {
  rid: string;
  currency: string;
  accounts: { id: string; name: string }[];
}) {
  const t = useTranslations("cashier");
  const money = useMoney(currency);
  const r = useRun();
  const [folio, setFolio] = useState<FolioHit | null>(null);
  const [account, setAccount] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div className={cn(card, "max-w-2xl space-y-4")}>
      <p className="text-sm text-fg-muted">{t("transferHint")}</p>
      <FolioFinder
        rid={rid}
        currency={currency}
        label={t("guestFolio")}
        picked={folio}
        onPick={(f) => {
          setFolio(f);
          setDone(false);
        }}
      />
      <label className="block">
        <Label>{t("toAccount")}</Label>
        <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">{t("pickAccount")}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {!accounts.length ? <p className="text-sm text-fg-muted">{t("noAccounts")}</p> : null}
      {done ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{t("transferred")}</p>
      ) : null}
      <FormError error={r.error} />
      <Button
        disabled={!folio || !account || (folio?.balanceCents ?? 0) <= 0 || r.pending}
        onClick={() =>
          r.run(
            () => transferToAccountAction(rid, folio!.id, account),
            () => {
              setDone(true);
              setFolio(null);
            },
          )
        }
      >
        <Building2 className="size-4" aria-hidden="true" />
        {folio ? t("transferAmount", { amount: money(Math.max(0, folio.balanceCents)) }) : t("transfer")}
      </Button>
    </div>
  );
}
