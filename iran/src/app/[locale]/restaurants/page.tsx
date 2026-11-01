import { Store } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import {
  DirectoryFilters,
  ThemeChips,
  directoryHref,
  type BookingChoices,
  type DirectoryParams,
} from "@/components/directory/filters";
import { RestaurantCard, cityLabel } from "@/components/directory/restaurant-card";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClasses } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { CUISINES, IRAN_CITIES, cityByKey, isCuisine, NEAR_RADII } from "@/lib/directory";
import { localDay } from "@/lib/period";
import { db } from "@/server/db/client";
import { getDirectory } from "@/server/modules/directory/cache";
import { directoryFacets, searchDirectory } from "@/server/modules/directory/service";
import { defaultWishTime, slotsNear } from "@/server/modules/reservations/service";

type Props = PageProps<"/[locale]/restaurants">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "directory" });
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

export default async function RestaurantsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("directory");
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader active="restaurants" />
      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-accent-soft/70 to-bg">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -end-40 -top-40 size-[30rem] rounded-full bg-accent/15 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-5 pb-1 sm:px-6 sm:pt-14 sm:pb-6">
            <span className="hidden items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium text-fg-muted ring-1 ring-border sm:inline-flex">
              <span className="size-1.5 rounded-full bg-accent" />
              {t("eyebrow")}
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-balance sm:mt-4 sm:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-3 hidden max-w-2xl text-base leading-7 text-pretty text-fg-muted sm:block sm:text-lg">
              {t("subtitle")}
            </p>
          </div>
        </section>
        <Suspense fallback={<ResultsSkeleton />}>
          <Results searchParams={searchParams} />
        </Suspense>
        <OwnerBand />
      </main>
      <SiteFooter />
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/** Times the booking bar offers, every half hour. */
const TIMES = Array.from({ length: 26 }, (_, i) => {
  const m = 11 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`;
});
/** Cards that get live time chips (each one is cheap, but the page stays bounded). */
const SLOT_CARDS = 36;

/** Party, day and time of the booking bar: what the URL asks for, else 2 people tonight. */
async function bookingChoices(
  sp: Record<string, string | string[] | undefined>,
  timezone: string,
  locale: AppLocale,
): Promise<BookingChoices> {
  const t = await getTranslations("directory");
  const today = localDay(new Date(), timezone);
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const label =
      i === 0
        ? t("bar.today")
        : i === 1
          ? t("bar.tomorrow")
          : new Intl.DateTimeFormat(locale, {
              weekday: "short",
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            }).format(d);
    return { key, label };
  });
  const maxParty = 20;
  const p = Math.trunc(Number(one(sp.p)));
  const d = one(sp.d);
  const time = one(sp.t);
  return {
    party: p >= 1 && p <= maxParty ? p : 2,
    day: days.some((x) => x.key === d) ? d! : today,
    time: time && TIMES.includes(time) ? time : defaultWishTime(timezone),
    maxParty,
    days,
    times: TIMES,
  };
}

async function Results({ searchParams }: Pick<Props, "searchParams">) {
  // Open / closed is computed per visit.
  await connection();
  const sp = await searchParams;
  const [t, locale, all] = await Promise.all([
    getTranslations("directory"),
    getLocale() as Promise<AppLocale>,
    getDirectory(),
  ]);
  const lat = Number(one(sp.lat));
  const lng = Number(one(sp.lng));
  const near =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    one(sp.lat) &&
    one(sp.lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  const radius = NEAR_RADII.find((r) => String(r) === one(sp.r)) ?? 10;
  const city = cityByKey(one(sp.city));
  const theme = isCuisine(one(sp.theme)) ? one(sp.theme) : undefined;
  const current: DirectoryParams = {
    q: one(sp.q)?.slice(0, 80),
    city: near ? undefined : city?.key,
    theme,
    lat: near ? lat.toFixed(3) : undefined,
    lng: near ? lng.toFixed(3) : undefined,
    r: near ? String(radius) : undefined,
    open: one(sp.open) === "1" ? "1" : undefined,
    book: one(sp.book) === "1" ? "1" : undefined,
  };
  const booking = await bookingChoices(sp, all[0]?.timezone ?? "Asia/Tehran", locale);
  // Kept in the URL only once the guest touched the bar, so "clear" stays meaningful.
  if (one(sp.p) || one(sp.d) || one(sp.t))
    Object.assign(current, { p: String(booking.party), d: booking.day, t: booking.time });
  const results = searchDirectory(all, {
    q: current.q,
    city: current.city,
    cuisine: theme,
    near,
    radiusKm: near ? radius : null,
    openNow: current.open === "1",
    reservable: current.book === "1",
  });
  // Facets count what the place filter (city / near me) leaves, so theme chips match the area.
  const { cities: perCity } = directoryFacets(all);
  const inArea = searchDirectory(all, { city: current.city, near, radiusKm: near ? radius : null });
  const { cuisines: perTheme } = directoryFacets(inArea);
  const cityOptions = [...IRAN_CITIES]
    .map((c) => ({ key: c.key, label: cityLabel(c, locale), count: perCity.get(c.key) ?? 0 }))
    .sort((a, b) => b.count - a.count);
  const themes = CUISINES.map((k) => ({
    key: k,
    label: t(`cuisine.${k}`),
    count: perTheme.get(k) ?? 0,
  })).sort((a, b) => b.count - a.count);
  const popular = cityOptions.filter((c) => c.count > 0).slice(0, 8);
  const slots = await slotsNear(
    db,
    results
      .filter((r) => r.reservable)
      .slice(0, SLOT_CARDS)
      .map((r) => r.id),
    { day: booking.day, partySize: booking.party, time: booking.time },
  );
  const bookQuery = `p=${booking.party}&d=${booking.day}`;
  const filtered = Object.entries(current).some(([, v]) => v);

  return (
    <>
      <section className="border-b border-border/60 bg-bg/90 backdrop-blur-xl lg:sticky lg:top-16 lg:z-30">
        <div className="mx-auto max-w-6xl space-y-2 px-4 py-3 sm:space-y-3 sm:px-6">
          <DirectoryFilters current={current} cities={cityOptions} booking={booking} />
          <ThemeChips current={current} themes={themes} />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 sm:mb-5">
          <h2 className="text-xl font-bold">
            {t("results", { count: results.length })}{" "}
            {results.length ? (
              <span className="font-medium text-fg-muted">
                {near ? t("aroundYou") : city ? t("inCity", { city: cityLabel(city, locale) }) : null}
              </span>
            ) : null}
          </h2>
          {filtered ? (
            <Link href="/restaurants" className="text-sm font-semibold text-accent-text hover:underline">
              {t("clear")}
            </Link>
          ) : null}
        </div>

        {results.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <li key={r.id} className="flex">
                <div className="flex w-full flex-col [&>article]:flex-1">
                  <RestaurantCard
                    r={r}
                    locale={locale}
                    slots={slots.get(r.id)}
                    booking={{ query: bookQuery, time: booking.time }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-3xl border border-dashed border-border-strong px-6 py-14 text-center">
            <Store className="mx-auto size-10 text-fg-subtle" aria-hidden="true" />
            <p className="mt-4 text-lg font-bold">{t("emptyTitle")}</p>
            <p className="mt-1 text-fg-muted">{t("emptyBody")}</p>
          </div>
        )}

        {popular.length > 1 ? (
          <nav aria-label={t("popularCities")} className="mt-12">
            <h2 className="text-sm font-bold text-fg-muted">{t("popularCities")}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {popular.map((c) => (
                <li key={c.key}>
                  <Link
                    href={directoryHref({ city: c.key })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-border hover:ring-border-strong"
                  >
                    {c.label}
                    <span className="text-xs text-fg-subtle tabular-nums">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </section>
    </>
  );
}

async function OwnerBand() {
  const t = await getTranslations("directory");
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <div className="flex flex-col items-start gap-4 rounded-3xl bg-ink p-6 text-ink-fg sm:flex-row sm:items-center sm:p-8">
        <div className="flex-1">
          <h2 className="text-xl font-bold">{t("ownerTitle")}</h2>
          <p className="mt-1.5 leading-7 opacity-80">{t("ownerBody")}</p>
        </div>
        <Link href="/signup" className={buttonClasses("accent", "lg", "px-6")}>
          {t("ownerCta")}
        </Link>
      </div>
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-80 animate-pulse rounded-3xl bg-surface-2" />
      ))}
    </div>
  );
}
