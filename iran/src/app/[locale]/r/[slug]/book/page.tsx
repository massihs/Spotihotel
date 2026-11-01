import { ArrowRight, MapPin, Star } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CUISINE_ICONS } from "@/components/directory/cuisine-icons";
import { BookFlow, type BookDay } from "@/components/reservations/book-flow";
import { Link } from "@/i18n/navigation";
import { localDay } from "@/lib/period";
import { db } from "@/server/db/client";
import { getDirectory } from "@/server/modules/directory/cache";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { bookingAreas, placeBySlug } from "@/server/modules/reservations/service";
import { PlaceInitials } from "@/components/ui/place-initials";

type Props = PageProps<"/[locale]/r/[slug]/book">;

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function BookPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-56 animate-pulse bg-surface-2" />}>
      <Book params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

async function Book({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) notFound();
  const [t, td, locale, format, listing, areas] = await Promise.all([
    getTranslations("booking"),
    getTranslations("directory"),
    getLocale(),
    getFormatter(),
    getDirectory().then((all) => all.find((e) => e.id === place.id) ?? null),
    bookingAreas(db, place.id),
  ]);
  const today = localDay(new Date(), place.timezone);
  const fmt = (o: Intl.DateTimeFormatOptions, d: Date) =>
    new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" }).format(d);
  const days: BookDay[] = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000);
    return {
      key: d.toISOString().slice(0, 10),
      weekday: i === 0 ? t("todayShort") : fmt({ weekday: "short" }, d),
      label: fmt({ day: "numeric" }, d),
      month: fmt({ month: "short" }, d),
      long: fmt({ weekday: "long", day: "numeric", month: "long" }, d),
    };
  });
  // What the directory chip asked for: party, day and time.
  const p = Math.trunc(Number(one(sp.p)));
  const d = one(sp.d);
  const time = one(sp.t);
  const initial = {
    party: p >= 1 && p <= place.maxParty ? p : Math.min(2, place.maxParty),
    day: days.some((x) => x.key === d) ? d! : today,
    time: time && /^\d{2}:\d{2}$/.test(time) ? time : null,
  };
  const logo = listing?.logo ?? logoUrl(place.logoKey);

  return (
    <div data-brand={place.brandColor}>
      <header className="relative h-56 overflow-hidden bg-gradient-to-br from-accent to-accent-hover text-white sm:h-64">
        {listing?.cover ? (
          <img
            src={listing.cover.lg}
            srcSet={`${listing.cover.md} 640w, ${listing.cover.lg} 1280w`}
            sizes="100vw"
            alt=""
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20"
        />
        <div className="relative mx-auto flex h-full max-w-5xl flex-col justify-between px-4 pt-5 pb-12">
          <Link
            href={listing ? `/r/${place.slug}` : "/restaurants"}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-black/50"
          >
            <ArrowRight className="size-3.5 ltr:rotate-180" aria-hidden="true" />
            {listing ? t("back") : td("profile.back")}
          </Link>
          <div className="flex items-end gap-3.5">
            <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-xl ring-4 ring-white/70">
              {logo ? (
                <img src={logo} alt="" className="size-full object-contain p-1" />
              ) : (
                <PlaceInitials name={place.name} className="text-2xl" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium opacity-85">{t("bookTitle")}</p>
              <h1 className="truncate text-2xl leading-tight font-bold sm:text-3xl">{place.name}</h1>
              {listing ? (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs opacity-90 sm:text-sm">
                  {listing.rating != null ? (
                    <span className="inline-flex items-center gap-1 font-bold tabular-nums">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {format.number(listing.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                  ) : null}
                  {listing.cuisines.slice(0, 2).map((c) => {
                    const Icon = CUISINE_ICONS[c];
                    return (
                      <span key={c} className="inline-flex items-center gap-1">
                        <Icon className="size-3.5" aria-hidden="true" />
                        {td(`cuisine.${c}`)}
                      </span>
                    );
                  })}
                  {listing.cityText ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      {listing.cityText}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      <BookFlow
        slug={place.slug}
        place={{
          name: place.name,
          logo,
          address: listing?.address ?? null,
          autoConfirm: place.autoConfirm,
        }}
        days={days}
        maxParty={place.maxParty}
        areas={areas}
        initial={initial}
      />
    </div>
  );
}
