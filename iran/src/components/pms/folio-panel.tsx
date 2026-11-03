"use client";

import { Ban, Percent, Printer, Shuffle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { DateInput } from "@/components/ui/date-input";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  discountLineAction,
  moveLineAction,
  newFolioAction,
  postChargeAction,
  postPaymentAction,
  transferToAccountAction,
  voidLineAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, SheetButton, StatusPill, inputCls, useDay } from "./kit";

export type FolioLine = {
  id: string;
  businessDate: string;
  kind: string;
  department: string;
  description: string;
  quantity: number;
  unitCents: number;
  amountCents: number;
  taxCents: number;
  method: string | null;
  voidedAt: string | null;
  voidReason: string | null;
};
export type Folio = {
  id: string;
  number: number;
  status: string;
  label: string | null;
  accountName: string | null;
  balanceCents: number;
  chargesCents: number;
  creditsCents: number;
  lines: FolioLine[];
};

const DEPARTMENTS = [
  "room",
  "fnb",
  "room_service",
  "minibar",
  "spa",
  "laundry",
  "phone",
  "parking",
  "transport",
  "misc",
];
const METHODS = ["cash", "card", "transfer", "cheque", "online"];

/** Human label of a posting (automatic descriptions are codes: "room:101:2026-11-03"). */
export function useLineLabel() {
  const t = useTranslations("pms.folio");
  const tDep = useTranslations("pms.dept");
  const tPay = useTranslations("pms.method");
  const day = useDay();
  return (l: Pick<FolioLine, "description" | "department" | "method">) => {
    const [code, a, b] = l.description.split(":");
    if (code === "room" && b) return t("lineRoom", { room: a ?? "", day: day(b) });
    if (code === "city_tax" && a) return t("lineCityTax", { day: day(a) });
    if (code === "order" && a) return t("lineOrder", { number: a });
    if (code === "payment") return t("linePayment", { method: tPay.has(a ?? "") ? tPay(a!) : (a ?? "") });
    if (code === "cancellation_fee") return t("lineCancellation");
    if (l.department === "transfer") return t("lineTransfer", { label: l.description });
    return l.description || (tDep.has(l.department) ? tDep(l.department) : l.department);
  };
}

