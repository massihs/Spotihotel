"use client";

import {
  BedDouble,
  CalendarDays,
  Check,
  ChevronDown,
  Coffee,
  KeyRound,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { DateInput } from "@/components/ui/date-input";
import { normalizeDigits, parseMoneyInput } from "@/lib/money";
import { isIranNationalCode } from "@/lib/iran-id";
import { cn } from "@/lib/cn";
import { EDITION } from "@/config/edition";
import {
  availableRoomsAction,
  bookingOptionsAction,
  checkInAction,
  createStayAction,
  searchGuestsAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, inputCls, useDay } from "./kit";

type Quote = {
  ratePlanId: string | null;
  code: string | null;
  name: string | null;
  mealPlan: string;
  refundable: boolean;
  cancelHours: number;
  isDefault: boolean;
  totalCents: number;
  perNightCents: number;
  nights: { day: string; rateCents: number }[];
  adjusted: boolean;
  issues: string[];
  minStay: number;
};
type Option = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  baseOccupancy: number;
  maxOccupancy: number;
  rooms: number;
  available: number;
  closed: boolean;
  fits: boolean;
  fromCents: number | null;
  quotes: Quote[];
};
type GuestHit = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  vip: boolean;
  blacklisted: boolean;
  stays?: number;
};
type Room = { id: string; label: string; housekeeping: string; zone: string | null; occupiedNow: boolean };

const SOURCES =
  EDITION === "iran"
    ? [
        "direct",
        "phone",
        "walk_in",
        "website",
        "snapptrip",
        "alibaba",
        "jabama",
        "eghamat24",
        "jainjas",
        "flytoday",
        "otaghak",
        "agency",
        "email",
        "other",
      ]
    : ["direct", "phone", "walk_in", "website", "email", "agency", "booking", "expedia", "airbnb", "other"];
const GUARANTEES = ["none", "card", "deposit", "company"];
/** Busy weekend nights: Wednesday and Thursday in Iran, Friday and Saturday elsewhere. */
const WEEKEND_START = EDITION === "iran" ? 3 : 5;

const add = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/**
 * Express booking: dates and party at the top, every room type below with its free rooms and the
 * price of each rate plan — one click picks the offer — then the guest (found or new) and a
 * summary with the cancellation policy. A walk-in is booked and checked in in the same click.
 */
