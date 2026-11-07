"use client";

import {
  BadgeCheck,
  BedDouble,
  Check,
  CircleAlert,
  CreditCard,
  IdCard,
  KeyRound,
  Printer,
  Sparkles,
  Star,
  Wallet,
  Wifi,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { isIranNationalCode } from "@/lib/iran-id";
import { centsToInput, normalizeDigits, parseMoneyInput } from "@/lib/money";
import { cn } from "@/lib/cn";
import { Link, useRouter } from "@/i18n/navigation";
import { EDITION } from "@/config/edition";
import {
  checkInAction,
  checkInContextAction,
  postPaymentAction,
  updateIdentityAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, inputCls, useDay } from "./kit";

type Ctx = {
  businessDate: string;
  wifi: { name: string | null; password: string | null };
  stay: {
    id: string;
    number: number;
    status: string;
    arrival: string;
    departure: string;
    adults: number;
    children: number;
    roomTypeId: string;
    roomId: string | null;
    typeCode: string;
    totalCents: number;
    eta: string | null;
    notes: string | null;
    precheckinAt: string | Date | null;
    precheckinSigned: boolean;
    accountName: string | null;
  };
  guest: {
    id: string;
    firstName: string;
    lastName: string;
    fatherName: string | null;
    phone: string | null;
    nationality: string | null;
    documentType: string | null;
    documentNumber: string | null;
    birthDate: string | null;
    vip: boolean;
    blacklisted: boolean;
    preferences: string | null;
  };
  identityComplete: boolean;
  folioId: string | null;
  paidCents: number;
  dueCents: number;
  firstNightCents: number;
  rooms: {
    id: string;
    label: string;
    zone: string | null;
    housekeeping: string;
    roomTypeId: string | null;
    typeCode: string | null;
    occupiedNow: boolean;
  }[];
};

const METHODS = ["card", "cash", "transfer", "online"] as const;
const CLEAN = ["clean", "inspected"];

/**
 * Guided check-in, in one panel: the guest's identity as the police register needs it, the room
 * (clean rooms of the booked type first, upgrades a tap away), money taken on arrival, then a
 * welcome card with the room, the Wi-Fi and the registration form to print.
 */
/**
 * The open check-in lives outside the list that opened it: a front desk row disappears once its
 * guest is checked in (live refresh), the welcome card must not go with it.
 */
type Open = { restaurantId: string; currency: string; stayId: string } | null;
let current: Open = null;
const listeners = new Set<() => void>();
const setOpen = (v: Open) => {
  current = v;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Mounted once per dashboard page (layout): shows the check-in panel when a button opens it. */
export function CheckInHost() {
  const open = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  if (!open) return null;
  return <CheckInPanel {...open} onClose={() => setOpen(null)} />;
}

export function CheckInButton({
  restaurantId,
  currency,
  stayId,
  label,
  variant = "primary",
  size = "sm",
  autoOpen = false,
}: {
  restaurantId: string;
  currency: string;
  stayId: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  autoOpen?: boolean;
}) {
  const t = useTranslations("pms.checkin");
  useEffect(() => {
    if (autoOpen) setOpen({ restaurantId, currency, stayId });
  }, [autoOpen, restaurantId, currency, stayId]);
  return (
    <Button variant={variant} size={size} onClick={() => setOpen({ restaurantId, currency, stayId })}>
      <KeyRound className="size-4" aria-hidden="true" />
      {label ?? t("open")}
    </Button>
  );
}

function CheckInPanel({
  restaurantId,
  currency,
  stayId,
  onClose,
}: {
  restaurantId: string;
  currency: string;
  stayId: string;
  onClose: () => void;
}) {
  const t = useTranslations("pms.checkin");
  const tHk = useTranslations("pms.housekeeping");
  const tMethod = useTranslations("pms.method");
  const tErr = useTranslations("errorCodes");
  const money = useMoney(currency);
  const day = useDay();
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  // Identity
  const [editing, setEditing] = useState(false);
  const [foreign, setForeign] = useState(false);
  const [id, setId] = useState({
    firstName: "",
    lastName: "",
    fatherName: "",
    phone: "",
    documentNumber: "",
    nationality: "",
  });
  // Room
  const [roomId, setRoomId] = useState<string>("");
  const [anyType, setAnyType] = useState(false);
  // Money
  const [method, setMethod] = useState<(typeof METHODS)[number]>("card");
  const [amount, setAmount] = useState("");
  // Run
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ room: string } | null>(null);

  useEffect(() => {
    let live = true;
    checkInContextAction(restaurantId, stayId).then((res) => {
      if (!live) return;
      if (!res?.ok || !res.data) {
        setLoadErrorKey(res && !res.ok && res.error ? res.error : "internal");
        return;
      }
      const c = res.data as Ctx;
      setCtx(c);
      const g = c.guest;
      setForeign(!!g.nationality && g.nationality !== "IR");
      setId({
        firstName: g.firstName ?? "",
        lastName: g.lastName ?? "",
        fatherName: g.fatherName ?? "",
        phone: g.phone ?? "",
        documentNumber: g.documentNumber ?? "",
        nationality: g.nationality && g.nationality !== "IR" ? g.nationality : "",
      });
      setEditing(!c.identityComplete);
      // Suggestion: the booked room if still fine, else the first clean free room of the type.
      const ofType = c.rooms.filter((r) => r.roomTypeId === c.stay.roomTypeId && !r.occupiedNow);
      const booked = c.rooms.find((r) => r.id === c.stay.roomId && !r.occupiedNow);
      setRoomId(booked?.id ?? ofType.find((r) => CLEAN.includes(r.housekeeping))?.id ?? ofType[0]?.id ?? "");
      setAmount(c.dueCents > 0 && !c.stay.accountName ? centsToInput(c.dueCents, "fa", currency) : "");
    });
    return () => {
      live = false;
    };
  }, [restaurantId, stayId, currency]);
  const loadError = loadErrorKey ? (tErr.has(loadErrorKey) ? tErr(loadErrorKey) : tErr("internal")) : null;

  const rooms = useMemo(() => {
    if (!ctx) return [];
    const list = anyType ? ctx.rooms : ctx.rooms.filter((r) => r.roomTypeId === ctx.stay.roomTypeId);
    // Free and clean first, then free rooms still to clean, rooms with a guest still in last.
    const rank = (r: (typeof list)[number]) => (r.occupiedNow ? 2 : CLEAN.includes(r.housekeeping) ? 0 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b)).slice(0, anyType ? 60 : 40);
  }, [ctx, anyType]);
  const room = ctx?.rooms.find((r) => r.id === roomId) ?? null;
  const suggested = ctx?.rooms.find(
    (r) => r.roomTypeId === ctx.stay.roomTypeId && !r.occupiedNow && CLEAN.includes(r.housekeeping),
  );

  const iranian = EDITION === "iran" && !foreign;
  const codeOk = !iranian || (id.documentNumber ? isIranNationalCode(id.documentNumber) : false);
  const identityOk =
    !!id.lastName.trim() &&
    (EDITION !== "iran" ||
      (iranian
        ? codeOk && !!id.fatherName.trim()
        : !!id.documentNumber.trim() && /^[A-Za-z]{2}$/.test(id.nationality)));
  const amountCents = amount.trim() ? parseMoneyInput(amount, currency) : 0;

  const run = async () => {
    if (!ctx) return;
    setError(null);
    setBusy(true);
    try {
      // 1. Identity (only when edited, so a pre-registered guest is not touched).
      if (editing) {
        const res = await updateIdentityAction(restaurantId, ctx.guest.id, {
          firstName: id.firstName,
          lastName: id.lastName,
          fatherName: iranian ? id.fatherName : ctx.guest.fatherName,
          phone: id.phone,
          nationality: iranian ? "IR" : id.nationality.toUpperCase(),
          documentType: id.documentNumber ? (iranian ? "id_card" : "passport") : null,
          documentNumber: id.documentNumber ? normalizeDigits(id.documentNumber) : null,
        });
        if (!res?.ok) throw new Error(res?.error ?? "internal");
      }
      // 2. Money on arrival.
      if (amountCents && amountCents > 0 && ctx.folioId) {
        const res = await postPaymentAction(restaurantId, ctx.folioId, {
          amountCents,
          method,
          reference: t("arrivalPayment"),
        });
        if (!res?.ok) throw new Error(res?.error ?? "internal");
      }
      // 3. Into the room.
      const dirty = !!room && !CLEAN.includes(room.housekeeping);
      const res = await checkInAction(restaurantId, ctx.stay.id, roomId || null, dirty);
      if (!res?.ok) throw new Error(res?.error ?? "internal");
      // The page refreshes when the welcome card is closed (it would unmount it now).
      setDone({ room: room?.label ?? "" });
    } catch (e) {
      const key = e instanceof Error ? e.message : "internal";
      setError(tErr.has(key) ? tErr(key) : tErr("internal"));
    } finally {
      setBusy(false);
    }
  };

  const guestName = ctx
    ? `${id.firstName || ctx.guest.firstName} ${id.lastName || ctx.guest.lastName}`.trim()
    : "";

  const close = () => {
    if (done) router.refresh();
    onClose();
  };

  return (
    <Sheet title={done ? t("welcomeTitle") : t("title", { name: guestName || "…" })} onClose={close} wide>
      {loadError ? (
        <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{loadError}</p>
      ) : null}
      {!ctx && !loadError ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-2" />
          ))}
        </div>
      ) : null}

      {ctx && done ? (
        <div className="space-y-5 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-success text-white">
            <Check className="size-8" strokeWidth={3} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xl font-bold">{t("welcome", { name: guestName })}</p>
            {done.room ? (
              <p className="mt-1 text-3xl font-black tracking-tight text-brand-700">
                {t("roomN", { room: done.room })}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-fg-muted">
              {day(ctx.stay.arrival, { weekday: "long", day: "numeric", month: "long" })} →{" "}
              {day(ctx.stay.departure, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          {ctx.wifi.name ? (
            <div className="mx-auto flex max-w-sm items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-start ring-1 ring-brand-100">
              <Wifi className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold" dir="ltr">
                  {ctx.wifi.name}
                </p>
                {ctx.wifi.password ? (
                  <p className="text-fg-muted" dir="ltr">
                    {ctx.wifi.password}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <p className="text-sm text-fg-muted">{t("portalHint")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={`/dashboard/${restaurantId}/stays/${ctx.stay.id}/registration`}
              target="_blank"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold ring-1 ring-border ring-inset hover:bg-brand-50"
            >
              <Printer className="size-4" aria-hidden="true" />
              {t("printCard")}
            </Link>
            <Button onClick={close}>{t("close")}</Button>
          </div>
        </div>
      ) : null}

      {ctx && !done ? (
        <div className="space-y-5">
          {/* Booking at a glance */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-brand-50 px-4 py-3 text-sm ring-1 ring-brand-100">
            <span className="font-bold text-brand-900">#{ctx.stay.number}</span>
            <span>
              {day(ctx.stay.arrival, { day: "numeric", month: "short" })} →{" "}
              {day(ctx.stay.departure, { day: "numeric", month: "short" })}
            </span>
            <span>{ctx.stay.typeCode}</span>
            <span>{t("people", { n: ctx.stay.adults + ctx.stay.children })}</span>
            {ctx.guest.vip ? (
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--brass)]">
                <Star className="size-3.5 fill-current" aria-hidden="true" /> VIP
              </span>
            ) : null}
            {ctx.stay.accountName ? <span className="font-semibold">{ctx.stay.accountName}</span> : null}
            {ctx.stay.precheckinAt ? (
              <span className="ms-auto inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                {ctx.stay.precheckinSigned ? t("preregisteredSigned") : t("preregistered")}
              </span>
            ) : null}
          </div>
          {ctx.guest.blacklisted ? (
            <p className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              <CircleAlert className="size-4" aria-hidden="true" />
              {t("blacklisted")}
            </p>
          ) : null}
          {ctx.stay.notes || ctx.guest.preferences ? (
            <p className="rounded-xl bg-tone-amber/15 px-4 py-3 text-sm whitespace-pre-line">
              {[ctx.guest.preferences, ctx.stay.notes].filter(Boolean).join("\n")}
            </p>
          ) : null}

          {/* 1. Identity */}
          <section className="rounded-xl border border-border">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Step n={1} ok={identityOk} />
              <h3 className="flex-1 font-bold">{t("identity")}</h3>
              {identityOk && !editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  {t("edit")}
                </Button>
              ) : null}
            </header>
            {!editing ? (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
                <span className="inline-flex items-center gap-2 font-semibold">
                  <IdCard className="size-4 text-brand-600" aria-hidden="true" />
                  {guestName}
                </span>
                {ctx.guest.fatherName ? <span>{t("fatherOf", { name: ctx.guest.fatherName })}</span> : null}
                <span dir="ltr">{ctx.guest.documentNumber}</span>
                <span dir="ltr" className="text-fg-muted">
                  {ctx.guest.phone}
                </span>
              </div>
            ) : (
              <div className="space-y-3 p-4">
                {EDITION === "iran" ? (
                  <div className="inline-flex rounded-lg bg-surface-2 p-1 text-sm font-semibold">
                    {[false, true].map((f) => (
                      <button
                        key={String(f)}
                        type="button"
                        onClick={() => setForeign(f)}
                        className={cn(
                          "h-8 rounded-md px-3 transition-colors",
                          foreign === f ? "bg-surface shadow-sm" : "text-fg-muted",
                        )}
                      >
                        {f ? t("foreign") : t("iranian")}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("firstName")}
                    value={id.firstName}
                    onChange={(v) => setId({ ...id, firstName: v })}
                  />
                  <Field
                    label={t("lastName")}
                    value={id.lastName}
                    onChange={(v) => setId({ ...id, lastName: v })}
                    required
                  />
                  {iranian ? (
                    <>
                      <Field
                        label={t("nationalCode")}
                        value={id.documentNumber}
                        onChange={(v) =>
                          setId({ ...id, documentNumber: v.replace(/[^\d۰-۹٠-٩]/g, "").slice(0, 10) })
                        }
                        ltr
                        required
                        error={id.documentNumber && !codeOk ? t("badNationalCode") : undefined}
                      />
                      <Field
                        label={t("fatherName")}
                        value={id.fatherName}
                        onChange={(v) => setId({ ...id, fatherName: v })}
                        required
                      />
                    </>
                  ) : (
                    <>
                      <Field
                        label={t("passport")}
                        value={id.documentNumber}
                        onChange={(v) => setId({ ...id, documentNumber: v })}
                        ltr
                        required
                      />
                      <Field
                        label={t("nationality")}
                        value={id.nationality}
                        onChange={(v) => setId({ ...id, nationality: v.toUpperCase().slice(0, 2) })}
                        ltr
                        required
                      />
                    </>
                  )}
                  <Field
                    label={t("phone")}
                    value={id.phone}
                    onChange={(v) => setId({ ...id, phone: v })}
                    ltr
                  />
                </div>
                <p className="text-xs text-fg-muted">{t("amakenHint")}</p>
              </div>
            )}
          </section>

          {/* 2. Room */}
          <section className="rounded-xl border border-border">
            <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <Step n={2} ok={!!roomId} />
              <h3 className="flex-1 font-bold">{t("room")}</h3>
              <label className="flex items-center gap-2 text-xs font-semibold text-fg-muted">
                <input
                  type="checkbox"
                  checked={anyType}
                  onChange={(e) => setAnyType(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                {t("upgrade")}
              </label>
            </header>
            <div className="p-4">
              {suggested && suggested.id === roomId ? (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-tone-violet/12 px-2 py-1 text-xs font-semibold text-tone-violet">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  {t("suggested", { room: suggested.label })}
                </p>
              ) : null}
              {rooms.length ? (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                  {rooms.map((r) => {
                    const clean = CLEAN.includes(r.housekeeping);
                    const selected = r.id === roomId;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          disabled={r.occupiedNow}
                          onClick={() => setRoomId(r.id)}
                          title={r.occupiedNow ? t("occupiedNow") : tHk(r.housekeeping)}
                          className={cn(
                            "flex w-full flex-col items-center rounded-lg px-2 py-2 text-center ring-1 transition-colors ring-inset",
                            selected
                              ? "bg-brand-600 text-white ring-brand-600"
                              : r.occupiedNow
                                ? "cursor-not-allowed bg-surface-2 text-fg-subtle ring-border"
                                : "bg-surface ring-border hover:bg-brand-50 hover:ring-brand-200",
                          )}
                        >
                          <span className="text-sm font-bold tabular-nums">{r.label}</span>
                          <span
                            className={cn(
                              "mt-0.5 flex items-center gap-1 text-[10px] font-semibold",
                              selected ? "text-white/85" : clean ? "text-success" : "text-warning",
                            )}
                          >
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                selected ? "bg-white" : clean ? "bg-success" : "bg-warning",
                              )}
                              aria-hidden="true"
                            />
                            {r.occupiedNow ? t("occupiedShort") : tHk(r.housekeeping)}
                          </span>
                          {anyType && r.typeCode ? (
                            <span className={cn("text-[10px]", selected ? "text-white/80" : "text-fg-muted")}>
                              {r.typeCode}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">{t("noRoom")}</p>
              )}
              {room && !CLEAN.includes(room.housekeeping) ? (
                <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm">{t("dirtyWarning")}</p>
              ) : null}
              {room && room.roomTypeId !== ctx.stay.roomTypeId ? (
                <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  {t("upgradeNote")}
                </p>
              ) : null}
            </div>
          </section>

          {/* 3. Money */}
          <section className="rounded-xl border border-border">
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Step n={3} ok />
              <h3 className="flex-1 font-bold">{t("payment")}</h3>
              <span className="text-sm text-fg-muted">
                {t("paid", { amount: money(ctx.paidCents) })} |{" "}
                <strong className="text-fg">{t("due", { amount: money(ctx.dueCents) })}</strong>
              </span>
            </header>
            <div className="space-y-3 p-4">
              {ctx.stay.accountName ? (
                <p className="text-sm text-fg-muted">{t("companyPays", { account: ctx.stay.accountName })}</p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { k: "none", v: "" },
                  { k: "firstNight", v: centsToInput(ctx.firstNightCents, "fa", currency) },
                  { k: "whole", v: centsToInput(ctx.dueCents, "fa", currency) },
                ].map((o) => (
                  <button
                    key={o.k}
                    type="button"
                    onClick={() => setAmount(o.v)}
                    className={cn(
                      "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors",
                      amount === o.v
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-800 hover:bg-brand-100",
                    )}
                  >
                    {t(`take.${o.k}`)}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label>
                  <Label>{t("amount")}</Label>
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    dir="ltr"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                </label>
                <div>
                  <Label>{t("method")}</Label>
                  <div className="flex h-11 rounded-xl bg-surface-2 p-1">
                    {METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg px-2.5 text-xs font-semibold",
                          method === m ? "bg-surface shadow-sm" : "text-fg-muted",
                        )}
                      >
                        {m === "card" ? (
                          <CreditCard className="size-3.5" aria-hidden="true" />
                        ) : m === "cash" ? (
                          <Wallet className="size-3.5" aria-hidden="true" />
                        ) : null}
                        {tMethod(m)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <FormError error={error} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              size="lg"
              onClick={run}
              disabled={busy || !identityOk || !roomId || ctx.guest.blacklisted || amountCents === null}
            >
              <BedDouble className="size-4" aria-hidden="true" />
              {busy ? "…" : room ? t("confirmRoom", { room: room.label }) : t("confirm")}
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function Step({ n, ok }: { n: number; ok: boolean }) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold",
        ok ? "bg-success text-white" : "bg-brand-100 text-brand-800",
      )}
      aria-hidden="true"
    >
      {ok ? <Check className="size-4" strokeWidth={3} /> : n}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  ltr,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ltr?: boolean;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <Label>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      <input
        className={cn(
          inputCls,
          error && "border-danger ring-2 ring-danger/20",
          required && !value && "border-warning",
        )}
        dir={ltr ? "ltr" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-danger">{error}</span> : null}
    </label>
  );
}
