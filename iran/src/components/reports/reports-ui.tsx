"use client";

import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  createExpenseAction,
  deleteExpenseAction,
} from "@/app/[locale]/dashboard/[restaurantId]/reports/actions";

const CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "supplies",
  "marketing",
  "maintenance",
  "taxes",
  "other",
] as const;
const METHODS = ["cash", "card", "transfer"] as const;

export function CustomPeriod({ base, from, to }: { base: string; from: string; to: string }) {
  const t = useTranslations("reports");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm text-fg-muted ring-1 ring-border"
      >
        <CalendarRange className="size-4" />
        {t("custom")}
      </button>
      {open ? (
        <Sheet title={t("custom")} onClose={() => setOpen(false)}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              {t("from")}
              <input
                type="date"
                value={a}
                onChange={(e) => setA(e.target.value)}
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("to")}
              <input
                type="date"
                value={b}
                onChange={(e) => setB(e.target.value)}
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!a || !b || a > b}
            onClick={() => {
              setOpen(false);
              router.push(`${base}${base.includes("?") ? "&" : "?"}from=${a}&to=${b}`);
            }}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {t("apply")}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

export function NewExpenseButton({ rid, currency, today }: { rid: string; currency: string; today: string }) {
  const t = useTranslations("reports");
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("rent");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("cash");
  const [paidAt, setPaidAt] = useState(today);
  const cents = parseMoneyInput(amount, currency);
  const reset = () => (setOpen(false), setAmount(""), setDescription(""));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
      >
        <Plus className="size-4" />
        {t("newExpense")}
      </button>
      {open ? (
        <Sheet title={t("newExpense")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-xs font-semibold",
                    category === c ? "border-accent bg-accent-soft text-accent" : "border-border",
                  )}
                >
                  {t(`categories.${c}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">
                {t("amount")}
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="numeric"
                  dir="ltr"
                  className={cn(field, "mt-1")}
                  autoFocus
                />
              </label>
              <label className="block text-sm font-medium">
                {t("date")}
                <input
                  type="date"
                  value={paidAt}
                  max={today}
                  onChange={(e) => setPaidAt(e.target.value)}
                  dir="ltr"
                  className={cn(field, "mt-1")}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-1">
              {METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "h-9 rounded-lg text-sm font-semibold",
                    method === m ? "bg-surface shadow-sm" : "text-fg-muted",
                  )}
                >
                  {t(`methods.${m}`)}
                </button>
              ))}
            </div>
            <label className="block text-sm font-medium">
              {t("description")}
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                className={cn(field, "mt-1")}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="button"
              disabled={pending || !cents}
              onClick={() =>
                run(
                  () =>
                    createExpenseAction(rid, {
                      category,
                      amountCents: cents!,
                      description,
                      method,
                      paidAt: new Date(`${paidAt}T12:00:00`).toISOString(),
                    }),
                  reset,
                )
              }
              className="inline-flex h-11 w-full items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export function DeleteExpense({ rid, id }: { rid: string; id: string }) {
  const t = useTranslations("reports");
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => window.confirm(t("deleteExpense")) && run(() => deleteExpenseAction(rid, id))}
      className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2 hover:text-danger"
      aria-label={t("deleteExpense")}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
