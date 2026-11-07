"use client";

import {
  BedDouble,
  CalendarCheck,
  Check,
  ChevronLeft,
  Coffee,
  LoaderCircle,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { normalizeDigits } from "@/lib/money";
import { isIranNationalCode } from "@/lib/iran-id";
import { hotelBookAction, hotelOffersAction } from "@/app/[locale]/h/actions";
import { FormError, Label, inputCls, useDay } from "./kit";

type Offer = {
  ratePlanId: string | null;
  name: string | null;
  mealPlan: string;
  refundable: boolean;
  cancelHours: number;
  totalCents: number;
  perNightCents: number;
};
type RoomType = {
  id: string;
  name: string;
  description: string | null;
  maxOccupancy: number;
  amenities: string[];
  left: number;
  fits: boolean;
  closed: boolean;
  minStay: number;
  offers: Offer[];
  fromCents: number | null;
};
type Results = { arrival: string; departure: string; nights: number; types: RoomType[] };
type Booked = {
  number: number;
  arrival: string;
  departure: string;
  totalCents: number;
  planName: string | null;
  refundable: boolean;
  cancelHours: number;
  precheckin: string;
};

const add = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const diff = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);

/** The hotel's own booking page: dates and guests, rooms and prices, details, done. */
export function OnlineBooking({
  slug,
  hotel,
  currency,
  today,
}: {
  slug: string;
  hotel: { name: string; city: string | null; address: string | null; phone: string | null };
  currency: string;
  today: string;
}) {
  const t = useTranslations("onlineBooking");
  const tMeal = useTranslations("pms.meal");
  const tErr = useTranslations("errorCodes");
  const money = useMoney(currency);
  const day = useDay();

  const [arrival, setArrival] = useState(today);
  const [nights, setNights] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const departure = add(arrival, nights);

  const [results, setResults] = useState<Results | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  useEffect(() => {
    const id = setTimeout(
      () =>
        startSearch(async () => {
          const res = await hotelOffersAction(slug, { arrival, departure, adults, children });
          if (!res) return;
          if (!res.ok) {
            setSearchError(res.error);
            return;
          }
          setSearchError(null);
          setResults(res.data as Results);
        }),
      200,
    );
    return () => clearTimeout(id);
  }, [slug, arrival, departure, adults, children]);

  const [picked, setPicked] = useState<{ type: RoomType; offer: Offer } | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);
  // Prices change with the dates: a choice made for other dates is dropped.
  const fresh = picked && results && results.arrival === arrival && results.departure === departure;

  if (booked)
    return (
      <Shell hotel={hotel} t={t}>
        <section className="animate-pop-in rounded-3xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-soft)] sm:p-8">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-success text-white">
            <Check className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-2xl font-bold">{t("doneTitle")}</h2>
          <p className="mt-1 text-fg-muted">{t("doneNumber", { number: booked.number })}</p>
          <dl className="mx-auto mt-6 max-w-sm space-y-2 text-start text-sm">
            <Line k={t("dates")} v={`${day(booked.arrival)} → ${day(booked.departure)}`} />
            {booked.planName ? <Line k={t("offer")} v={booked.planName} /> : null}
            <Line k={t("total")} v={money(booked.totalCents)} strong />
            <Line
              k={t("cancellation")}
              v={booked.refundable ? t("freeCancel", { h: booked.cancelHours }) : t("nonRefundable")}
            />
          </dl>
          <div className="mx-auto mt-6 max-w-sm rounded-2xl bg-brand-50 p-4 text-start text-sm ring-1 ring-brand-200">
            <p className="font-semibold">{t("precheckinTitle")}</p>
            <p className="mt-1 text-fg-muted">{t("precheckinBody")}</p>
            <a
              href={booked.precheckin}
              className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("precheckinCta")}
            </a>
          </div>
          <p className="mt-5 text-xs text-fg-subtle">{t("payAtHotel")}</p>
        </section>
      </Shell>
    );

  return (
    <Shell hotel={hotel} t={t}>
      {/* When and who */}
      <section className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-44 flex-1">
            <Label>{t("arrival")}</Label>
            <DateInput
              className={inputCls}
              min={today}
              value={arrival}
              onChange={(v) => v && setArrival(v < today ? today : v)}
              required
            />
          </label>
          <Stepper label={t("nights")} value={nights} min={1} max={30} onChange={setNights} />
          <label className="min-w-44 flex-1">
            <Label>{t("departure")}</Label>
            <DateInput
              className={inputCls}
              min={add(arrival, 1)}
              value={departure}
              onChange={(v) => v && v > arrival && setNights(Math.min(30, diff(arrival, v)))}
              required
            />
          </label>
          <Stepper
            label={t("adults")}
            value={adults}
            min={1}
            max={8}
            onChange={setAdults}
            icon={<Users className="size-3.5" />}
          />
          <Stepper label={t("children")} value={children} min={0} max={8} onChange={setChildren} />
        </div>
      </section>

      {fresh && picked ? (
        <GuestStep
          slug={slug}
          type={picked.type}
          offer={picked.offer}
          arrival={arrival}
          departure={departure}
          nights={nights}
          adults={adults}
          kids={children}
          currency={currency}
          back={() => setPicked(null)}
          done={setBooked}
        />
      ) : (
        <section aria-busy={searching} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("roomsTitle")}</h2>
            {searching ? (
              <span className="inline-flex items-center gap-2 text-sm text-fg-muted">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t("searching")}
              </span>
            ) : results ? (
              <span className="text-sm text-fg-muted">
                {day(results.arrival)} → {day(results.departure)} | {t("nightsN", { n: results.nights })}
              </span>
            ) : null}
          </div>
          {searchError ? (
            <FormError error={tErr.has(searchError) ? tErr(searchError) : tErr("internal")} />
          ) : null}
          {results && !results.types.some((x) => x.offers.length) && !searching ? (
            <p className="rounded-2xl bg-surface-2 p-6 text-center text-sm text-fg-muted">{t("noRooms")}</p>
          ) : null}
          <div className={cn("space-y-3 transition-opacity", searching && "opacity-60")}>
            {results?.types.map((rt) => (
              <article
                key={rt.id}
                className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                      <BedDouble className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold">{rt.name}</h3>
                      <p className="text-sm text-fg-muted">{t("upTo", { n: rt.maxOccupancy })}</p>
                      {rt.description ? <p className="mt-1 text-sm text-fg-muted">{rt.description}</p> : null}
                      {rt.amenities.length ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {rt.amenities.slice(0, 8).map((a) => (
                            <li
                              key={a}
                              className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted"
                            >
                              {a}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                  {rt.offers.length && rt.left <= 3 ? (
                    <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold">
                      {t("lastRooms", { n: rt.left })}
                    </span>
                  ) : null}
                </div>
                {rt.offers.length ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {rt.offers.map((o) => (
                      <li
                        key={o.ratePlanId ?? "base"}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold">{o.name ?? t("roomOnly")}</p>
                          <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-brand-700">
                              <Coffee className="size-3" aria-hidden="true" />
                              {tMeal.has(o.mealPlan as "RO") ? tMeal(o.mealPlan as "RO") : o.mealPlan}
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5",
                                o.refundable ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
                              )}
                            >
                              {o.refundable ? t("freeCancel", { h: o.cancelHours }) : t("nonRefundable")}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-end">
                            <p className="text-lg font-bold tabular-nums">{money(o.totalCents)}</p>
                            <p className="text-xs text-fg-muted">
                              {t("perNight", { price: money(o.perNightCents) })}
                            </p>
                          </div>
                          <Button size="md" onClick={() => setPicked({ type: rt, offer: o })}>
                            {t("choose")}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="border-t border-border px-5 py-3 text-sm text-fg-muted">
                    {!rt.fits
                      ? t("tooMany", { n: rt.maxOccupancy })
                      : rt.minStay
                        ? t("minStay", { n: rt.minStay })
                        : t("soldOut")}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function Shell({
  hotel,
  t,
  children,
}: {
  hotel: { name: string; city: string | null; address: string | null; phone: string | null };
  t: ReturnType<typeof useTranslations<"onlineBooking">>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-[var(--sidebar)] text-[var(--sidebar-fg)]">
        <div className="mx-auto max-w-4xl px-4 pt-8 pb-14 sm:px-6">
          <p className="text-xs tracking-[0.2em] text-[var(--brass)] uppercase">{t("eyebrow")}</p>
          <h1 className="mt-1 text-3xl font-bold">{hotel.name}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-80">
            {hotel.address || hotel.city ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden="true" />
                {[hotel.address, hotel.city].filter(Boolean).join("، ")}
              </span>
            ) : null}
            {hotel.phone ? (
              <a
                href={`tel:${hotel.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5"
                dir="ltr"
              >
                <Phone className="size-4" aria-hidden="true" />
                {hotel.phone}
              </a>
            ) : null}
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
            <CalendarCheck className="size-3.5" aria-hidden="true" />
            {t("promise")}
          </p>
        </div>
      </header>
      <main className="mx-auto -mt-8 max-w-4xl space-y-5 px-4 pb-16 sm:px-6">{children}</main>
    </div>
  );
}

function GuestStep({
  slug,
  type,
  offer,
  arrival,
  departure,
  nights,
  adults,
  kids,
  currency,
  back,
  done,
}: {
  slug: string;
  type: RoomType;
  offer: Offer;
  arrival: string;
  departure: string;
  nights: number;
  adults: number;
  kids: number;
  currency: string;
  back: () => void;
  done: (b: Booked) => void;
}) {
  const t = useTranslations("onlineBooking");
  const tMeal = useTranslations("pms.meal");
  const tErr = useTranslations("errorCodes");
  const money = useMoney(currency);
  const day = useDay();
  const [foreign, setForeign] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const codeBad = !foreign && code.length > 0 && !isIranNationalCode(normalizeDigits(code));

  return (
    <form
      className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_300px]"
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await hotelBookAction(slug, {
            arrival,
            departure,
            adults,
            children: kids,
            roomTypeId: type.id,
            ratePlanId: offer.ratePlanId,
            firstName: String(fd.get("firstName") ?? ""),
            lastName: String(fd.get("lastName") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            email: String(fd.get("email") ?? ""),
            foreign,
            nationalCode: foreign ? "" : code,
            eta: String(fd.get("eta") ?? ""),
            notes: String(fd.get("notes") ?? ""),
            website: String(fd.get("website") ?? ""),
          });
          if (!res) return;
          if (!res.ok) {
            setError(res.error);
            return;
          }
          done(res.data as Booked);
        })
      }
    >
      <section className="space-y-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("otherRooms")}
        </button>
        <h2 className="text-lg font-bold">{t("guestTitle")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <Label>{t("firstName")}</Label>
            <input name="firstName" required maxLength={80} autoComplete="given-name" className={inputCls} />
          </label>
          <label>
            <Label>{t("lastName")}</Label>
            <input name="lastName" required maxLength={80} autoComplete="family-name" className={inputCls} />
          </label>
          <label>
            <Label>{t("phone")}</Label>
            <input
              name="phone"
              required
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="09…"
              className={inputCls}
            />
          </label>
          <label>
            <Label>{t("email")}</Label>
            <input name="email" type="email" autoComplete="email" dir="ltr" className={inputCls} />
          </label>
        </div>
        <div role="radiogroup" aria-label={t("nationality")} className="flex flex-wrap gap-2">
          {[false, true].map((f) => (
            <button
              key={String(f)}
              type="button"
              role="radio"
              aria-checked={foreign === f}
              onClick={() => setForeign(f)}
              className={cn(
                "h-9 rounded-full px-4 text-sm font-semibold ring-1 transition",
                foreign === f
                  ? "bg-brand-700 text-white ring-brand-700"
                  : "bg-surface text-fg-muted ring-border hover:bg-brand-50",
              )}
            >
              {f ? t("foreignGuest") : t("iranianGuest")}
            </button>
          ))}
        </div>
        {!foreign ? (
          <label className="block">
            <Label hint={t("optional")}>{t("nationalCode")}</Label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              maxLength={12}
              aria-invalid={codeBad}
              className={cn(inputCls, codeBad && "border-danger")}
            />
            {codeBad ? <span className="mt-1 block text-xs text-danger">{t("badNationalCode")}</span> : null}
          </label>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label>
            <Label hint={t("optional")}>{t("eta")}</Label>
            <input name="eta" type="time" dir="ltr" className={inputCls} />
          </label>
          <label>
            <Label hint={t("optional")}>{t("notes")}</Label>
            <input name="notes" maxLength={500} placeholder={t("notesHint")} className={inputCls} />
          </label>
        </div>
        {/* Bots fill every field; people never see this one. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      </section>

      <aside className="space-y-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5 md:sticky md:top-4">
        <div>
          <p className="font-bold">{type.name}</p>
          <p className="text-sm text-fg-muted">
            {offer.name ?? t("roomOnly")} |{" "}
            {tMeal.has(offer.mealPlan as "RO") ? tMeal(offer.mealPlan as "RO") : offer.mealPlan}
          </p>
        </div>
        <dl className="space-y-1.5 text-sm">
          <Line k={t("dates")} v={`${day(arrival)} → ${day(departure)}`} />
          <Line k={t("nights")} v={t("nightsN", { n: nights })} />
          <Line k={t("guests")} v={t("guestsN", { n: adults + kids })} />
        </dl>
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold">{t("total")}</span>
          <span className="text-xl font-bold tabular-nums">{money(offer.totalCents)}</span>
        </div>
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-xs",
            offer.refundable ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
          )}
        >
          {offer.refundable ? t("policyFree", { h: offer.cancelHours }) : t("policyNonRefundable")}
        </p>
        {error ? <FormError error={tErr.has(error) ? tErr(error) : tErr("internal")} /> : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending || codeBad}>
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t("confirm")}
        </Button>
        <p className="text-center text-xs text-fg-subtle">{t("payAtHotel")}</p>
      </aside>
    </form>
  );
}

function Line({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{k}</dt>
      <dd className={cn("text-end", strong && "font-bold")}>{v}</dd>
    </div>
  );
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
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`${label} −`}
          className="grid h-full w-10 place-items-center text-fg-muted hover:text-fg disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`${label} +`}
          className="grid h-full w-10 place-items-center text-fg-muted hover:text-fg disabled:opacity-40"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
