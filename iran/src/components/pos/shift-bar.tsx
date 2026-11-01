"use client";

import { ArrowDownToLine, ArrowUpFromLine, Lock, LockOpen, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  cashMovementAction,
  closeShiftAction,
  openShiftAction,
} from "@/app/[locale]/dashboard/[restaurantId]/pos/actions";

type Shift = { openedAt: string; openingFloatCents: number } | null;
type Summary = {
  cashSales: number;
  totalSales: number;
  moveIn: number;
  moveOut: number;
  expectedCash: number;
} | null;

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" aria-label="×" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-sheet-up relative w-full rounded-t-3xl bg-surface p-5 sm:max-w-md sm:rounded-3xl">
        <p className="mb-4 text-lg font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Cash drawer status for the till: open with a float, pay in/out, close with a count. */
export function ShiftBar({
  restaurantId,
  currency,
  shift,
  summary,
  canManage,
  timeLabel,
}: {
  restaurantId: string;
  currency: string;
  shift: Shift;
  summary: Summary;
  canManage: boolean;
  timeLabel: string | null;
}) {
  const t = useTranslations("pos.shift");
  const money = useMoney(currency);
  const [dialog, setDialog] = useState<null | "open" | "in" | "out" | "close">(null);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ expected: number; counted: number } | null>(null);
  const [pending, start] = useTransition();
  const cents = parseMoneyInput(value, currency);
  const input = "h-12 w-full rounded-xl border border-border-strong px-3 text-lg tabular-nums";
  const close = () => {
    setDialog(null);
    setValue("");
    setReason("");
  };

  if (!shift)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-warning/40 bg-warning-soft/60 p-3">
        <Lock className="size-5 text-warning" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium">
          {result
            ? t("closedResult", {
                expected: money(result.expected),
                counted: money(result.counted),
                diff: money(result.counted - result.expected),
              })
            : t("closed")}
        </p>
        {canManage ? (
          <button
            type="button"
            onClick={() => setDialog("open")}
            className="h-9 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            {t("open")}
          </button>
        ) : null}
        {dialog === "open" ? (
          <Modal title={t("open")} onClose={close}>
            <label className="text-sm font-medium">{t("float")}</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(input, "mt-1")}
              placeholder="0"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => void ((await openShiftAction(restaurantId, cents ?? 0))?.ok && close()))
              }
              className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
            >
              {t("open")}
            </button>
          </Modal>
        ) : null}
      </div>
    );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)]">
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
        <LockOpen className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-[12rem] flex-1 text-sm">
        <p className="font-semibold">{t("openSince", { time: timeLabel ?? "" })}</p>
        {summary ? (
          <p className="text-fg-muted">
            {t("salesLine", { sales: money(summary.totalSales), cash: money(summary.expectedCash) })}
          </p>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDialog("in")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-border"
            title={t("payIn")}
          >
            <ArrowDownToLine className="size-4" />
            <span className="max-sm:hidden">{t("payIn")}</span>
          </button>
          <button
            type="button"
            onClick={() => setDialog("out")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-border"
            title={t("payOut")}
          >
            <ArrowUpFromLine className="size-4" />
            <span className="max-sm:hidden">{t("payOut")}</span>
          </button>
          <button
            type="button"
            onClick={() => setDialog("close")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fg px-4 text-sm font-semibold text-bg"
          >
            <Wallet className="size-4" />
            {t("close")}
          </button>
        </div>
      ) : null}
      {dialog === "in" || dialog === "out" ? (
        <Modal title={dialog === "in" ? t("payIn") : t("payOut")} onClose={close}>
          <label className="text-sm font-medium">{t("amount")}</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={cn(input, "mt-1")}
          />
          <label className="mt-3 block text-sm font-medium">{t("reason")}</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={t("reasonPlaceholder")}
            className="mt-1 h-11 w-full rounded-xl border border-border-strong px-3"
          />
          <button
            type="button"
            disabled={pending || !cents || reason.trim().length < 2}
            onClick={() =>
              start(
                async () =>
                  void ((await cashMovementAction(restaurantId, dialog, cents!, reason))?.ok && close()),
              )
            }
            className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
          >
            {t("save")}
          </button>
        </Modal>
      ) : null}
      {dialog === "close" && summary ? (
        <Modal title={t("close")} onClose={close}>
          <dl className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex justify-between">
              <dt>{t("float")}</dt>
              <dd className="tabular-nums">{money(shift.openingFloatCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("cashSales")}</dt>
              <dd className="tabular-nums">{money(summary.cashSales)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("payIn")}</dt>
              <dd className="tabular-nums">{money(summary.moveIn)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>{t("payOut")}</dt>
              <dd className="tabular-nums">−{money(summary.moveOut)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-bold">
              <dt>{t("expected")}</dt>
              <dd className="tabular-nums">{money(summary.expectedCash)}</dd>
            </div>
          </dl>
          <label className="mt-4 block text-sm font-medium">{t("counted")}</label>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            className={cn(input, "mt-1")}
          />
          {cents != null ? (
            <p
              className={cn(
                "mt-2 text-sm font-semibold",
                cents - summary.expectedCash === 0 ? "text-success" : "text-warning",
              )}
            >
              {t("difference", { amount: money(cents - summary.expectedCash) })}
            </p>
          ) : null}
          <button
            type="button"
            disabled={pending || cents == null}
            onClick={() =>
              start(async () => {
                const res = await closeShiftAction(restaurantId, cents!, reason);
                if (res?.ok && res.data) {
                  setResult(res.data);
                  close();
                }
              })
            }
            className="mt-4 h-12 w-full rounded-xl bg-fg font-bold text-bg disabled:opacity-40"
          >
            {t("confirmClose")}
          </button>
        </Modal>
      ) : null}
    </div>
  );
}
