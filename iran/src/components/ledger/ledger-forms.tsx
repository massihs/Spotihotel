"use client";

import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import {
  budgetAction,
  ledgerAccountAction,
  lockBooksAction,
  manualEntryAction,
  reconcileAction,
  reverseEntryAction,
  syncBooksAction,
} from "@/app/[locale]/dashboard/[restaurantId]/ledger/actions";
import { FormError, Label, RunButton, SheetButton, inputCls } from "@/components/pms/kit";

type Account = { id: string; code: string; name: string; type: string; active: boolean };

export function SyncButton({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("ledger");
  return <RunButton run={() => syncBooksAction(restaurantId)}>{t("sync")}</RunButton>;
}

export function ReverseButton({ restaurantId, entryId }: { restaurantId: string; entryId: string }) {
  const t = useTranslations("ledger");
  return (
    <RunButton
      variant="ghost"
      confirm={t("reverseConfirm")}
      run={() => reverseEntryAction(restaurantId, entryId)}
    >
      {t("reverse")}
    </RunButton>
  );
}

/** A balanced journal entry typed by the accountant (two lines or more). */
export function ManualEntryButton({
  restaurantId,
  currency,
  accounts,
  today,
}: {
  restaurantId: string;
  currency: string;
  accounts: Account[];
  today: string;
}) {
  const t = useTranslations("ledger");
  return (
    <SheetButton label={t("newEntry")} title={t("newEntry")} variant="primary" size="md">
      {(close) => (
        <EntryForm
          restaurantId={restaurantId}
          currency={currency}
          accounts={accounts.filter((a) => a.active)}
          today={today}
          done={close}
        />
      )}
    </SheetButton>
  );
}

function EntryForm({
  restaurantId,
  currency,
  accounts,
  today,
  done,
}: {
  restaurantId: string;
  currency: string;
  accounts: Account[];
  today: string;
  done: () => void;
}) {
  const t = useTranslations("ledger");
  const money = useMoney(currency);
  const r = useRun();
  const [lines, setLines] = useState([
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ]);
  const cents = (v: string) => (v.trim() ? (parseMoneyInput(v, currency) ?? 0) : 0);
  const debit = lines.reduce((s, l) => s + cents(l.debit), 0);
  const credit = lines.reduce((s, l) => s + cents(l.credit), 0);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <form
      className="space-y-4"
      action={(fd) =>
        r.run(
          () =>
            manualEntryAction(restaurantId, {
              date: String(fd.get("date")),
              memo: String(fd.get("memo")),
              lines: lines
                .filter((l) => l.accountId && (cents(l.debit) || cents(l.credit)))
                .map((l) => ({
                  accountId: l.accountId,
                  debitCents: cents(l.debit),
                  creditCents: cents(l.credit),
                })),
            }),
          done,
        )
      }
    >
      <div className="grid grid-cols-[140px_1fr] gap-3">
        <label>
          <Label>{t("date")}</Label>
          <input name="date" type="date" defaultValue={today} className={inputCls} required />
        </label>
        <label>
          <Label>{t("memo")}</Label>
          <input name="memo" className={inputCls} required minLength={2} maxLength={240} />
        </label>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_96px_96px_32px] gap-2 text-xs font-semibold text-fg-muted">
          <span>{t("account")}</span>
          <span>{t("debit")}</span>
          <span>{t("credit")}</span>
          <span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_96px_96px_32px] gap-2">
            <select
              className={cn(inputCls, "h-10 text-sm")}
              value={l.accountId}
              onChange={(e) => set(i, { accountId: e.target.value })}
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
            <input
              className={cn(inputCls, "h-10 text-end")}
              inputMode="decimal"
              dir="ltr"
              value={l.debit}
              onChange={(e) => set(i, { debit: e.target.value, credit: "" })}
              aria-label={t("debit")}
            />
            <input
              className={cn(inputCls, "h-10 text-end")}
              inputMode="decimal"
              dir="ltr"
              value={l.credit}
              onChange={(e) => set(i, { credit: e.target.value, debit: "" })}
              aria-label={t("credit")}
            />
            <button
              type="button"
              className="grid place-items-center text-fg-muted hover:text-danger disabled:opacity-30"
              disabled={lines.length <= 2}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
              aria-label={t("removeLine")}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLines([...lines, { accountId: "", debit: "", credit: "" }])}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("addLine")}
        </Button>
      </div>
      <p
        className={cn(
          "flex justify-between rounded-xl px-3 py-2 text-sm font-semibold",
          debit === credit && debit > 0 ? "bg-success-soft text-success" : "bg-warning-soft",
        )}
      >
        <span>
          {t("debit")} {money(debit)} · {t("credit")} {money(credit)}
        </span>
        <span>
          {debit === credit && debit > 0
            ? t("balanced")
            : t("difference", { amount: money(Math.abs(debit - credit)) })}
        </span>
      </p>
      <FormError error={r.error} />
      <Button type="submit" className="w-full" disabled={r.pending || debit !== credit || debit === 0}>
        {t("post")}
      </Button>
    </form>
  );
}

export function LockForm({
  restaurantId,
  lockedUntil,
  isOwner,
}: {
  restaurantId: string;
  lockedUntil: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations("ledger");
  const r = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={(fd) => {
        if (!window.confirm(t("lockConfirm"))) return;
        r.run(() => lockBooksAction(restaurantId, String(fd.get("until") ?? "") || null));
      }}
    >
      <label>
        <Label>{t("lockUntil")}</Label>
        <input name="until" type="date" defaultValue={lockedUntil ?? ""} className={cn(inputCls, "w-auto")} />
      </label>
      <Button type="submit" disabled={r.pending}>
        {t("lock")}
      </Button>
      {lockedUntil && isOwner ? (
        <RunButton
          variant="ghost"
          confirm={t("unlockConfirm")}
          run={() => lockBooksAction(restaurantId, null)}
        >
          {t("unlock")}
        </RunButton>
      ) : null}
      <FormError error={r.error} />
    </form>
  );
}

