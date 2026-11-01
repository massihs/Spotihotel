import { Suspense } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Hourglass, Users, UserX } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { Agenda } from "@/components/reservations/agenda";
import { HostView } from "@/components/reservations/host-view";
import { FLOOR_COLS, FLOOR_ROWS, hostView } from "@/server/modules/reservations/floor";
import {
  BookingList,
  NewBookingButton,
  QueueBoard,
  ReservationSettings,
} from "@/components/reservations/reservations-ui";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { localDay } from "@/lib/period";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import {
  agendaDay,
  getReservationSettings,
  listDay,
  weekCounts,
} from "@/server/modules/reservations/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/reservations">;
const TABS = ["plan", "agenda", "bookings", "queue", "settings"] as const;

export default function ReservationsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Reservations params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const shift = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function Reservations({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const sp = await searchParams;
  const tz = ctx.restaurant.timezone;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "plan";
  const today = localDay(new Date(), tz);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  // The strip shows the selected day in a week, starting a little before it.
  const stripStart = shift(day, -2);
  const [t, format, locale, data, settings, week, agenda, host] = await Promise.all([
    getTranslations("reservations"),
    getFormatter(),
    getLocale(),
    listDay(db, ctx, tab === "queue" ? today : day),
    getReservationSettings(db, ctx),
    weekCounts(db, ctx, stripStart),
    tab === "agenda" ? agendaDay(db, ctx, day) : null,
    tab === "plan" ? hostView(db, ctx, day) : null,
  ]);
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/reservations`;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const rows = (list: typeof data.bookings) =>
    list.map((r) => ({ ...r, startsAt: r.startsAt.toISOString(), notifiedAt: iso(r.notifiedAt) }));
  const active = data.bookings.filter((b) => !["cancelled", "no_show"].includes(b.status));
  const waiting = data.queue.filter((q) => q.status === "confirmed" || q.status === "notified").length;
  const prefix = locale === "fa" ? "" : `/${locale}`;
  const tabQs = tab === "plan" ? "" : `tab=${tab}&`;
  const appUrl = env().APP_URL;

  return (
    <>
      <LiveRefresh types={["notification.created"]} />
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          tab === "bookings" || tab === "agenda" ? (
            <NewBookingButton rid={rid} day={day} timeZone={tz} defaultDuration={settings.durationMin} />
          ) : null
        }
      />
      <nav
        className="-mx-4 mb-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.filter((k) => k !== "settings" || can(ctx, "restaurant.manage")).map((k) => (
          <Link
            key={k}
            href={k === "plan" ? base : `${base}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
            {k === "queue" && waiting ? (
              <span className="ms-2 inline-grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-white tabular-nums">
                {waiting}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {tab === "bookings" || tab === "agenda" || tab === "plan" ? (
        <>
          <div className="mb-4 flex items-center gap-2">
            <Link
              href={`${base}?${tabQs}day=${shift(day, -7)}`}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-border"
              aria-label={t("prevDay")}
            >
              <ChevronRight className="size-5 ltr:rotate-180" />
            </Link>
            <ol className="flex min-w-0 flex-1 [scrollbar-width:none] gap-2 overflow-x-auto py-1">
              {Array.from({ length: 7 }, (_, i) => shift(stripStart, i)).map((d) => {
                const c = week.get(d);
                const selected = d === day;
                const date = new Date(`${d}T12:00:00Z`);
                return (
                  <li key={d} className="min-w-16 flex-1">
                    <Link
                      href={
                        d === today
                          ? `${base}${tabQs ? `?${tabQs.slice(0, -1)}` : ""}`
                          : `${base}?${tabQs}day=${d}`
                      }
                      aria-current={selected ? "date" : undefined}
                      className={cn(
                        "flex flex-col items-center gap-0.5 rounded-2xl px-2 py-2 transition-colors",
                        selected
                          ? "bg-fg text-bg shadow-[var(--shadow-float)]"
                          : "bg-surface ring-1 ring-border hover:ring-border-strong",
                      )}
                    >
                      <span className={cn("text-[11px]", selected ? "opacity-80" : "text-fg-muted")}>
                        {d === today
                          ? t("today")
                          : format.dateTime(date, { weekday: "short", timeZone: "UTC" })}
                      </span>
                      <span className="text-lg leading-none font-black tabular-nums">
                        {format.dateTime(date, { day: "numeric", timeZone: "UTC" })}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                          c?.bookings
                            ? selected
                              ? "bg-bg/20"
                              : "bg-accent-soft text-accent-text"
                            : "opacity-40",
                        )}
                      >
                        {c?.bookings ?? 0}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            <Link
              href={`${base}?${tabQs}day=${shift(day, 7)}`}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-border"
              aria-label={t("nextDay")}
            >
              <ChevronLeft className="size-5 ltr:rotate-180" />
            </Link>
          </div>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              {format.dateTime(new Date(`${day}T12:00:00Z`), {
                weekday: "long",
                day: "numeric",
                month: "long",
                timeZone: "UTC",
              })}
            </h2>
            {day !== today ? (
              <Link
                href={`${base}${tabQs ? `?${tabQs.slice(0, -1)}` : ""}`}
                className="text-sm font-semibold text-accent-text hover:underline"
              >
                {t("today")}
              </Link>
            ) : null}
          </div>
          <div className="-mx-4 mb-5 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
            {[
              {
                k: "statBookings",
                v: active.length,
                icon: <CalendarCheck className="size-5" aria-hidden="true" />,
                tone: "bg-accent-soft text-accent-text",
              },
              {
                k: "statCovers",
                v: active.reduce((s, b) => s + b.partySize, 0),
                icon: <Users className="size-5" aria-hidden="true" />,
                tone: "bg-info-soft text-info",
              },
              {
                k: "statPending",
                v: data.bookings.filter((b) => b.status === "pending").length,
                icon: <Hourglass className="size-5" aria-hidden="true" />,
                tone: "bg-warning-soft text-warning",
              },
              {
                k: "statNoShow",
                v: data.bookings.filter((b) => b.status === "no_show").length,
                icon: <UserX className="size-5" aria-hidden="true" />,
                tone: "bg-danger-soft text-danger",
              },
            ].map((x) => (
              <div
                key={x.k}
                className="flex min-w-40 shrink-0 items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-[var(--shadow-soft)] ring-1 ring-border sm:min-w-0"
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", x.tone)}>
                  {x.icon}
                </span>
                <span>
                  <span className="block text-xl leading-none font-black tabular-nums">{x.v}</span>
                  <span className="mt-1 block text-xs text-fg-muted">{t(x.k)}</span>
                </span>
              </div>
            ))}
          </div>
          {tab === "plan" && host ? (
            <HostView
              rid={rid}
              day={day}
              isToday={day === today}
              timeZone={tz}
              dayStartsAt={host.dayStartsAt.toISOString()}
              tables={host.tables.map((x) => ({
                id: x.id,
                label: x.label,
                capacity: x.capacity,
                zone: x.zone,
                zoneKey: x.zoneKey,
                shape: x.shape,
                x: x.x,
                y: x.y,
                w: x.w,
                h: x.h,
              }))}
              bookings={host.bookings.map((b) => ({
                id: b.id,
                name: b.name,
                phone: b.phone,
                partySize: b.partySize,
                startsAt: b.startsAt.toISOString(),
                durationMin: b.durationMin,
                status: b.status,
                tableId: b.tableId,
                note: b.note,
                source: b.source,
                occasion: b.occasion,
              }))}
              occupied={host.occupied.map((o) => ({ ...o, since: o.since.toISOString() }))}
              ranges={host.ranges}
              durationMin={host.durationMin}
              maxParty={host.maxParty}
              canEdit={can(ctx, "tables.manage")}
              cols={FLOOR_COLS}
              rows={FLOOR_ROWS}
            />
          ) : tab === "agenda" && agenda ? (
            <Agenda
              rid={rid}
              day={day}
              isToday={day === today}
              timeZone={tz}
              dayStartsAt={agenda.dayStartsAt.toISOString()}
              tables={agenda.tables}
              bookings={agenda.bookings.map((b) => ({
                id: b.id,
                name: b.name,
                phone: b.phone,
                partySize: b.partySize,
                startsAt: b.startsAt.toISOString(),
                durationMin: b.durationMin,
                status: b.status,
                tableId: b.tableId,
                note: b.note,
                source: b.source,
              }))}
              ranges={agenda.ranges}
              durationMin={agenda.durationMin}
            />
          ) : (
            <BookingList rid={rid} rows={rows(data.bookings)} timeZone={tz} locale={locale} />
          )}
        </>
      ) : null}
      {tab === "queue" ? <QueueBoard rid={rid} rows={rows(data.queue)} /> : null}
      {tab === "settings" ? (
        <ReservationSettings
          rid={rid}
          initial={settings}
          links={{
            book: `${appUrl}${prefix}/r/${settings.slug}/book`,
            queue: `${appUrl}${prefix}/r/${settings.slug}/queue`,
          }}
        />
      ) : null}
    </>
  );
}
