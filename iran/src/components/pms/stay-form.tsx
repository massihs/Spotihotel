"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { parseMoneyInput } from "@/lib/money";
import {
  createStayAction,
  quoteStayAction,
  searchGuestsAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, inputCls, useDay } from "./kit";

type Type = { id: string; code: string; name: string; maxOccupancy: number };
type Plan = { id: string; code: string; name: string; isDefault: boolean };
type Account = { id: string; name: string };
type GuestHit = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  vip: boolean;
  blacklisted: boolean;
};

const SOURCES = [
  "direct",
  "phone",
  "walk_in",
  "website",
  "email",
  "agency",
  "booking",
  "expedia",
  "airbnb",
  "other",
];
const GUARANTEES = ["none", "card", "deposit", "company"];

const add = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function StayForm({
  restaurantId,
  currency,
  today,
  types,
  plans,
  accounts,
  canNegotiate,
  initial,
}: {
  restaurantId: string;
  currency: string;
  today: string;
  types: Type[];
  plans: Plan[];
  accounts: Account[];
  canNegotiate: boolean;
  initial?: { roomTypeId?: string; arrival?: string };
}) {
  const t = useTranslations("pms.book");
  const tSrc = useTranslations("pms.source");
  const tG = useTranslations("pms.guarantee");
  const tErr = useTranslations("errorCodes");
  const locale = useLocale();
  const router = useRouter();
  const money = useMoney(currency);
  const day = useDay();

  const [arrival, setArrival] = useState(initial?.arrival ?? today);
  const [departure, setDeparture] = useState(add(initial?.arrival ?? today, 1));
  const [roomTypeId, setRoomTypeId] = useState(initial?.roomTypeId ?? types[0]?.id ?? "");
  const [ratePlanId, setRatePlanId] = useState(plans.find((p) => p.isDefault)?.id ?? "");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [quote, setQuote] = useState<{
    totalCents: number;
    nights: { day: string; rateCents: number }[];
    issues: string[];
    minStay: number;
  } | null>(null);
  const [quoting, startQuote] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GuestHit[]>([]);
  const [guest, setGuest] = useState<GuestHit | null>(null);

  useEffect(() => {
    if (!roomTypeId || departure <= arrival) return;
    startQuote(async () => {
      const res = await quoteStayAction(restaurantId, {
        roomTypeId,
        ratePlanId: ratePlanId || null,
        arrival,
        departure,
        adults,
      });
      setQuote(res?.ok && res.data ? res.data : null);
    });
  }, [restaurantId, roomTypeId, ratePlanId, arrival, departure, adults]);

  useEffect(() => {
    if (guest || q.trim().length < 2) return;
    const id = setTimeout(async () => {
      const res = await searchGuestsAction(restaurantId, q);
      setHits(res?.ok && res.data ? res.data : []);
    }, 250);
    return () => clearTimeout(id);
  }, [q, guest, restaurantId]);

  const shownHits = guest || q.trim().length < 2 ? [] : hits;
  const type = useMemo(() => types.find((x) => x.id === roomTypeId), [types, roomTypeId]);

  const submit = (fd: FormData) => {
    setError(null);
    const fixed = String(fd.get("fixedRate") ?? "").trim();
    const fixedRateCents = fixed ? parseMoneyInput(fixed, currency) : null;
    startSave(async () => {
      const res = await createStayAction(restaurantId, {
        guestId: guest?.id ?? null,
        guest: guest
          ? undefined
          : {
              firstName: String(fd.get("firstName") ?? ""),
              lastName: String(fd.get("lastName") ?? ""),
              phone: String(fd.get("phone") ?? ""),
              email: String(fd.get("email") ?? ""),
            },
        roomTypeId,
        ratePlanId: ratePlanId || null,
        arrival,
        departure,
        adults,
        children,
        status: fd.get("tentative") ? "tentative" : "confirmed",
        source: String(fd.get("source")) as "direct",
        channelRef: String(fd.get("channelRef") ?? ""),
        eta: String(fd.get("eta") ?? ""),
        guarantee: String(fd.get("guarantee")) as "none",
        accountId: String(fd.get("accountId") ?? "") || null,
        notes: String(fd.get("notes") ?? ""),
        fixedRateCents,
        override: !!fd.get("override"),
      });
      if (res?.ok && res.data) router.push(`/dashboard/${restaurantId}/stays/${res.data}`);
      else if (res && !res.ok) {
        const key = Object.values(res.fieldErrors ?? {})[0] ?? res.error;
        setError(tErr.has(key) ? tErr(key) : tErr("internal"));
      }
    });
  };

  if (!types.length) return <p className="rounded-2xl bg-warning-soft p-4 text-sm">{t("noTypes")}</p>;

  return (
    <form action={submit} className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <fieldset className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{t("stay")}</legend>
          <label>
            <Label>{t("arrival")}</Label>
            <input
              type="date"
              className={inputCls}
              min={today}
              value={arrival}
              onChange={(e) => {
                setArrival(e.target.value);
                if (departure <= e.target.value) setDeparture(add(e.target.value, 1));
              }}
              required
            />
          </label>
          <label>
            <Label>{t("departure")}</Label>
            <input
              type="date"
              className={inputCls}
              min={add(arrival, 1)}
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              required
            />
          </label>
          <label>
            <Label>{t("roomType")}</Label>
            <select className={inputCls} value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)}>
              {types.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} — {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label>{t("ratePlan")}</Label>
            <select className={inputCls} value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)}>
              {!plans.some((p) => p.isDefault) ? <option value="">{t("baseRate")}</option> : null}
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <Label hint={type ? t("max", { n: type.maxOccupancy }) : undefined}>{t("adults")}</Label>
            <input
              type="number"
              min={1}
              max={20}
              className={inputCls}
              value={adults}
              onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label>
            <Label>{t("children")}</Label>
            <input
              type="number"
              min={0}
              max={20}
              className={inputCls}
              value={children}
              onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-border bg-surface p-5">
          <legend className="px-1 text-sm font-bold">{t("guest")}</legend>
          {guest ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div>
                <p className="font-semibold">
                  {guest.lastName} {guest.firstName} {guest.vip ? "★" : ""}
                </p>
                <p className="text-sm text-fg-muted">{guest.phone}</p>
                {guest.blacklisted ? (
                  <p className="text-sm font-semibold text-danger">{t("blacklisted")}</p>
                ) : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setGuest(null)}>
                {t("change")}
              </Button>
            </div>
          ) : (
            <>
              <label className="block">
                <Label>{t("findGuest")}</Label>
                <input
                  className={inputCls}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("findGuestHint")}
                />
              </label>
              {shownHits.length ? (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {shownHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-surface-2"
                        onClick={() => setGuest(h)}
                      >
                        <span className="font-semibold">
                          {h.lastName} {h.firstName} {h.vip ? "★" : ""}
                        </span>
                        <span className="text-fg-muted">{h.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-sm text-fg-muted">{t("orNewGuest")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <Label>{t("lastName")}</Label>
                  <input name="lastName" className={inputCls} required={!guest} maxLength={80} />
                </label>
                <label>
                  <Label>{t("firstName")}</Label>
                  <input name="firstName" className={inputCls} maxLength={80} />
                </label>
                <label>
                  <Label>{t("phone")}</Label>
                  <input name="phone" type="tel" className={inputCls} maxLength={24} dir="ltr" />
                </label>
                <label>
                  <Label>{t("email")}</Label>
                  <input name="email" type="email" className={inputCls} maxLength={320} dir="ltr" />
                </label>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2">
          <legend className="px-1 text-sm font-bold">{t("details")}</legend>
          <label>
            <Label>{t("source")}</Label>
            <select name="source" className={inputCls} defaultValue="direct">
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
            <textarea name="notes" className={`${inputCls} h-24 py-2`} maxLength={2000} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="tentative" className="size-4" /> {t("tentative")}
          </label>
        </fieldset>
      </div>

      <aside className="h-fit space-y-4 rounded-2xl border border-border bg-surface p-5 lg:sticky lg:top-20">
        <h2 className="font-bold">{t("summary")}</h2>
        <p className="text-sm text-fg-muted">
          {day(arrival, { weekday: "short", day: "numeric", month: "short" })} →{" "}
          {day(departure, { weekday: "short", day: "numeric", month: "short" })}
        </p>
        {quote ? (
          <>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
              {quote.nights.map((n) => (
                <li key={n.day} className="flex justify-between">
                  <span className="text-fg-muted">
                    {day(n.day, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <span className="tabular-nums">{money(n.rateCents)}</span>
                </li>
              ))}
            </ul>
            <p className="flex justify-between border-t border-border pt-3 text-lg font-bold">
              <span>{t("total")}</span>
              <span className="tabular-nums">{money(quote.totalCents)}</span>
            </p>
            {quote.issues.map((i) => (
              <p key={i} className="rounded-xl bg-warning-soft px-3 py-2 text-sm">
                {t(`issue.${i}`, { n: quote.minStay })}
              </p>
            ))}
            {quote.issues.length && !quote.issues.includes("too_many_guests") ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="override" className="size-4" /> {t("override")}
              </label>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-fg-muted">{quoting ? "…" : t("noQuote")}</p>
        )}
        <FormError error={error} />
        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {t("submit")}
        </Button>
        <p className="text-xs text-fg-muted" lang={locale}>
          {t("submitHint")}
        </p>
      </aside>
    </form>
  );
}