export function BudgetCell({
  restaurantId,
  currency,
  accountId,
  month,
  amountCents,
}: {
  restaurantId: string;
  currency: string;
  accountId: string;
  month: string;
  amountCents: number | null;
}) {
  const locale = useLocale();
  const r = useRun();
  const [value, setValue] = useState(centsToInput(amountCents, locale, currency));
  return (
    <input
      className={cn(
        "h-8 w-24 rounded-lg border border-transparent bg-transparent px-1.5 text-end text-xs tabular-nums hover:border-border focus:border-accent focus:outline-none",
        r.error && "border-danger",
      )}
      value={value}
      inputMode="decimal"
      dir="ltr"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const cents = value.trim() ? (parseMoneyInput(value, currency) ?? 0) : 0;
        if (cents === (amountCents ?? 0)) return;
        r.run(() => budgetAction(restaurantId, { accountId, month, amountCents: cents }));
      }}
      title={r.error ?? undefined}
      aria-label={month}
    />
  );
}

export function LedgerAccountButton({
  restaurantId,
  account,
}: {
  restaurantId: string;
  account?: Account & { reconcilable: boolean };
}) {
  const t = useTranslations("ledger");
  const tType = useTranslations("ledger.type");
  const r = useRun();
  return (
    <SheetButton
      label={account ? t("edit") : t("newAccount")}
      title={account ? `${account.code} ${account.name}` : t("newAccount")}
      variant={account ? "ghost" : "primary"}
      size={account ? "sm" : "md"}
    >
      {(close) => (
        <form
          className="grid grid-cols-2 gap-4"
          action={(fd) =>
            r.run(
              () =>
                ledgerAccountAction(restaurantId, account?.id ?? null, {
                  code: String(fd.get("code")),
                  name: String(fd.get("name")),
                  type: String(fd.get("type")) as "asset",
                  reconcilable: fd.get("reconcilable") === "on",
                  active: fd.get("active") === "on",
                }),
              close,
            )
          }
        >
          <label>
            <Label>{t("code")}</Label>
            <input
              name="code"
              defaultValue={account?.code}
              className={inputCls}
              required
              maxLength={12}
              dir="ltr"
            />
          </label>
          <label>
            <Label>{t("accountType")}</Label>
            <select name="type" defaultValue={account?.type ?? "expense"} className={inputCls}>
              {["asset", "liability", "equity", "revenue", "expense"].map((k) => (
                <option key={k} value={k}>
                  {tType(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            <Label>{t("name")}</Label>
            <input name="name" defaultValue={account?.name} className={inputCls} required maxLength={120} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reconcilable"
              defaultChecked={account?.reconcilable ?? false}
              className="size-4"
            />{" "}
            {t("reconcilable")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={account?.active ?? true}
              className="size-4"
            />{" "}
            {t("active")}
          </label>
          <div className="col-span-2 space-y-2">
            <FormError error={r.error} />
            <Button type="submit" className="w-full" disabled={r.pending}>
              {t("save")}
            </Button>
          </div>
        </form>
      )}
    </SheetButton>
  );
}

/** Ticking bank / cash movements against the statement. */
export function ReconcileTable({
  restaurantId,
  currency,
  accountId,
  clearedCents,
  lines,
}: {
  restaurantId: string;
  currency: string;
  accountId: string;
  clearedCents: number;
  lines: {
    id: string;
    date: string;
    number: number;
    memo: string;
    debitCents: number;
    creditCents: number;
  }[];
}) {
  const t = useTranslations("ledger");
  const money = useMoney(currency);
  const locale = useLocale();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const r = useRun();
  const delta = lines.filter((l) => picked.has(l.id)).reduce((s, l) => s + l.debitCents - l.creditCents, 0);
  const day = (d: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm">
        <span>{t("cleared", { amount: money(clearedCents) })}</span>
        <span className="font-semibold">{t("afterTick", { amount: money(clearedCents + delta) })}</span>
        <Button
          className="ms-auto"
          disabled={!picked.size || r.pending}
          onClick={() =>
            r.run(
              () => reconcileAction(restaurantId, accountId, [...picked], true),
              () => setPicked(new Set()),
            )
          }
        >
          {t("tick", { n: picked.size })}
        </Button>
        <FormError error={r.error} />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[600px] text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-border first:border-t-0">
                <td className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={picked.has(l.id)}
                    onChange={() => {
                      const next = new Set(picked);
                      if (next.has(l.id)) next.delete(l.id);
                      else next.add(l.id);
                      setPicked(next);
                    }}
                    aria-label={`#${l.number}`}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-fg-muted">{day(l.date)}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs text-fg-muted">#{l.number}</span> {l.memo}
                </td>
                <td className="px-3 py-2 text-end text-success tabular-nums">
                  {l.debitCents ? money(l.debitCents) : ""}
                </td>
                <td className="px-3 py-2 text-end text-danger tabular-nums">
                  {l.creditCents ? money(l.creditCents) : ""}
                </td>
              </tr>
            ))}
            {!lines.length ? (
              <tr>
                <td className="px-3 py-8 text-center text-fg-muted">{t("allReconciled")}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
