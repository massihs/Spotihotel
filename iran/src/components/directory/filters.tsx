"use client";

import { CalendarCheck, CalendarDays, Clock, LocateFixed, MapPin, Search, Users, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { NEAR_RADII, type Cuisine } from "@/lib/directory";
import { CUISINE_ICONS } from "./cuisine-icons";

export type DirectoryParams = {
  q?: string;
  city?: string;
  theme?: string;
  lat?: string;
  lng?: string;
  r?: string;
  open?: string;
  book?: string;
  /** The table asked for: party, day (YYYY-MM-DD) and time (HH:MM). */
  p?: string;
  d?: string;
  t?: string;
};

export type BookingChoices = {
  party: number;
  day: string;
  time: string;
  maxParty: number;
  days: { key: string; label: string }[];
  times: string[];
};

export function directoryHref(p: DirectoryParams) {
  const qs = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]);
  const s = qs.toString();
  return s ? `/restaurants?${s}` : "/restaurants";
}

/** Search, city, "near me" and the toggles; every change is a URL so results stay shareable. */
export function DirectoryFilters({
  current,
  cities,
  booking,
}: {
  current: DirectoryParams;
  cities: { key: string; label: string; count: number }[];
  booking: BookingChoices;
}) {
  const t = useTranslations("directory");
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const near = Boolean(current.lat && current.lng);

  const go = (patch: Partial<DirectoryParams>) =>
    start(() => router.push(directoryHref({ ...current, ...patch }), { scroll: false }));

  const locate = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError(t("locationUnsupported"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // ~100 m precision is plenty and keeps the URL from pinpointing the guest.
        go({
          lat: pos.coords.latitude.toFixed(3),
          lng: pos.coords.longitude.toFixed(3),
          r: current.r ?? "10",
          city: undefined,
        });
      },
      () => {
        setLocating(false);
        setGeoError(t("locationDenied"));
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-70")}>
      <form
        role="search"
        className="flex gap-2 rounded-3xl bg-surface p-1.5 shadow-[var(--shadow-float)] ring-1 ring-border max-sm:flex-wrap sm:p-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: String(new FormData(e.currentTarget).get("q") ?? "").trim() || undefined });
        }}
      >
        <label className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-2xl px-3 sm:basis-auto">
          <Search className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
          <input
            name="q"
            type="search"
            defaultValue={current.q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-subtle"
          />
        </label>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative flex h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface-2 ps-3 pe-2 sm:w-48 sm:flex-none">
            <MapPin className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
            <select
              aria-label={t("city")}
              value={near ? "" : (current.city ?? "")}
              onChange={(e) =>
                go({ city: e.target.value || undefined, lat: undefined, lng: undefined, r: undefined })
              }
              className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-semibold outline-none"
            >
              <option value="">{near ? t("aroundYou") : t("allCities")}</option>
              {cities.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.count ? `${c.label} (${c.count})` : c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            aria-pressed={near}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-bold transition-colors",
              near ? "bg-accent text-accent-fg" : "bg-fg text-bg hover:opacity-90",
            )}
          >
            <LocateFixed className={cn("size-4", locating && "animate-pulse")} aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">{locating ? t("locating") : t("nearMe")}</span>
          </button>
        </div>
      </form>
      {geoError ? (
        <p role="alert" className="px-2 text-sm font-medium text-danger">
          {geoError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-1">
        <div
          role="group"
          aria-label={t("bar.label")}
          className="flex w-full items-center gap-1 rounded-2xl bg-surface p-1 ring-1 ring-border sm:w-auto"
        >
          <PillSelect
            icon={<Users className="size-4" aria-hidden="true" />}
            label={t("bar.party")}
            value={String(booking.party)}
            onChange={(p) => go({ p, d: booking.day, t: booking.time })}
            options={Array.from({ length: booking.maxParty }, (_, i) => ({
              value: String(i + 1),
              label: t("bar.people", { count: i + 1 }),
            }))}
          />
          <PillSelect
            icon={<CalendarDays className="size-4" aria-hidden="true" />}
            label={t("bar.day")}
            value={booking.day}
            onChange={(d) => go({ p: String(booking.party), d, t: booking.time })}
            options={booking.days.map((d) => ({ value: d.key, label: d.label }))}
            wide
          />
          <PillSelect
            icon={<Clock className="size-4" aria-hidden="true" />}
            label={t("bar.time")}
            value={booking.time}
            onChange={(time) => go({ p: String(booking.party), d: booking.day, t: time })}
            options={booking.times.map((v) => ({ value: v, label: v }))}
          />
        </div>
        {near ? (
          <span className="flex items-center gap-1 rounded-full bg-surface p-1 ring-1 ring-border">
            <span className="px-2 text-xs font-semibold whitespace-nowrap text-fg-muted">
              {t("radius")} ({t("kmUnit")})
            </span>
            {NEAR_RADII.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => go({ r: String(r) })}
                aria-pressed={current.r === String(r)}
                className={cn(
                  "h-7 min-w-8 rounded-full px-2.5 text-xs font-bold tabular-nums",
                  current.r === String(r) ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                )}
              >
                {format.number(r)}
                <span className="sr-only"> {t("kmUnit")}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => go({ lat: undefined, lng: undefined, r: undefined })}
              aria-label={t("clear")}
              className="grid size-7 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <Toggle
          on={current.open === "1"}
          onClick={() => go({ open: current.open === "1" ? undefined : "1" })}
        >
          <Clock className="size-3.5" aria-hidden="true" />
          {t("openNow")}
        </Toggle>
        <Toggle
          on={current.book === "1"}
          onClick={() => go({ book: current.book === "1" ? undefined : "1" })}
        >
          <CalendarCheck className="size-3.5" aria-hidden="true" />
          {t("bookable")}
        </Toggle>
      </div>
    </div>
  );
}

/** A compact select of the booking bar: icon, value, native picker (fast on phones). */
function PillSelect({
  icon,
  label,
  value,
  onChange,
  options,
  wide,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  wide?: boolean;
}) {
  return (
    <label
      className={cn(
        "relative flex h-9 min-w-0 items-center gap-1.5 rounded-xl px-2.5 text-fg-muted hover:bg-surface-2",
        wide ? "flex-[1.4]" : "flex-1",
      )}
    >
      {icon}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent text-sm font-bold text-fg tabular-nums outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Theme chips: one row that scrolls on phones. */
export function ThemeChips({
  current,
  themes,
}: {
  current: DirectoryParams;
  themes: { key: Cuisine; label: string; count: number }[];
}) {
  const t = useTranslations("directory");
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (theme?: string) =>
    start(() => router.push(directoryHref({ ...current, theme }), { scroll: false }));
  return (
    <div
      role="group"
      aria-label={t("themes")}
      className={cn(
        "-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0",
        pending && "opacity-70",
      )}
    >
      <Chip on={!current.theme} onClick={() => pick(undefined)}>
        {t("allThemes")}
      </Chip>
      {themes.map(({ key, label, count }) => {
        const Icon = CUISINE_ICONS[key];
        return (
          <Chip
            key={key}
            on={current.theme === key}
            onClick={() => pick(current.theme === key ? undefined : key)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
            {count ? <span className="text-xs tabular-nums opacity-60">{count}</span> : null}
          </Chip>
        );
      })}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-colors",
        on ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition-colors",
        on
          ? "bg-accent-soft text-accent-text ring-1 ring-accent/40"
          : "bg-surface text-fg-muted ring-1 ring-border hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
