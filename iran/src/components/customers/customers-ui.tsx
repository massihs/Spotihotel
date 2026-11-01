"use client";

import { MessageSquareText, Minus, Plus, Send, Ticket, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, num, useRun } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import {
  adjustPointsAction,
  createCouponAction,
  createCustomerAction,
  deleteCouponAction,
  sendCampaignAction,
  setCouponActiveAction,
  updateCustomerAction,
  updateLoyaltyAction,
  repayAccountAction,
  setCreditLimitAction,
} from "@/app/[locale]/dashboard/[restaurantId]/customers/actions";

const pill = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold";
const primary = cn(pill, "bg-accent text-accent-fg disabled:opacity-50");
const ghost = cn(pill, "ring-1 ring-border");

// ─── New customer ────────────────────────────────────────────────────────────

export function NewCustomerButton({ rid }: { rid: string }) {
  const t = useTranslations("customers");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary}>
        <Plus className="size-4" />
        {t("newCustomer")}
      </button>
      {open ? (
        <Sheet title={t("newCustomer")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              {t("phone")}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                dir="ltr"
                placeholder="09121234567"
                className={cn(field, "mt-1")}
                autoFocus
              />
            </label>
            <label className="block text-sm font-medium">
              {t("name")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className={cn(field, "mt-1")}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("note")}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className={cn(field, "mt-1 h-auto py-2")}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="button"
              disabled={pending || !phone}
              className={cn(primary, "w-full justify-center")}
              onClick={() =>
                run(async () => {
                  const res = await createCustomerAction(rid, { phone, name, note });
                  if (res?.ok && res.data) router.push(`/dashboard/${rid}/customers/${res.data.id}`);
                  return res;
                })
              }
            >
              {t("save")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

// ─── Customer file ───────────────────────────────────────────────────────────

export function CustomerEditor({
  rid,
  customer,
  canManage,
}: {
  rid: string;
  customer: { id: string; name: string | null; note: string | null; smsOptOut: boolean; points: number };
  canManage: boolean;
}) {
  const t = useTranslations("customers");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(customer.name ?? "");
  const [note, setNote] = useState(customer.note ?? "");
  const [optOut, setOptOut] = useState(customer.smsOptOut);
  const [delta, setDelta] = useState("");
  const [saved, setSaved] = useState(false);
  const d = Math.trunc(num(delta));
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="block text-sm font-medium">
          {t("name")}
          <input
            value={name}
            onChange={(e) => (setName(e.target.value), setSaved(false))}
            disabled={!canManage}
            maxLength={120}
            className={cn(field, "mt-1")}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("note")}
          <textarea
            value={note}
            onChange={(e) => (setNote(e.target.value), setSaved(false))}
            disabled={!canManage}
            rows={3}
            className={cn(field, "mt-1 h-auto py-2")}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={optOut}
            disabled={!canManage}
            onChange={(e) => (setOptOut(e.target.checked), setSaved(false))}
            className="size-4 accent-[var(--accent)]"
          />
          {t("smsOptOut")}
        </label>
        {canManage ? (
          <button
            type="button"
            disabled={pending}
            className={primary}
            onClick={() =>
              run(
                () => updateCustomerAction(rid, customer.id, { name, note, smsOptOut: optOut }),
                () => setSaved(true),
              )
            }
          >
            {saved ? t("saved") : t("save")}
          </button>
        ) : null}
      </div>
      {canManage ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-semibold">{t("adjustPoints")}</p>
          <div className="flex gap-2">
            <input
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder="50"
              className={cn(field, "w-28")}
            />
            <button
              type="button"
              disabled={pending || !(d > 0)}
              onClick={() =>
                run(
                  () => adjustPointsAction(rid, customer.id, d),
                  () => setDelta(""),
                )
              }
              className={ghost}
            >
              <Plus className="size-4" />
              {t("addPoints")}
            </button>
            <button
              type="button"
              disabled={pending || !(d > 0)}
              onClick={() =>
                run(
                  () => adjustPointsAction(rid, customer.id, -d),
                  () => setDelta(""),
                )
              }
              className={ghost}
            >
              <Minus className="size-4" />
              {t("removePoints")}
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

// ─── Coupons ─────────────────────────────────────────────────────────────────

export type CouponRow = {
  id: string;
  code: string;
  kind: string;
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  usedCount: number;
  endsAt: Date | null;
  isActive: boolean;
};

export function CouponList({
  rid,
  coupons,
  currency,
  canManage,
}: {
  rid: string;
  coupons: CouponRow[];
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations("customers");
  const money = useMoney(currency);
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const now = new Date();
  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setOpen(true)} className={primary}>
            <Ticket className="size-4" />
            {t("newCoupon")}
          </button>
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {coupons.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-fg-muted">
          {t("noCoupons")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {coupons.map((c) => {
            const expired = (c.endsAt && c.endsAt < now) || (c.maxUses != null && c.usedCount >= c.maxUses);
            return (
              <li
                key={c.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-border bg-surface p-4",
                  (!c.isActive || expired) && "opacity-60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Ticket className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p dir="ltr" className="text-start font-mono text-lg font-bold tracking-wider">
                      {c.code}
                    </p>
                    <p className="text-sm font-semibold text-accent">
                      {c.kind === "percent"
                        ? t("percentOff", { value: c.value })
                        : t("amountOff", { amount: money(c.value) })}
                    </p>
                    <p className="mt-1 text-xs text-fg-muted">
                      {c.minOrderCents > 0 ? `${t("minOrder", { amount: money(c.minOrderCents) })} · ` : ""}
                      {c.maxUses != null
                        ? t("usesOf", { used: c.usedCount, max: c.maxUses })
                        : t("uses", { used: c.usedCount })}
                      {c.endsAt
                        ? ` · ${t("until", { date: c.endsAt.toLocaleDateString(locale === "fa" ? "fa-IR" : locale) })}`
                        : ""}
                    </p>
                  </div>
                </div>
                {canManage ? (
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={c.isActive}
                        disabled={pending}
                        onChange={(e) => run(() => setCouponActiveAction(rid, c.id, e.target.checked))}
                        className="size-4 accent-[var(--accent)]"
                      />
                      {t("active")}
                    </label>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        window.confirm(t("deleteCoupon")) && run(() => deleteCouponAction(rid, c.id))
                      }
                      className="ms-auto grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
                      aria-label={t("deleteCoupon")}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {open ? <CouponForm rid={rid} currency={currency} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CouponForm({ rid, currency, onClose }: { rid: string; currency: string; onClose: () => void }) {
  const t = useTranslations("customers");
  const { pending, error, run } = useRun();
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("");
  const [min, setMin] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const v = kind === "percent" ? Math.trunc(num(value)) : (parseMoneyInput(value, currency) ?? NaN);
  return (
    <Sheet title={t("newCoupon")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          {t("code")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
            dir="ltr"
            maxLength={32}
            placeholder="NOWRUZ"
            className={cn(field, "mt-1 font-mono tracking-wider")}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1">
          {(["percent", "amount"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "h-9 rounded-lg text-sm font-semibold",
                kind === k ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              {t(`kinds.${k}`)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            {kind === "percent" ? t("percent") : t("amount")}
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("minOrderLabel")}
            <input
              value={min}
              onChange={(e) => setMin(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("maxUses")}
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder="∞"
              className={cn(field, "mt-1")}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("endsAt")}
            <input
              type="date"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="button"
          disabled={pending || code.length < 3 || !(v > 0)}
          className={cn(primary, "w-full justify-center")}
          onClick={() =>
            run(
              () =>
                createCouponAction(rid, {
                  code,
                  kind,
                  value: v,
                  minOrderCents: min ? (parseMoneyInput(min, currency) ?? 0) : 0,
                  maxUses: maxUses ? Math.trunc(num(maxUses)) : null,
                  endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
                }),
              onClose,
            )
          }
        >
          {t("save")}
        </button>
      </div>
    </Sheet>
  );
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

const AUDIENCES = ["all", "inactive", "loyal", "new"] as const;

export function CampaignForm({
  rid,
  restaurantName,
  counts,
}: {
  rid: string;
  restaurantName: string;
  counts: Record<(typeof AUDIENCES)[number], number>;
}) {
  const t = useTranslations("customers");
  const { pending, error, run } = useRun();
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("all");
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<{ recipients: number; sent: number } | null>(null);
  const full = `${restaurantName}\n${message}\nلغو11`;
  const parts = Math.max(1, Math.ceil(full.length / 70));
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 flex items-center gap-2 font-semibold">
        <MessageSquareText className="size-5 text-accent" />
        {t("newCampaign")}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AUDIENCES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAudience(a)}
            className={cn(
              "rounded-xl border px-3 py-2 text-start",
              audience === a ? "border-accent bg-accent-soft" : "border-border",
            )}
          >
            <p className="text-sm font-semibold">{t(`audiences.${a}`)}</p>
            <p className="text-xs text-fg-muted">{t("people", { count: counts[a] })}</p>
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => (setMessage(e.target.value), setDone(null))}
        rows={4}
        maxLength={600}
        placeholder={t("messagePlaceholder")}
        className={cn(field, "h-auto py-2")}
      />
      <div className="mt-2 rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line text-fg-muted">{full}</div>
      <p className="mt-1 text-xs text-fg-subtle">{t("smsParts", { chars: full.length, parts })}</p>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {done ? <p className="mt-2 text-sm font-semibold text-success">{t("campaignSent", done)}</p> : null}
      <button
        type="button"
        disabled={pending || message.trim().length < 3 || counts[audience] === 0}
        className={cn(primary, "mt-3")}
        onClick={() =>
          window.confirm(t("confirmSend", { count: counts[audience] })) &&
          run(async () => {
            const res = await sendCampaignAction(rid, { message, audience });
            if (res?.ok && res.data) {
              setDone(res.data);
              setMessage("");
            }
            return res;
          })
        }
      >
        <Send className="size-4" />
        {pending ? t("sending") : t("send")}
      </button>
    </div>
  );
}

// ─── Loyalty settings ────────────────────────────────────────────────────────

export function LoyaltySettings({
  rid,
  currency,
  initial,
  canManage,
}: {
  rid: string;
  currency: string;
  initial: { enabled: boolean; spendPerPointCents: number; pointValueCents: number };
  canManage: boolean;
}) {
  const t = useTranslations("customers");
  const locale = useLocale();
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [spend, setSpend] = useState(centsToInput(initial.spendPerPointCents, locale, currency));
  const [value, setValue] = useState(centsToInput(initial.pointValueCents, locale, currency));
  const [saved, setSaved] = useState(false);
  const s = parseMoneyInput(spend, currency);
  const v = parseMoneyInput(value, currency);
  const rate = s && v != null ? Math.round((v / s) * 1000) / 10 : 0;
  return (
    <div className="max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-4">
      <label className="flex items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage}
          onChange={(e) => (setEnabled(e.target.checked), setSaved(false))}
          className="size-4 accent-[var(--accent)]"
        />
        {t("loyaltyEnabled")}
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          {t("spendPerPoint")}
          <input
            value={spend}
            onChange={(e) => (setSpend(e.target.value), setSaved(false))}
            disabled={!canManage}
            inputMode="numeric"
            dir="ltr"
            className={cn(field, "mt-1")}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("pointValue")}
          <input
            value={value}
            onChange={(e) => (setValue(e.target.value), setSaved(false))}
            disabled={!canManage}
            inputMode="numeric"
            dir="ltr"
            className={cn(field, "mt-1")}
          />
        </label>
      </div>
      {s ? (
        <p className="rounded-xl bg-accent-soft p-3 text-sm">
          {t("loyaltyExample", { spend: money(s), value: money(v ?? 0), rate })}
        </p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending || !s || v == null}
          className={primary}
          onClick={() =>
            run(
              () => updateLoyaltyAction(rid, { enabled, spendPerPointCents: s!, pointValueCents: v! }),
              () => setSaved(true),
            )
          }
        >
          {saved ? t("saved") : t("save")}
        </button>
      ) : null}
    </div>
  );
}

// ─── House account ───────────────────────────────────────────────────────────

export function HouseAccount({
  rid,
  customerId,
  currency,
  creditLimitCents,
  balanceCents,
  entries,
  canManage,
  canRecord,
}: {
  rid: string;
  customerId: string;
  currency: string;
  creditLimitCents: number | null;
  balanceCents: number;
  entries: {
    id: string;
    kind: string;
    amountCents: number;
    method: string | null;
    createdAt: string;
    orderNumber: string | null;
  }[];
  canManage: boolean;
  canRecord: boolean;
}) {
  const t = useTranslations("customers.account");
  const locale = useLocale();
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [limit, setLimit] = useState(
    creditLimitCents != null ? centsToInput(creditLimitCents, locale, currency) : "",
  );
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card" | "transfer">("cash");
  const pay = parseMoneyInput(amount, currency);
  const used = creditLimitCents ? Math.min(100, (balanceCents / creditLimitCents) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-3 font-semibold">{t("title")}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-danger-soft/60 px-3 py-2">
          <p className="text-xs text-fg-muted">{t("balance")}</p>
          <p className="text-lg font-bold text-danger tabular-nums">{money(balanceCents)}</p>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <p className="text-xs text-fg-muted">{t("limit")}</p>
          <p className="text-lg font-bold tabular-nums">
            {creditLimitCents != null ? money(creditLimitCents) : t("none")}
          </p>
        </div>
      </div>
      {creditLimitCents ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-danger" style={{ width: `${used}%` }} />
        </div>
      ) : null}
      {canManage ? (
        <div className="mt-3 flex gap-2">
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="numeric"
            dir="ltr"
            placeholder={t("limitPlaceholder")}
            className={cn(field, "h-10")}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                setCreditLimitAction(
                  rid,
                  customerId,
                  limit.trim() ? (parseMoneyInput(limit, currency) ?? 0) : null,
                ),
              )
            }
            className={ghost}
          >
            {limit.trim() ? t("setLimit") : t("disable")}
          </button>
        </div>
      ) : null}
      {canRecord && balanceCents > 0 ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">{t("repay")}</p>
          <div className="flex gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              placeholder={String(Math.round(balanceCents / (currency === "IRR" ? 1000 : 100)))}
              className={cn(field, "h-10")}
            />
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
              className={cn(field, "h-10 w-32")}
            >
              {(["cash", "card", "transfer"] as const).map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={pending || !pay}
            onClick={() =>
              run(
                () => repayAccountAction(rid, customerId, { amountCents: pay!, method, note: "" }),
                () => setAmount(""),
              )
            }
            className={cn(primary, "w-full justify-center")}
          >
            {t("recordRepayment")}
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      {entries.length ? (
        <ul className="mt-3 divide-y divide-border text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-2">
              <span>{t(`kinds.${e.kind}`)}</span>
              {e.orderNumber ? (
                <span className="text-xs text-fg-subtle tabular-nums">{e.orderNumber}</span>
              ) : null}
              {e.method ? <span className="text-xs text-fg-subtle">{t(`methods.${e.method}`)}</span> : null}
              <span className="ms-auto text-xs text-fg-subtle">
                {new Date(e.createdAt).toLocaleDateString(locale === "fa" ? "fa-IR" : locale)}
              </span>
              <span
                dir="ltr"
                className={cn(
                  "w-28 text-end font-semibold tabular-nums",
                  e.amountCents > 0 ? "text-danger" : "text-success",
                )}
              >
                {e.amountCents > 0 ? "+" : "−"}
                {money(Math.abs(e.amountCents))}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