export function BookingDesk({
  restaurantId,
  currency,
  today,
  accounts,
  canNegotiate,
  initial,
}: {
  restaurantId: string;
  currency: string;
  /** The hotel's business day. */
  today: string;
  accounts: { id: string; name: string }[];
  canNegotiate: boolean;
  initial?: { roomTypeId?: string; arrival?: string; departure?: string; roomId?: string; source?: string };
}) {
  const t = useTranslations("pms.book");
  const tSrc = useTranslations("pms.source");
  const tG = useTranslations("pms.guarantee");
  const tMeal = useTranslations("pms.meal");
  const tHk = useTranslations("pms.housekeeping");
  const tErr = useTranslations("errorCodes");
  const router = useRouter();
  const money = useMoney(currency);
  const day = useDay();

  const firstArrival = initial?.arrival && initial.arrival >= today ? initial.arrival : today;
  const [arrival, setArrival] = useState(firstArrival);
  const [nights, setNights] = useState(
    initial?.departure && initial.departure > firstArrival ? diff(firstArrival, initial.departure) : 1,
  );
  const departure = add(arrival, nights);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [options, setOptions] = useState<Option[] | null>(null);
  const [searchErrorKey, setSearchErrorKey] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [pick, setPick] = useState<{ typeId: string; planId: string | null } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState(initial?.roomId ?? "");
  const [guestQ, setGuestQ] = useState("");
  const [hits, setHits] = useState<GuestHit[]>([]);
  const [guest, setGuest] = useState<GuestHit | null>(null);
  const [foreign, setForeign] = useState(false);
  const [nationalCode, setNationalCode] = useState("");
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Live availability and prices for the dates and party.
  useEffect(() => {
    startSearch(async () => {
      const res = await bookingOptionsAction(restaurantId, { arrival, departure, adults, children });
      if (res?.ok && res.data) {
        setSearchErrorKey(null);
        const list = res.data.types as Option[];
        setOptions(list);
        setPick((p) => {
          // Keep the chosen offer when still sellable, else take the prefilled type's best one.
          const keep =
            p &&
            list
              .find((o) => o.id === p.typeId)
              ?.quotes.find((q) => q.ratePlanId === p.planId && !q.issues.length);
          if (keep) return p;
          const want = list.find((o) => o.id === (p?.typeId ?? initial?.roomTypeId)) ?? null;
          const best = want?.quotes
            .filter((q) => !q.issues.length)
            .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))[0];
          return want && best && want.available > 0 ? { typeId: want.id, planId: best.ratePlanId } : null;
        });
      } else {
        setOptions(null);
        setSearchErrorKey(
          res && !res.ok ? (Object.values(res.fieldErrors ?? {})[0] ?? res.error ?? "internal") : "internal",
        );
      }
    });
  }, [restaurantId, arrival, departure, adults, children, initial?.roomTypeId]);
  const searchError = searchErrorKey
    ? tErr.has(searchErrorKey)
      ? tErr(searchErrorKey)
      : tErr("internal")
    : null;

  const chosenType = options?.find((o) => o.id === pick?.typeId) ?? null;
  const chosen = chosenType?.quotes.find((q) => q.ratePlanId === pick?.planId) ?? null;

  // Free rooms of the chosen type (optional room choice now; otherwise allocated at check-in).
  useEffect(() => {
    if (!pick?.typeId) return;
    let live = true;
    availableRoomsAction(restaurantId, { roomTypeId: pick.typeId, arrival, departure }).then((res) => {
      if (!live) return;
      const list = res?.ok && res.data ? (res.data as Room[]) : [];
      setRooms(list);
      setRoomId((r) => (r && list.some((x) => x.id === r) ? r : ""));
    });
    return () => {
      live = false;
    };
  }, [restaurantId, pick?.typeId, arrival, departure]);

  // Guest search: name (either order), phone, e-mail or ID number, Persian digits accepted.
  useEffect(() => {
    if (guest || guestQ.trim().length < 2) return;
    const id = setTimeout(async () => {
      const res = await searchGuestsAction(restaurantId, guestQ);
      setHits(res?.ok && res.data ? (res.data as GuestHit[]) : []);
    }, 220);
    return () => clearTimeout(id);
  }, [guestQ, guest, restaurantId]);
  const shownHits = guest || guestQ.trim().length < 2 ? [] : hits;

  const sorted = useMemo(
    () =>
      [...(options ?? [])].sort((a, b) => {
        const ok = (o: Option) => (o.fits && o.available > 0 && o.fromCents != null ? 0 : 1);
        return ok(a) - ok(b) || (a.fromCents ?? Infinity) - (b.fromCents ?? Infinity);
      }),
    [options],
  );
  const walkInPossible = arrival === today;
  const codeBad = !foreign && nationalCode.length > 0 && !isIranNationalCode(nationalCode);

  const quick = [
    { k: "tonight", a: today, n: 1 },
    { k: "tomorrow", a: add(today, 1), n: 1 },
    {
      k: "weekend",
      a: add(today, (WEEKEND_START - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7),
      n: 2,
    },
    { k: "week", a: today, n: 7 },
  ] as const;

  const submit = (fd: FormData, checkInNow: boolean) => {
    setError(null);
    if (!chosenType || !chosen) {
      setError(t("pickOffer"));
      return;
    }
    const fixed = str(fd, "fixedRate").trim();
    const fixedRateCents = fixed ? parseMoneyInput(fixed, currency) : null;
    startSave(async () => {
      const res = await createStayAction(restaurantId, {
        guestId: guest?.id ?? null,
        guest: guest
          ? undefined
          : {
              firstName: str(fd, "firstName"),
              lastName: str(fd, "lastName"),
              phone: str(fd, "phone"),
              email: str(fd, "email"),
              ...(EDITION === "iran"
                ? foreign
                  ? {
                      nationality: str(fd, "nationality").toUpperCase().slice(0, 2) || null,
                      documentType: str(fd, "passport") ? ("passport" as const) : null,
                      documentNumber: str(fd, "passport"),
                    }
                  : {
                      fatherName: str(fd, "fatherName"),
                      nationality: "IR",
                      documentType: nationalCode ? ("id_card" as const) : null,
                      documentNumber: normalizeDigits(nationalCode),
                    }
                : {}),
            },
        roomTypeId: chosenType.id,
        ratePlanId: chosen.ratePlanId,
        roomId: roomId || null,
        arrival,
        departure,
        adults,
        children,
        status: fd.get("tentative") ? "tentative" : "confirmed",
        source: (str(fd, "source") || (checkInNow ? "walk_in" : "direct")) as "direct",
        channelRef: str(fd, "channelRef"),
        eta: str(fd, "eta"),
        guarantee: (str(fd, "guarantee") || "none") as "none",
        accountId: str(fd, "accountId") || null,
        notes: str(fd, "notes"),
        fixedRateCents,
        override: !!fd.get("override"),
      });
      if (!res?.ok || !res.data) {
        const key = res && !res.ok ? (Object.values(res.fieldErrors ?? {})[0] ?? res.error) : "internal";
        setError(tErr.has(key) ? tErr(key) : tErr("internal"));
        return;
      }
      const stayId = res.data;
      if (checkInNow) {
        const dirty = rooms.find((r) => r.id === roomId);
        const ci = await checkInAction(
          restaurantId,
          stayId,
          roomId || null,
          !!dirty && !["clean", "inspected"].includes(dirty.housekeeping),
        );
        if (ci && !ci.ok) {
          // Booked, but the check-in needs the desk (e.g. no clean room yet): open the stay.
          router.push(`/dashboard/${restaurantId}/stays/${stayId}?checkin=1`);
          return;
        }
      }
      router.push(`/dashboard/${restaurantId}/stays/${stayId}${checkInNow ? "?welcome=1" : ""}`);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        submit(new FormData(e.currentTarget), submitter?.value === "checkin");
      }}
      className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div className="min-w-0 space-y-5">
        {/* 1. When and who */}
        <section className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-40 flex-1">
              <Label>{t("arrival")}</Label>
              <DateInput
                className={inputCls}
                min={today}
                value={arrival}
                onChange={(v) => v && setArrival(v < today ? today : v)}
                required
              />
            </label>
            <Stepper label={t("nights")} value={nights} min={1} max={60} onChange={setNights} />
            <label className="min-w-40 flex-1">
              <Label>{t("departure")}</Label>
              <DateInput
                className={inputCls}
                min={add(arrival, 1)}
                value={departure}
                onChange={(v) => v && v > arrival && setNights(Math.min(60, diff(arrival, v)))}
                required
              />
            </label>
            <Stepper
              label={t("adults")}
              value={adults}
              min={1}
              max={20}
              onChange={setAdults}
              icon={<Users className="size-3.5" />}
            />
            <Stepper label={t("children")} value={children} min={0} max={20} onChange={setChildren} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {quick.map((q) => {
              const active = arrival === q.a && nights === q.n;
              return (
                <button
                  key={q.k}
                  type="button"
                  onClick={() => {
                    setArrival(q.a);
                    setNights(q.n);
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                    active ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-800 hover:bg-brand-100",
                  )}
                >
                  {q.k === "tonight" ? (
                    <KeyRound className="size-3.5" aria-hidden="true" />
                  ) : (
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                  )}
                  {t(`quick.${q.k}`)}
                </button>
              );
            })}
            <span className="ms-auto text-sm text-fg-muted">
              {day(arrival, { weekday: "long", day: "numeric", month: "long" })} →{" "}
              {day(departure, { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
        </section>

        {/* 2. Offers: every room type, every rate plan */}
        <section aria-busy={searching} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold">{t("offersTitle")}</h2>
            {searching ? <span className="text-xs text-fg-muted">{t("updating")}</span> : null}
          </div>
          {searchError ? <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm">{searchError}</p> : null}
          {!options && !searchError ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-2" />
              ))}
            </div>
          ) : null}
          <div className={cn("space-y-3 transition-opacity", searching && "opacity-60")}>
            {sorted.map((o) => {
              const soldOut = o.available <= 0;
              const blocked = soldOut || !o.fits;
              return (
                <article
                  key={o.id}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-surface shadow-[var(--shadow-soft)] transition-colors",
                    pick?.typeId === o.id ? "border-brand-400 ring-2 ring-brand-200" : "border-border",
                    blocked && "opacity-65",
                  )}
                >
                  <header className="flex flex-wrap items-center gap-3 border-b border-border bg-brand-50/60 px-4 py-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-brand-100 text-brand-700">
                      <BedDouble className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold">
                        {o.name}{" "}
                        <span className="text-xs font-semibold text-fg-muted" dir="ltr">
                          {o.code}
                        </span>
                      </h3>
                      <p className="text-xs text-fg-muted">
                        {t("upTo", { n: o.maxOccupancy })}
                        {o.description ? ` | ${o.description}` : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-bold",
                        soldOut
                          ? "bg-danger-soft text-danger"
                          : o.available <= 3
                            ? "bg-warning-soft text-warning"
                            : "bg-success-soft text-success",
                      )}
                    >
                      {soldOut
                        ? t("soldOut")
                        : o.available <= 3
                          ? t("lastRooms", { n: o.available })
                          : t("freeRooms", { n: o.available })}
                    </span>
                  </header>
                  {!o.fits ? (
                    <p className="px-4 py-3 text-sm text-fg-muted">{t("issue.too_many_guests")}</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {visibleQuotes(o, expanded.has(o.id), pick).map((q) => {
                        const selected = pick?.typeId === o.id && pick.planId === q.ratePlanId;
                        const disabled = soldOut || q.issues.length > 0;
                        return (
                          <li key={q.ratePlanId ?? "base"}>
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={selected}
                              onClick={() => setPick({ typeId: o.id, planId: q.ratePlanId })}
                              className={cn(
                                "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-start transition-colors",
                                selected ? "bg-brand-50" : "hover:bg-brand-50/50",
                                disabled && "cursor-not-allowed",
                              )}
                            >
                              <span
                                className={cn(
                                  "grid size-5 shrink-0 place-items-center rounded-full ring-2",
                                  selected ? "bg-brand-600 text-white ring-brand-600" : "ring-border-strong",
                                )}
                                aria-hidden="true"
                              >
                                {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{q.name ?? t("baseRate")}</span>
                                <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                                  <span className="inline-flex items-center gap-1 rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-800">
                                    <Coffee className="size-3" aria-hidden="true" />
                                    {tMeal.has(q.mealPlan as "RO") ? tMeal(q.mealPlan as "RO") : q.mealPlan}
                                  </span>
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold",
                                      q.refundable
                                        ? "bg-success-soft text-success"
                                        : "bg-warning-soft text-warning",
                                    )}
                                  >
                                    <ShieldCheck className="size-3" aria-hidden="true" />
                                    {q.refundable
                                      ? t("freeCancel", { h: q.cancelHours })
                                      : t("nonRefundable")}
                                  </span>
                                  {q.adjusted ? (
                                    <span className="inline-flex items-center gap-1 rounded bg-tone-violet/12 px-1.5 py-0.5 font-semibold text-tone-violet">
                                      <Sparkles className="size-3" aria-hidden="true" />
                                      {t("dynamic")}
                                    </span>
                                  ) : null}
                                  {q.issues.map((i) => (
                                    <span
                                      key={i}
                                      className="rounded bg-danger-soft px-1.5 py-0.5 font-semibold text-danger"
                                    >
                                      {t(`issue.${i}`, { n: q.minStay })}
                                    </span>
                                  ))}
                                </span>
                              </span>
                              <span className="text-end">
                                <span className="block font-bold tabular-nums">{money(q.totalCents)}</span>
                                <span className="block text-[11px] text-fg-muted tabular-nums">
                                  {t("perNight", { amount: money(q.perNightCents) })}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                      {o.quotes.length > visibleQuotes(o, false, pick).length ? (
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((x) => {
                                const next = new Set(x);
                                if (next.has(o.id)) next.delete(o.id);
                                else next.add(o.id);
                                return next;
                              })
                            }
                            className="flex w-full items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-brand-700 hover:bg-brand-50/60"
                          >
                            {expanded.has(o.id) ? t("fewerRates") : t("allRates", { n: o.quotes.length })}
                            <ChevronDown
                              className={cn("size-3.5 transition", expanded.has(o.id) && "rotate-180")}
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* 3. Guest */}
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <UserRound className="size-4 text-brand-600" aria-hidden="true" />
            {t("guest")}
          </h2>
          {guest ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-100">
              <div>
                <p className="font-semibold">
                  {guest.vip ? (
                    <Star
                      className="me-1 inline size-3.5 fill-[var(--brass)] text-[var(--brass)]"
                      aria-label="VIP"
                    />
                  ) : null}
                  {guest.firstName} {guest.lastName}
                </p>
                <p className="text-sm text-fg-muted" dir="ltr">
                  {guest.phone}
                </p>
                {guest.stays ? (
                  <p className="text-xs font-semibold text-brand-700">{t("returning", { n: guest.stays })}</p>
                ) : null}
                {guest.blacklisted ? (
                  <p className="text-sm font-semibold text-danger">{t("blacklisted")}</p>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setGuest(null)}>
                <X className="size-4" aria-hidden="true" />
                {t("change")}
              </Button>
            </div>
          ) : (
            <>
              <label className="relative block">
                <span className="sr-only">{t("findGuest")}</span>
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
                  aria-hidden="true"
                />
                <input
                  className={cn(inputCls, "ps-9")}
                  value={guestQ}
                  onChange={(e) => setGuestQ(e.target.value)}
                  placeholder={t("findGuestHint")}
                />
              </label>
              {shownHits.length ? (
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {shownHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start text-sm hover:bg-brand-50"
                        onClick={() => setGuest(h)}
                      >
                        <span className="font-semibold">
                          {h.vip ? "★ " : ""}
                          {h.firstName} {h.lastName}
                          {h.blacklisted ? (
                            <span className="ms-2 text-xs text-danger">{t("blacklisted")}</span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-3 text-fg-muted">
                          {h.stays ? <span className="text-xs">{t("returning", { n: h.stays })}</span> : null}
                          <span dir="ltr">{h.phone}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex items-center gap-3 text-sm text-fg-muted">
                <span className="h-px flex-1 bg-border" />
                {t("orNewGuest")}
                <span className="h-px flex-1 bg-border" />
              </div>
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
                      {f ? t("foreignGuest") : t("iranianGuest")}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <Label>{t("firstName")}</Label>
                  <input name="firstName" className={inputCls} maxLength={80} autoComplete="off" />
                </label>
                <label>
                  <Label>{t("lastName")}</Label>
                  <input
                    name="lastName"
                    className={inputCls}
                    required={!guest}
                    maxLength={80}
                    autoComplete="off"
                  />
                </label>
                <label>
                  <Label>{t("phone")}</Label>
                  <input
                    name="phone"
                    type="tel"
                    className={inputCls}
                    maxLength={24}
                    dir="ltr"
                    placeholder="09…"
                  />
                </label>
                <label>
                  <Label>{t("email")}</Label>
                  <input name="email" type="email" className={inputCls} maxLength={320} dir="ltr" />
                </label>
                {EDITION === "iran" ? (
                  foreign ? (
                    <>
                      <label>
                        <Label>{t("passport")}</Label>
                        <input name="passport" className={inputCls} maxLength={32} dir="ltr" />
                      </label>
                      <label>
                        <Label hint="IQ, TR, DE…">{t("nationality")}</Label>
                        <input
                          name="nationality"
                          className={cn(inputCls, "uppercase")}
                          maxLength={2}
                          dir="ltr"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        <Label>{t("nationalCode")}</Label>
                        <input
                          name="nationalCode"
                          className={cn(inputCls, codeBad && "border-danger ring-2 ring-danger/20")}
                          inputMode="numeric"
                          maxLength={10}
                          dir="ltr"
                          value={nationalCode}
                          onChange={(e) => setNationalCode(e.target.value.replace(/[^\d۰-۹٠-٩]/g, ""))}
                        />
                        {codeBad ? (
                          <span className="mt-1 block text-xs text-danger">{t("badNationalCode")}</span>
                        ) : null}
                      </label>
                      <label>
                        <Label>{t("fatherName")}</Label>
                        <input name="fatherName" className={inputCls} maxLength={80} />
                      </label>
                    </>
                  )
                ) : null}
              </div>
            </>
          )}
        </section>

        {/* 4. Everything else, folded */}
        <details className="group rounded-xl border border-border bg-surface shadow-[var(--shadow-soft)] [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-[15px] font-bold sm:px-5">
            {t("moreOptions")}
            <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 sm:p-5">
            <label>
              <Label>{t("source")}</Label>
              <select name="source" className={inputCls} defaultValue={initial?.source ?? ""}>
                <option value="">{t("sourceAuto")}</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {tSrc(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>{t("channelRef")}</Label>
              <input name="channelRef" className={inputCls} maxLength={64} dir="ltr" />
            </label>
            <label>
              <Label>{t("eta")}</Label>
              <input name="eta" type="time" className={inputCls} />
            </label>
            <label>
              <Label>{t("guarantee")}</Label>
              <select name="guarantee" className={inputCls} defaultValue="none">
                {GUARANTEES.map((s) => (
                  <option key={s} value={s}>
                    {tG(s)}
                  </option>
                ))}
              </select>
            </label>
            {accounts.length ? (
              <label className="sm:col-span-2">
                <Label>{t("account")}</Label>
                <select name="accountId" className={inputCls} defaultValue="">
                  <option value="">{t("noAccount")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {canNegotiate ? (
              <div className="sm:col-span-2">
                <MoneyField
                  name="fixedRate"
                  currency={currency}
                  label={t("fixedRate")}
                  hint={t("fixedRateHint")}
                />
              </div>
            ) : null}
            <label className="sm:col-span-2">
              <Label>{t("notes")}</Label>
              <textarea
                name="notes"
                className={`${inputCls} h-20 py-2`}
                maxLength={2000}
                placeholder={t("notesHint")}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tentative" className="size-4 accent-[var(--accent)]" />{" "}
              {t("tentative")}
            </label>
          </div>
        </details>
      </div>

      {/* Summary */}
      <aside className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)] xl:sticky xl:top-20">
        <h2 className="font-bold">{t("summary")}</h2>
        <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm ring-1 ring-brand-100">
          <p className="font-semibold text-brand-900">
            {day(arrival, { weekday: "short", day: "numeric", month: "short" })} →{" "}
            {day(departure, { weekday: "short", day: "numeric", month: "short" })}
          </p>
          <p className="text-brand-800">
            {t("nightsN", { n: nights })} | {t("guestsN", { n: adults + children })}
          </p>
        </div>
        {chosenType && chosen ? (
          <>
            <div>
              <p className="font-semibold">{chosenType.name}</p>
              <p className="text-sm text-fg-muted">
                {chosen.name ?? t("baseRate")} |{" "}
                {tMeal.has(chosen.mealPlan as "RO") ? tMeal(chosen.mealPlan as "RO") : chosen.mealPlan}
              </p>
            </div>
            <label className="block">
              <Label>{t("room")}</Label>
              <select className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">{t("roomAuto")}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} | {tHk(r.housekeeping)}
                    {r.occupiedNow ? ` | ${t("stillOccupied")}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {chosen.nights.map((n) => (
                <li key={n.day} className="flex justify-between gap-3">
                  <span className="text-fg-muted">
                    {day(n.day, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="tabular-nums">{money(n.rateCents)}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-baseline justify-between border-t border-border pt-3 text-lg font-bold">
              <span>{t("total")}</span>
              <span className="tabular-nums">{money(chosen.totalCents)}</span>
            </p>
            <p
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                chosen.refundable ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              )}
            >
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {chosen.refundable ? t("policyFree", { h: chosen.cancelHours }) : t("policyNonRefundable")}
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-muted">{t("pickOffer")}</p>
        )}
        <FormError error={error} />
        <div className="space-y-2">
          <Button
            type="submit"
            value="book"
            size="lg"
            className="w-full"
            disabled={saving || !chosen || codeBad}
          >
            <Check className="size-4" aria-hidden="true" />
            {t("submit")}
          </Button>
          {walkInPossible ? (
            <Button
              type="submit"
              value="checkin"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={saving || !chosen || codeBad}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              {t("submitCheckIn")}
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-fg-muted">{t("submitHint")}</p>
      </aside>
    </form>
  );
}

/**
 * The rates shown for a room type before "all rates": the house default and the cheapest one
 * that can be sold (and the one picked, if another), so a long rate list stays short.
 */
function visibleQuotes(o: Option, all: boolean, pick: { typeId: string; planId: string | null } | null) {
  if (all || o.quotes.length <= 2) return o.quotes;
  const sellable = o.quotes.filter((q) => !q.issues.length);
  const keep = new Set<string | null>();
  const def = o.quotes.find((q) => q.isDefault) ?? o.quotes[0];
  if (def) keep.add(def.ratePlanId);
  const cheapest = [...sellable].sort((a, b) => a.totalCents - b.totalCents)[0];
  if (cheapest) keep.add(cheapest.ratePlanId);
  if (pick?.typeId === o.id) keep.add(pick.planId);
  return o.quotes.filter((q) => keep.has(q.ratePlanId));
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  icon,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        <span className="inline-flex items-center gap-1">
          {icon}
          {label}
        </span>
      </Label>
      <div className="flex h-11 items-center rounded-xl border border-border-strong bg-surface">
        <button
          type="button"
          aria-label="−"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="grid size-10 place-items-center text-fg-muted hover:text-fg disabled:opacity-30"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <span className="w-8 text-center font-bold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label="+"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="grid size-10 place-items-center text-fg-muted hover:text-fg disabled:opacity-30"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
