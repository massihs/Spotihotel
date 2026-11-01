import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Hash,
  Hourglass,
  MessageSquare,
  Navigation,
  PartyPopper,
  Phone,
  Ticket,
  UtensilsCrossed,
  Users,
  XCircle,
} from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { AutoRefresh, CancelBooking } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { db } from "@/server/db/client";
import { getDirectory } from "@/server/modules/directory/cache";
import { getByCode } from "@/server/modules/reservations/service";
import { PlaceInitials } from "@/components/ui/place-initials";

type Props = PageProps<"/[locale]/r/[slug]/b/[code]">;

/** A booking's status page is personal: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StatusPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Status params={params} />
    </Suspense>
  );
}

async function Status({ params }: Pick<Props, "params">) {
  const { slug, code } = await params;
  const found = await getByCode(db, slug, code);
  if (!found) notFound();
  const { place, reservation: r, ahead } = found;
  const [t, format] = await Promise.all([getTranslations("booking"), getFormatter()]);
  const live = ["pending", "confirmed", "notified"].includes(r.status);
  if (r.kind === "queue")
    return (
      <div data-brand={place.brandColor}>
        <PlaceHeader name={place.name} logoKey={place.logoKey} title={t("yourTicket")} />
        <main className="relative mx-auto -mt-8 max-w-md space-y-4 rounded-t-3xl bg-bg px-4 pt-6 pb-12">
          {live ? <AutoRefresh seconds={20} /> : null}
          <div className="rounded-3xl border border-border bg-surface p-5 text-center shadow-[var(--shadow-float)]">
            <Ticket className="mx-auto size-8 text-accent" />
            <p className="mt-2 text-sm text-fg-muted">{t("ticketNumber")}</p>
            <p className="text-6xl font-black tabular-nums">{r.queueNumber}</p>
            {r.status === "notified" ? (
              <p className="mt-3 animate-pulse rounded-2xl bg-success-soft px-4 py-3 text-lg font-bold text-success">
                {t("tableReady")}
              </p>
            ) : r.status === "confirmed" ? (
              <p className="mt-3 text-lg font-semibold">
                {ahead === 0 ? t("youAreNext") : t("ahead", { count: ahead })}
              </p>
            ) : null}
            <p className="mt-3 inline-flex items-center gap-1 text-fg-muted">
              <Users className="size-4" />
              {t("forPeople", { count: r.partySize, name: r.name })}
            </p>
            <div className="mt-4">
              <StatusPill status={r.status} label={t(`status.${r.status}`)} />
            </div>
          </div>
          {live ? <CancelBooking slug={slug} code={code} /> : null}
        </main>
      </div>
    );

  const listing = (await getDirectory()).find((e) => e.id === place.id);
  const pos = listing?.position;
  const mapsUrl = pos
    ? pos.approximate
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, listing?.address].filter(Boolean).join(" "))}`
      : `https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lng}`
    : null;
  const ended = r.status === "cancelled" || r.status === "no_show";
  const Icon = ended ? XCircle : r.status === "pending" ? Hourglass : CheckCircle2;
  const occasion = r.occasion && t.has(`occasion.${r.occasion}`) ? t(`occasion.${r.occasion}`) : null;
  const action =
    "flex h-12 items-center justify-center gap-2 rounded-2xl bg-surface text-sm font-bold ring-1 ring-border transition-colors hover:bg-surface-2";

  return (
    <div data-brand={place.brandColor}>
      {/* Pending bookings follow the restaurant's answer without a reload. */}
      {r.status === "pending" ? <AutoRefresh seconds={30} /> : null}
      <header className="relative h-48 overflow-hidden bg-gradient-to-br from-accent to-accent-hover sm:h-56">
        {listing?.cover ? (
          <img src={listing.cover.lg} alt="" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10"
        />
      </header>
      <main className="relative mx-auto -mt-24 max-w-lg space-y-4 px-4 pb-12">
        <section className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-float)] ring-1 ring-border">
          <div className="px-5 pt-6 pb-5 text-center">
            <span
              className={cn(
                "mx-auto grid size-16 place-items-center rounded-full",
                ended
                  ? "bg-danger-soft text-danger"
                  : r.status === "pending"
                    ? "bg-warning-soft text-warning"
                    : "bg-success-soft text-success",
              )}
            >
              <Icon className="size-9" aria-hidden="true" />
            </span>
            <h1 className="mt-3 text-2xl font-black">{t(`done.title.${r.status}`)}</h1>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-fg-muted">
              {t(`done.body.${r.status}`)}
            </p>
          </div>

          <div className="flex items-center gap-3 border-t border-border bg-surface-2/60 px-5 py-4">
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-border">
              {listing?.logo ? (
                <img src={listing.logo} alt="" className="size-full object-contain p-1" />
              ) : (
                <PlaceInitials name={place.name} className="text-lg" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{place.name}</p>
              {listing?.address ? <p className="truncate text-xs text-fg-muted">{listing.address}</p> : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-px bg-border">
            <Cell icon={<CalendarDays className="size-4" />} label={t("day")}>
              {format.dateTime(r.startsAt, {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: place.timezone,
              })}
            </Cell>
            <Cell icon={<Clock className="size-4" />} label={t("time")}>
              <span dir="ltr" className="text-xl font-black tabular-nums">
                {format.dateTime(r.startsAt, { timeStyle: "short", timeZone: place.timezone })}
              </span>
            </Cell>
            <Cell icon={<Users className="size-4" />} label={t("people")}>
              {t("guests", { count: r.partySize })}
            </Cell>
            <Cell icon={<Hash className="size-4" />} label={t("reference")}>
              <span dir="ltr" className="latin-digits text-sm tracking-wider uppercase">
                {r.code.slice(0, 6)}
              </span>
            </Cell>
          </dl>
          {occasion || r.note ? (
            <div className="space-y-2 border-t border-border px-5 py-4 text-sm">
              {occasion ? (
                <p className="flex items-center gap-2">
                  <PartyPopper className="size-4 text-accent-text" aria-hidden="true" />
                  {occasion}
                </p>
              ) : null}
              {r.note ? (
                <p className="flex items-start gap-2 text-fg-muted">
                  <MessageSquare className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {r.note}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm">
            <span className="text-fg-muted">{r.name}</span>
            <StatusPill status={r.status} label={t(`status.${r.status}`)} />
          </div>
        </section>

        {ended ? (
          <Link
            href={`/r/${slug}/book`}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-accent"
          >
            <CalendarCheck className="size-5" aria-hidden="true" />
            {t("bookTitle")}
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {live ? (
              <a href={`/api/v1/bookings/${slug}/${code}/calendar`} className={action}>
                <CalendarPlus className="size-4" aria-hidden="true" />
                {t("addToCalendar")}
              </a>
            ) : null}
            {mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className={action}>
                <Navigation className="size-4" aria-hidden="true" />
                {t("directions")}
              </a>
            ) : null}
            {listing?.phone ? (
              <a href={`tel:${listing.phone.replace(/[^+0-9]/g, "")}`} className={action}>
                <Phone className="size-4" aria-hidden="true" />
                {t("call")}
              </a>
            ) : null}
            {listing ? (
              <Link href={`/r/${slug}`} className={action}>
                <UtensilsCrossed className="size-4" aria-hidden="true" />
                {t("seeMenu")}
              </Link>
            ) : null}
          </div>
        )}

        {live ? <CancelBooking slug={slug} code={code} /> : null}
        <p className="text-center text-sm">
          <Link href="/restaurants" className="font-semibold text-accent-text hover:underline">
            {t("bookAnother")}
          </Link>
        </p>
      </main>
    </div>
  );
}

function Cell({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface px-5 py-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-bold">{children}</dd>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-3 py-1 text-xs font-bold",
        status === "cancelled" || status === "no_show"
          ? "bg-danger-soft text-danger"
          : status === "pending"
            ? "bg-warning-soft text-warning"
            : "bg-success-soft text-success",
      )}
    >
      {label}
    </span>
  );
}
