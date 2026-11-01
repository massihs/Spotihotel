import {
  ArrowRight,
  CalendarCheck,
  Clock,
  MapPin,
  Navigation,
  Phone,
  ShoppingBag,
  Star,
  Ticket,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CUISINE_ICONS } from "@/components/directory/cuisine-icons";
import { PriceLevel, cityLabel } from "@/components/directory/restaurant-card";
import { SiteHeader } from "@/components/site/site-header";
import type { AppLocale } from "@/i18n/config";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { getDirectory } from "@/server/modules/directory/cache";
import { searchDirectory, type DirectoryResult } from "@/server/modules/directory/service";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { getOnlineStore } from "@/server/modules/online/service";
import { defaultWishTime, slotsNear } from "@/server/modules/reservations/service";
import { localDay } from "@/lib/period";
import { db } from "@/server/db/client";
import { PlaceInitials } from "@/components/ui/place-initials";

type Props = PageProps<"/[locale]/r/[slug]">;

async function placeOf(slug: string): Promise<DirectoryResult | null> {
  const all = await getDirectory();
  const hit = all.find((e) => e.slug === slug);
  return hit ? (searchDirectory([hit], {})[0] ?? null) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const place = (await getDirectory()).find((e) => e.slug === slug);
  if (!place) return {};
  return {
    title: place.name,
    description: place.tagline ?? place.address ?? undefined,
    openGraph: place.cover ? { images: [place.cover.lg] } : undefined,
  };
}

export default function PlacePage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse bg-surface-2" />}>
      <Place params={params} />
    </Suspense>
  );
}

/** Week order of the opening-hours table, as people read it in each language. */
const WEEK = {
  fa: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
  ar: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
  en: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  fr: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
} as const;
const JS_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

