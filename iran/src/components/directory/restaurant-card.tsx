import { CalendarCheck, MapPin, Star, UtensilsCrossed } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/config";
import type { DirectoryResult } from "@/server/modules/directory/service";
import { CUISINE_ICONS } from "./cuisine-icons";
import { PlaceInitials } from "@/components/ui/place-initials";

export function cityLabel(city: { fa: string; en: string }, locale: string) {
  return locale === "fa" || locale === "ar" ? city.fa : city.en;
}

/** One restaurant of the guide: photo, name, styles, rating, open state, distance, actions. */
export async function RestaurantCard({
  r,
  locale,
  slots,
  booking,
}: {
  r: DirectoryResult;
  locale: AppLocale;
  /** Free times near the one asked for (reservable places only). */
  slots?: { time: string }[];
  /** The guest's party and day, carried to the booking page (`p=2&d=2026-10-29`). */
  booking?: { query: string; time: string };
}) {
  const [t, format] = await Promise.all([getTranslations("directory"), getFormatter()]);
  const where = r.city ? cityLabel(r.city, locale) : r.cityText;
  const bookHref = `/r/${r.slug}/book${booking ? `?${booking.query}` : ""}`;
  return (
    <article
      data-brand={r.brandColor}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-accent to-accent-hover">
        {r.cover ? (
          <img
            src={r.cover.md}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <UtensilsCrossed
            aria-hidden="true"
            className="absolute inset-0 m-auto size-20 -rotate-12 text-white/25"
          />
        )}
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent" />
        <OpenPill r={r} t={t} />
        {r.distanceKm != null ? (
          <span className="absolute end-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-bold text-white tabular-nums backdrop-blur">
            {distanceLabel(r.distanceKm, t, format)}
          </span>
        ) : null}
        <span className="absolute start-3 bottom-3 grid size-12 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg ring-2 ring-white">
          {r.logo ? (
            <img src={r.logo} alt="" className="size-full object-contain p-0.5" />
          ) : (
            <PlaceInitials name={r.name} className="text-lg" />
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 text-lg leading-snug font-bold">
            <Link href={`/r/${r.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {r.name}
            </Link>
          </h3>
          {r.rating != null ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-sm font-bold tabular-nums">
              <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
              {format.number(r.rating, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
              <span className="sr-only">{t("reviews", { count: r.reviewCount })}</span>
            </span>
          ) : null}
        </div>
        {r.tagline ? <p className="line-clamp-2 text-sm leading-6 text-fg-muted">{r.tagline}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
          {where ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {where}
            </span>
          ) : null}
          {r.priceLevel ? <PriceLevel level={r.priceLevel} label={t(`price.${r.priceLevel}`)} /> : null}
          {r.reviewCount ? (
            <span className="tabular-nums">{t("reviews", { count: r.reviewCount })}</span>
          ) : null}
        </div>
        {r.cuisines.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {r.cuisines.slice(0, 3).map((c) => {
              const Icon = CUISINE_ICONS[c];
              return (
                <li
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold"
                >
                  <Icon className="size-3.5 text-accent-text" aria-hidden="true" />
                  {t(`cuisine.${c}`)}
                </li>
              );
            })}
          </ul>
        ) : null}
        {r.reservable && slots && booking ? (
          slots.length ? (
            <ul className="relative z-10 flex flex-wrap gap-1.5 pt-1" aria-label={t("bar.label")}>
              {slots.map((s) => (
                <li key={s.time}>
                  <Link
                    href={`${bookHref}&t=${s.time}`}
                    aria-label={t("slots.at", { time: s.time })}
                    className="inline-flex h-9 min-w-[3.75rem] items-center justify-center rounded-xl bg-accent px-2.5 text-sm font-bold text-accent-fg tabular-nums shadow-sm transition-colors hover:bg-accent-hover"
                    dir="ltr"
                  >
                    {s.time}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="relative z-10 flex flex-wrap items-center gap-x-2 pt-1 text-sm text-fg-muted">
              {t("slots.none", { time: booking.time })}
              <Link href={bookHref} className="font-semibold text-accent-text hover:underline">
                {t("slots.more")}
              </Link>
            </p>
          )
        ) : null}
        <div className="relative z-10 mt-auto flex gap-2 pt-2">
          <Link
            href={`/r/${r.slug}`}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full bg-surface-2 px-4 text-sm font-bold hover:bg-surface-3"
          >
            {t("view")}
          </Link>
          {r.reservable ? (
            <Link
              href={bookHref}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg hover:bg-accent-hover"
            >
              <CalendarCheck className="size-4" aria-hidden="true" />
              {t("book")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"directory">>>;

function OpenPill({ r, t }: { r: DirectoryResult; t: T }) {
  if (r.open.status === "unknown") return null;
  const open = r.open.status === "open";
  return (
    <span className="absolute start-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-neutral-900 shadow-sm">
      <span className={open ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-danger"} />
      {open ? t("open") : t("closed")}
      <span className="font-medium text-neutral-500 tabular-nums">
        {r.open.status === "open"
          ? t("openUntil", { time: r.open.until })
          : r.open.from
            ? t("opensAt", { time: r.open.from })
            : null}
      </span>
    </span>
  );
}

export function distanceLabel(km: number, t: T, format: Awaited<ReturnType<typeof getFormatter>>) {
  return km < 1
    ? t("meters", { n: format.number(Math.max(50, Math.round((km * 1000) / 50) * 50)) })
    : t("km", { n: format.number(km, { maximumFractionDigits: km < 10 ? 1 : 0 }) });
}

export function PriceLevel({ level, label }: { level: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <span aria-hidden="true" className="tracking-tighter">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= level ? "font-bold text-fg" : "text-fg-subtle/50"}>
            ●
          </span>
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}