export function FolioPanel({
  restaurantId,
  stayId,
  currency,
  folios,
  accounts,
  defaultAccountId,
  canPost,
  canAdjust,
}: {
  restaurantId: string;
  stayId: string;
  currency: string;
  folios: Folio[];
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
  canPost: boolean;
  canAdjust: boolean;
}) {
  const t = useTranslations("pms.folio");
  const money = useMoney(currency);
  const day = useDay();
  const label = useLineLabel();
  const tDep = useTranslations("pms.dept");
  const [newLabel, setNewLabel] = useState("");
  const r = useRun();

  return (
    <div className="space-y-5">
      {folios.map((f) => (
        <section
          key={f.id}
          className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 font-semibold">
                {t("folio", { number: f.number })}
                {f.label ? <span className="text-fg-muted">· {f.label}</span> : null}
                <StatusPill status={f.status} />
              </h3>
              <p className="text-sm text-fg-muted">
                {t("totals", { charges: money(f.chargesCents), credits: money(f.creditsCents) })}
              </p>
            </div>
            <p
              className={cn(
                "text-xl font-bold tabular-nums",
                f.balanceCents > 0 ? "text-danger" : f.balanceCents < 0 ? "text-info" : "text-success",
              )}
            >
              {money(f.balanceCents)}
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-semibold">{t("date")}</th>
                  <th className="px-4 py-2 text-start font-semibold">{t("description")}</th>
                  <th className="px-4 py-2 text-end font-semibold">{t("amount")}</th>
                  {canAdjust && f.status === "open" ? <th className="w-28" /> : null}
                </tr>
              </thead>
              <tbody>
                {f.lines.map((l) => (
                  <tr
                    key={l.id}
                    className={cn("border-t border-border", l.voidedAt && "text-fg-subtle line-through")}
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-fg-muted">{day(l.businessDate)}</td>
                    <td className="px-4 py-2">
                      <span className="me-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-fg-muted uppercase no-underline">
                        {tDep.has(l.department) ? tDep(l.department) : l.department}
                      </span>
                      {label(l)}
                      {l.quantity > 1 ? <span className="text-fg-muted"> × {l.quantity}</span> : null}
                      {l.voidedAt && l.voidReason ? (
                        <span className="block text-xs no-underline">{l.voidReason}</span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-end font-semibold tabular-nums",
                        l.amountCents < 0 && "text-success",
                      )}
                    >
                      {money(l.amountCents)}
                    </td>
                    {canAdjust && f.status === "open" ? (
                      <td className="px-2 py-1 text-end whitespace-nowrap">
                        {!l.voidedAt && l.department !== "transfer" ? (
                          <LineActions
                            restaurantId={restaurantId}
                            currency={currency}
                            line={l}
                            others={folios.filter((x) => x.id !== f.id && x.status === "open")}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
                {!f.lines.length ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                      {t("empty")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap gap-2 border-t border-border bg-surface-2/50 px-5 py-3">
            {f.status === "open" && canPost ? (
              <>
                <ChargeButton restaurantId={restaurantId} folioId={f.id} currency={currency} />
                <PaymentButton
                  restaurantId={restaurantId}
                  folioId={f.id}
                  currency={currency}
                  balance={f.balanceCents}
                />
              </>
            ) : null}
            {f.status === "open" && canAdjust && f.balanceCents > 0 && accounts.length ? (
              <TransferButton
                restaurantId={restaurantId}
                folioId={f.id}
                accounts={accounts}
                defaultAccountId={defaultAccountId}
              />
            ) : null}
            <Link
              href={`/dashboard/${restaurantId}/stays/${stayId}/folio/${f.id}`}
              target="_blank"
              className="ms-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-muted ring-1 ring-border hover:bg-surface"
            >
              <Printer className="size-4" aria-hidden="true" />
              {t("print")}
            </Link>
          </footer>
        </section>
      ))}
      {canAdjust ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cn(inputCls, "h-9 w-56")}
            placeholder={t("newFolioLabel")}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={80}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={r.pending}
            onClick={() =>
              r.run(
                () => newFolioAction(restaurantId, stayId, newLabel),
                () => setNewLabel(""),
              )
            }
          >
            {t("newFolio")}
          </Button>
          <FormError error={r.error} />
        </div>
      ) : null}
    </div>
  );
}

function ChargeButton({
  restaurantId,
  folioId,
  currency,
}: {
  restaurantId: string;
  folioId: string;
  currency: string;
}) {
  const t = useTranslations("pms.folio");
  const tDep = useTranslations("pms.dept");
  const r = useRun();
  return (
    <SheetButton label={t("postCharge")} title={t("postCharge")} variant="outline">
      {(close) => (
        <form
          className="space-y-4"
          action={(fd) => {
            const unitCents = parseMoneyInput(String(fd.get("unit") ?? ""), currency) ?? 0;
            r.run(
              () =>
                postChargeAction(restaurantId, folioId, {
                  department: String(fd.get("department")) as "misc",
                  description: String(fd.get("description") ?? ""),
                  quantity: Number(fd.get("quantity") || 1),
                  unitCents,
                }),
              close,
            );
          }}
        >
          <label className="block">
            <Label>{t("department")}</Label>
            <select name="department" className={inputCls} defaultValue="misc">
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {tDep(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>{t("description")}</Label>
            <input name="description" className={inputCls} required maxLength={200} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <Label>{t("quantity")}</Label>
              <input name="quantity" type="number" min={1} max={999} defaultValue={1} className={inputCls} />
            </label>
            <MoneyField name="unit" currency={currency} label={t("unitPrice")} required />
          </div>
          <FormError error={r.error} />
          <Button type="submit" className="w-full" disabled={r.pending}>
            {t("postCharge")}
          </Button>
        </form>
      )}
    </SheetButton>
  );
}

function PaymentButton({
  restaurantId,
  folioId,
  currency,
  balance,
}: {
  restaurantId: string;
  folioId: string;
  currency: string;
  balance: number;
}) {
  const t = useTranslations("pms.folio");
  const tPay = useTranslations("pms.method");
  const r = useRun();
  const [method, setMethod] = useState("card");
  const factor = currency === "IRR" ? 1000 : 100;
  return (
    <SheetButton label={t("takePayment")} title={t("takePayment")} variant="primary">
      {(close) => (
        <form
          className="space-y-4"
          action={(fd) => {
            const amountCents = parseMoneyInput(String(fd.get("amount") ?? ""), currency) ?? 0;
            r.run(
              () =>
                postPaymentAction(restaurantId, folioId, {
                  amountCents,
                  method: method as "cash",
                  reference: String(fd.get("reference") ?? ""),
                  cheque:
                    method === "cheque"
                      ? {
                          sayadId: String(fd.get("sayadId") ?? ""),
                          number: String(fd.get("chequeNumber") ?? ""),
                          bank: String(fd.get("bank") ?? ""),
                          party: String(fd.get("party") ?? ""),
                          dueDate: String(fd.get("dueDate") ?? ""),
                        }
                      : undefined,
                }),
              close,
            );
          }}
        >
          <MoneyField
            name="amount"
            currency={currency}
            label={t("amount")}
            required
            defaultValue={
              balance > 0
                ? String(currency === "IRR" ? Math.round(balance / factor) : (balance / factor).toFixed(2))
                : ""
            }
          />
          <label className="block">
            <Label>{t("method")}</Label>
            <select
              name="method"
              className={inputCls}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {tPay(m)}
                </option>
              ))}
            </select>
          </label>
          {method === "cheque" ? (
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3">
              <label className="col-span-2">
                <Label>{t("sayadId")}</Label>
                <input name="sayadId" className={inputCls} inputMode="numeric" maxLength={16} dir="ltr" />
              </label>
              <label>
                <Label>{t("chequeNumber")}</Label>
                <input name="chequeNumber" className={inputCls} maxLength={32} dir="ltr" />
              </label>
              <label>
                <Label>{t("bank")}</Label>
                <input name="bank" className={inputCls} maxLength={80} />
              </label>
              <label>
                <Label>{t("drawer")}</Label>
                <input name="party" className={inputCls} required minLength={2} maxLength={160} />
              </label>
              <label>
                <Label>{t("dueDate")}</Label>
                <DateInput name="dueDate" required />
              </label>
            </div>
          ) : (
            <label className="block">
              <Label>{t("reference")}</Label>
              <input name="reference" className={inputCls} maxLength={64} dir="ltr" />
            </label>
          )}
          <FormError error={r.error} />
          <Button type="submit" className="w-full" disabled={r.pending}>
            {t("takePayment")}
          </Button>
        </form>
      )}
    </SheetButton>
  );
}

function TransferButton({
  restaurantId,
  folioId,
  accounts,
  defaultAccountId,
}: {
  restaurantId: string;
  folioId: string;
  accounts: { id: string; name: string }[];
  defaultAccountId: string | null;
}) {
  const t = useTranslations("pms.folio");
  const [account, setAccount] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const r = useRun();
  return (
    <SheetButton label={t("toAccount")} title={t("toAccount")} variant="outline">
      {(close) => (
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{t("toAccountHint")}</p>
          <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <FormError error={r.error} />
          <Button
            className="w-full"
            disabled={r.pending || !account}
            onClick={() => r.run(() => transferToAccountAction(restaurantId, folioId, account), close)}
          >
            {t("toAccount")}
          </Button>
        </div>
      )}
    </SheetButton>
  );
}

function LineActions({
  restaurantId,
  currency,
  line,
  others,
}: {
  restaurantId: string;
  currency: string;
  line: FolioLine;
  others: Folio[];
}) {
  const t = useTranslations("pms.folio");
  const r = useRun();
  const [mode, setMode] = useState<"void" | "discount" | "move" | null>(null);
  return (
    <span className="inline-flex gap-0.5">
      <button
        type="button"
        title={t("void")}
        aria-label={t("void")}
        onClick={() => setMode("void")}
        className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-danger-soft hover:text-danger"
      >
        <Ban className="size-4" />
      </button>
      {line.kind === "charge" ? (
        <>
          <button
            type="button"
            title={t("discount")}
            aria-label={t("discount")}
            onClick={() => setMode("discount")}
            className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"
          >
            <Percent className="size-4" />
          </button>
          {others.length ? (
            <button
              type="button"
              title={t("move")}
              aria-label={t("move")}
              onClick={() => setMode("move")}
              className="grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2"
            >
              <Shuffle className="size-4" />
            </button>
          ) : null}
        </>
      ) : null}
      {mode ? (
        <SheetInline title={t(mode)} onClose={() => setMode(null)}>
          <form
            className="space-y-4 text-start no-underline"
            action={(fd) => {
              const reason = String(fd.get("reason") ?? "");
              if (mode === "void")
                r.run(
                  () => voidLineAction(restaurantId, line.id, reason),
                  () => setMode(null),
                );
              if (mode === "discount")
                r.run(
                  () =>
                    discountLineAction(
                      restaurantId,
                      line.id,
                      parseMoneyInput(String(fd.get("amount") ?? ""), currency) ?? 0,
                      reason,
                    ),
                  () => setMode(null),
                );
              if (mode === "move")
                r.run(
                  () => moveLineAction(restaurantId, line.id, String(fd.get("to"))),
                  () => setMode(null),
                );
            }}
          >
            {mode === "discount" ? (
              <MoneyField name="amount" currency={currency} label={t("amount")} required />
            ) : null}
            {mode === "move" ? (
              <select name="to" className={inputCls}>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {t("folio", { number: o.number })} {o.label ?? ""}
                  </option>
                ))}
              </select>
            ) : (
              <label className="block">
                <Label>{t("reason")}</Label>
                <input name="reason" className={inputCls} required minLength={2} maxLength={200} />
              </label>
            )}
            <FormError error={r.error} />
            <Button
              type="submit"
              variant={mode === "void" ? "danger" : "primary"}
              className="w-full"
              disabled={r.pending}
            >
              {t(mode)}
            </Button>
          </form>
        </SheetInline>
      ) : null}
    </span>
  );
}

function SheetInline({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end text-fg sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" aria-label="×" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-surface p-5 sm:max-w-md sm:rounded-3xl">
        <p className="mb-4 text-lg font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}