async function Place({ params }: Pick<Props, "params">) {
  // Open / closed is computed per visit.
  await connection();
  const { slug } = await params;
  const place = await placeOf(slug);
  if (!place) notFound();
  const [t, td, locale, format, menu] = await Promise.all([
    getTranslations("directory"),
    getTranslations("settings.days"),
    getLocale() as Promise<AppLocale>,
    getFormatter(),
    getPublicMenu(place.id),
  ]);
  const [orderOnline, tonight] = await Promise.all([
    getOnlineStore(db, place.slug)
      .then(Boolean)
      .catch(() => false),
    place.reservable
      ? slotsNear(db, [place.id], {
          day: localDay(new Date(), place.timezone),
          partySize: 2,
          time: defaultWishTime(place.timezone),
        }).then((m) => m.get(place.id) ?? [])
      : Promise.resolve([]),
  ]);
  const where = place.city ? cityLabel(place.city, locale) : place.cityText;
  const pos = place.position;
  const mapsUrl = pos
    ? pos.approximate
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.address ?? where].filter(Boolean).join(" "))}`
      : `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`
    : null;
  const today = JS_DAYS[new Date(new Date().toLocaleString("en-US", { timeZone: place.timezone })).getDay()];
  const categories = menu.categories
    .map((c) => ({ ...c, items: c.productIds.map((id) => menu.products[id]).filter((p) => p != null) }))
    .filter((c) => c.items.length > 0);

  const bookQuery = `p=2&d=${localDay(new Date(), place.timezone)}`;
  // Phones book and order from the bar at the bottom: the card keeps tonight's times and the
  // place's details in one block, without repeating those buttons.
  const bar = place.reservable || orderOnline;
  const bookCard = (
    <div className="rounded-3xl bg-surface p-5 ring-1 ring-border">
      {orderOnline ? (
        <Link
          href={`/r/${place.slug}/order`}
          className={cn(
            "mb-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-fg text-base font-bold text-bg",
            bar && "max-lg:hidden",
          )}
        >
          <ShoppingBag className="size-5" aria-hidden="true" />
          {t("orderOnline")}
        </Link>
      ) : null}
      <h2 className="text-lg font-bold">{t("profile.bookTitle")}</h2>
      {place.reservable ? (
        <>
          <p className="mt-1 text-sm leading-6 text-fg-muted">{t("profile.bookBody")}</p>
          {/* Tonight for two, one tap away (OpenTable style); other choices on the booking page. */}
          <p className="mt-4 text-xs font-bold text-fg-subtle">
            {t("bar.today")} · {t("bar.people", { count: 2 })}
          </p>
          {tonight.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tonight.map((s) => (
                <li key={s.time}>
                  <Link
                    href={`/r/${place.slug}/book?${bookQuery}&t=${s.time}`}
                    aria-label={t("slots.at", { time: s.time })}
                    className="inline-flex h-10 min-w-16 items-center justify-center rounded-xl bg-accent px-3 text-sm font-bold text-accent-fg tabular-nums hover:bg-accent-hover"
                    dir="ltr"
                  >
                    {s.time}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-fg-muted">
              {t("slots.none", { time: defaultWishTime(place.timezone) })}
            </p>
          )}
          <Link
            href={`/r/${place.slug}/book?${bookQuery}`}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-accent-fg hover:bg-accent-hover max-lg:hidden"
          >
            <CalendarCheck className="size-5" aria-hidden="true" />
            {t("book")}
          </Link>
          <Link
            href={`/r/${place.slug}/queue`}
            className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-bold hover:bg-surface-3"
          >
            <Ticket className="size-4" aria-hidden="true" />
            {t("queue")}
          </Link>
        </>
      ) : (
        <p className="mt-1 text-sm leading-6 text-fg-muted">{t("profile.noBooking")}</p>
      )}
      {/* The place's details live in the same card. */}
      {place.address || mapsUrl || place.phone ? (
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {place.address ? (
            <p className="flex gap-2.5 text-sm leading-6">
              <MapPin className="mt-0.5 size-4 shrink-0 text-fg-muted" aria-hidden="true" />
              <span>{place.address}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-bold hover:bg-surface-3"
              >
                <Navigation className="size-4" aria-hidden="true" />
                {t("profile.directions")}
              </a>
            ) : null}
            {place.phone ? (
              <a
                href={`tel:${place.phone.replace(/[^+0-9]/g, "")}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-bold hover:bg-surface-3"
                dir="ltr"
              >
                <Phone className="size-4" aria-hidden="true" />
                {place.phone}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  const hoursCard = place.openingHours ? (
    <div className="rounded-3xl bg-surface p-5 ring-1 ring-border">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Clock className="size-5 text-fg-muted" aria-hidden="true" />
        {t("profile.hours")}
      </h2>
      <dl className="mt-3 divide-y divide-border text-sm">
        {(WEEK[locale] ?? WEEK.en).map((d) => {
          const ranges = place.openingHours?.[d] ?? [];
          return (
            <div
              key={d}
              className={cn("flex justify-between gap-4 py-2", d === today && "font-bold text-accent-text")}
            >
              <dt>
                {td(d)}
                {d === today ? <span className="sr-only"> ({t("profile.today")})</span> : null}
              </dt>
              <dd className="tabular-nums" dir="ltr">
                {ranges.length
                  ? ranges.map((r) => `${r.open}–${r.close}`).join(" · ")
                  : t("profile.closedDay")}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  ) : null;

  return (
    <div data-brand={place.brandColor}>
      <SiteHeader active="restaurants" />

      <header className="relative">
        <div className="relative h-64 overflow-hidden bg-gradient-to-br from-accent to-accent-hover sm:h-80">
          {place.cover ? (
            <img
              src={place.cover.lg}
              srcSet={`${place.cover.md} 640w, ${place.cover.lg} 1280w`}
              sizes="100vw"
              alt=""
              fetchPriority="high"
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10"
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-6xl px-4 pb-6 text-white sm:px-6">
            <Link
              href="/restaurants"
              className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-black/50"
            >
              <ArrowRight className="size-3.5 ltr:rotate-180" aria-hidden="true" />
              {t("profile.back")}
            </Link>
            <div className="flex items-end gap-4">
              <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-3xl bg-white shadow-xl ring-4 ring-white/80">
                {place.logo ? (
                  <img src={place.logo} alt="" className="size-full object-contain p-1" />
                ) : (
                  <PlaceInitials name={place.name} className="text-3xl" />
                )}
              </span>
              <div className="min-w-0">
                <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{place.name}</h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm opacity-90">
                  {place.rating != null ? (
                    <span className="inline-flex items-center gap-1 font-bold tabular-nums">
                      <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {format.number(place.rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                      <span className="font-normal opacity-80">
                        ({t("reviews", { count: place.reviewCount })})
                      </span>
                    </span>
                  ) : null}
                  {where ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-4" aria-hidden="true" />
                      {where}
                    </span>
                  ) : null}
                  <OpenLine place={place} t={t} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 pb-28 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-12">
        <div className="min-w-0 space-y-8">
          {place.tagline || place.cuisines.length ? (
            <section className="space-y-3">
              {place.tagline ? <p className="text-lg leading-8 text-pretty">{place.tagline}</p> : null}
              <ul className="flex flex-wrap gap-2">
                {place.cuisines.map((c) => {
                  const Icon = CUISINE_ICONS[c];
                  return (
                    <li key={c}>
                      <Link
                        href={`/restaurants?theme=${c}`}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold ring-1 ring-border hover:ring-border-strong"
                      >
                        <Icon className="size-4 text-accent-text" aria-hidden="true" />
                        {t(`cuisine.${c}`)}
                      </Link>
                    </li>
                  );
                })}
                {place.priceLevel ? (
                  <li className="inline-flex h-9 items-center rounded-full bg-surface px-3.5 text-sm ring-1 ring-border">
                    <PriceLevel level={place.priceLevel} label={t(`price.${place.priceLevel}`)} />
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="menu-title">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="menu-title" className="text-2xl font-bold">
                {t("profile.menu")}
              </h2>
              {categories.length ? (
                <span className="text-sm text-fg-muted">
                  {t("profile.items", { count: categories.reduce((n, c) => n + c.items.length, 0) })}
                </span>
              ) : null}
            </div>
            {categories.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-surface-2 p-5 text-fg-muted">{t("profile.noMenu")}</p>
            ) : (
              <>
                <nav className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  {categories.map((c) => (
                    <a
                      key={c.id}
                      href={`#cat-${c.id}`}
                      className="inline-flex h-9 shrink-0 items-center rounded-full bg-surface-2 px-4 text-sm font-semibold whitespace-nowrap hover:bg-surface-3"
                    >
                      {c.name}
                    </a>
                  ))}
                </nav>
                <div className="mt-6 space-y-8">
                  {categories.map((c) => (
                    <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-24">
                      <h3 className="mb-3 text-lg font-bold">{c.name}</h3>
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {c.items.map((p) => (
                          <li
                            key={p.id}
                            className={cn(
                              "flex gap-3 rounded-2xl bg-surface p-3 ring-1 ring-border",
                              !p.isAvailable && "opacity-60",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="leading-6 font-bold">{p.name}</p>
                              {p.description ? (
                                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-muted">
                                  {p.description}
                                </p>
                              ) : null}
                              {/* The owner may keep prices for the QR menu only. */}
                              {!p.isAvailable || place.showPrices ? (
                                <p className="mt-1.5 text-sm font-bold text-accent-text tabular-nums">
                                  {p.isAvailable
                                    ? formatMoney(p.priceCents, place.currency, locale)
                                    : t("profile.soldOut")}
                                </p>
                              ) : null}
                            </div>
                            {p.images[0] ? (
                              <img
                                src={p.images[0].sm}
                                alt=""
                                loading="lazy"
                                className="size-20 shrink-0 rounded-xl bg-surface-2 object-cover"
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </>
            )}
          </section>
          <div className="lg:hidden">{hoursCard}</div>
        </div>

        <aside className="order-first space-y-4 lg:sticky lg:top-24 lg:order-none lg:self-start">
          {bookCard}

          <div className="hidden lg:block">{hoursCard}</div>
        </aside>
      </div>

      {bar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-border bg-bg/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          {orderOnline ? (
            <Link
              href={`/r/${place.slug}/order`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-fg text-base font-bold text-bg"
            >
              <ShoppingBag className="size-5" aria-hidden="true" />
              {t("orderOnline")}
            </Link>
          ) : null}
          {place.reservable ? (
            <Link
              href={`/r/${place.slug}/book`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-base font-bold text-accent-fg"
            >
              <CalendarCheck className="size-5" aria-hidden="true" />
              {t("book")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"directory">>>;

function OpenLine({ place, t }: { place: DirectoryResult; t: T }) {
  if (place.open.status === "unknown") return null;
  const open = place.open.status === "open";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={open ? "size-2 rounded-full bg-emerald-400" : "size-2 rounded-full bg-rose-400"} />
      <span className="font-bold">{open ? t("open") : t("closed")}</span>
      <span className="tabular-nums opacity-85">
        {place.open.status === "open"
          ? t("openUntil", { time: place.open.until })
          : place.open.from
            ? t("opensAt", { time: place.open.from })
            : null}
      </span>
    </span>
  );
}
