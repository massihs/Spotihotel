import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  BookOpenCheck,
  CalendarPlus,
  CalendarRange,
  ChartSpline,
  ConciergeBell,
  Contact,
  Flower2,
  KeyRound,
  LogIn,
  LogOut,
  MoonStar,
  SprayCan,
  Users,
  Check,
  Globe,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { calendarLocale, formatCalendarDate } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { db } from "@/server/db/client";
import { can, type RestaurantContext } from "@/server/tenancy";
import { hotelHome } from "@/server/modules/pms/home";
import { getSetupOverview } from "@/server/modules/dashboard/service";
import { CheckInButton } from "./check-in-wizard";
import { DEFAULT_LOCALE } from "@/i18n/config";

/**
 * A hotel's home page, built for the general manager and the front office: tonight's occupancy,
 * ADR and RevPAR, the day's movements, the rooms to clean, two weeks on the books, the day's
 * revenue and what is left to set up.
 */
/** The quick tiles, each in its own blue. */
const SHADES = [
  "shade-royal",
  "shade-azure",
  "shade-cyan",
  "shade-periwinkle",
  "shade-indigo",
  "shade-sky",
  "shade-steel",
  "shade-navy",
];

export async function HotelHome({ ctx, money }: { ctx: RestaurantContext; money: (c: number) => string }) {
  const [t, tDept, tSource, locale, home, setup] = await Promise.all([
    getTranslations("dashboard.home"),
    getTranslations("pms.dept"),
    getTranslations("pms.source"),
    getLocale(),
    hotelHome(db, ctx),
    getSetupOverview(db, ctx),
  ]);
  const base = `/dashboard/${ctx.restaurant.id}`;
  const cal = calendarLocale(locale, EDITION);
  const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
    formatCalendarDate(
      new Intl.DateTimeFormat(cal, { ...opts, timeZone: "UTC" }),
      new Date(`${day}T12:00:00Z`),
    );
  const f = home.figures;
  const name = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`.trim();
  const pct = (n: number) => `${Math.round(n)}%`;
  const checkedIn = home.arrivals.length;
  const toClean = home.rooms.dirty;
  const canDesk = can(ctx, "frontdesk.manage");

  const alerts = [
    home.auditLate && {
      href: `${base}/frontdesk`,
      label: t("alerts.auditLate", { day: fmtDay(home.businessDate, { day: "numeric", month: "long" }) }),
      Icon: MoonStar,
      className: "bg-danger text-white ring-danger",
    },
    home.openRequests > 0 &&
      can(ctx, "orders.view") && {
        href: `${base}/requests`,
        label: t("alerts.requests", { n: home.openRequests }),
        Icon: ConciergeBell,
        className: "bg-danger-soft text-danger ring-danger/25",
      },
    checkedIn > 0 && {
      href: `${base}/frontdesk`,
      label: t("alerts.arrivals", { n: checkedIn }),
      Icon: LogIn,
      className: "bg-info-soft text-info ring-info/25",
    },
    home.departures.length > 0 && {
      href: `${base}/frontdesk`,
      label: t("alerts.departures", { n: home.departures.length }),
      Icon: LogOut,
      className: "bg-warning-soft text-warning ring-warning/30",
    },
    toClean > 0 && {
      href: `${base}/rooms`,
      label: t("alerts.dirty", { n: toClean }),
      Icon: SprayCan,
      className: "bg-surface text-fg-muted ring-border",
    },
    home.unassignedSoon > 0 &&
      can(ctx, "frontdesk.manage") && {
        href: `${base}/planning`,
        label: t("alerts.unassigned", { n: home.unassignedSoon }),
        Icon: Wand2,
        className: "border-brand-200 bg-brand-50 text-brand-800",
      },
  ].filter((x) => !!x);

  const quick: { href: string; label: string; Icon: typeof KeyRound; show: boolean }[] = [
    {
      href: `${base}/stays/new`,
      label: t("quick.newBooking"),
      Icon: CalendarPlus,
      show: can(ctx, "frontdesk.manage"),
    },
    { href: `${base}/frontdesk`, label: t("quick.frontdesk"), Icon: KeyRound, show: true },
    { href: `${base}/planning`, label: t("quick.planning"), Icon: CalendarRange, show: true },
    { href: `${base}/guests`, label: t("quick.guests"), Icon: Contact, show: true },
    {
      href: `${base}/housekeeping`,
      label: t("quick.rooms"),
      Icon: BedDouble,
      show: can(ctx, "tables.view"),
    },
    {
      href: `${base}/requests`,
      label: t("quick.requests"),
      Icon: ConciergeBell,
      show: can(ctx, "orders.view"),
    },
    { href: `${base}/wellness`, label: t("quick.wellness"), Icon: Flower2, show: true },
    {
      href: `${base}/ledger`,
      label: t("quick.ledger"),
      Icon: BookOpenCheck,
      show: can(ctx, "accounting.manage"),
    },
  ];

  const steps = [
    { key: "profile", done: setup.profileComplete, href: `${base}/settings#profile` },
    { key: "roomTypes", done: home.setup.roomTypes > 0, href: `${base}/hotel?tab=rooms` },
    { key: "rooms", done: home.setup.roomsTyped, href: `${base}/hotel?tab=rooms` },
    { key: "rates", done: home.setup.ratePlans > 0, href: `${base}/hotel?tab=plans` },
    { key: "payments", done: setup.paymentsReady, href: `${base}/settings#payments` },
    { key: "team", done: setup.members > 1, href: `${base}/team` },
    { key: "firstBooking", done: home.setup.bookings > 0, href: `${base}/stays/new` },
  ] as const;
  const doneCount = steps.filter((s) => s.done).length;
  const maxAhead = Math.max(1, ...home.ahead.map((d) => d.occupancyPct));

  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
        description={
          <span>
            {t("businessDate", {
              day: fmtDay(home.businessDate, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })}
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}/h/${ctx.restaurant.slug}`}
              target="_blank"
              rel="noopener"
              className={buttonClasses("secondary")}
            >
              <Globe className="size-4" aria-hidden="true" />
              {t("bookingPage")}
            </a>
            <Link href={`${base}/frontdesk`} className={buttonClasses("secondary")}>
              <KeyRound className="size-4" aria-hidden="true" />
              {t("quick.frontdesk")}
            </Link>
            {can(ctx, "frontdesk.manage") ? (
              <Link href={`${base}/stays/new`} className={buttonClasses("primary")}>
                <CalendarPlus className="size-4" aria-hidden="true" />
                {t("quick.newBooking")}
              </Link>
            ) : null}
          </div>
        }
      />

      {alerts.length ? (
        <div className="-mx-4 mb-4 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {alerts.map(({ href, label, Icon, className }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "inline-flex h-8 shrink-0 snap-start items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold whitespace-nowrap ring-1 transition-opacity duration-150 ring-inset hover:opacity-85 [&_svg]:size-3.5",
                className,
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      {/* Tonight + the day's movements */}
      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="sidebar-shade relative isolate overflow-hidden border-transparent bg-[var(--sidebar)] p-6 text-[var(--sidebar-fg)] shadow-[var(--shadow-float)] ring-1 ring-white/5">
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:var(--brass)] [--tex-opacity:0.14] [--tex-size:64px]"
          />
          <span aria-hidden="true" className="texture-grain [--grain-opacity:0.1]" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium opacity-75">{t("tonight")}</p>
              <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                {pct(f.occupancyPct)}
              </p>
              <p className="mt-1 text-sm opacity-80">{t("roomsSold", { sold: f.sold, rooms: f.rooms })}</p>
            </div>
            <span
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-[var(--brass)] ring-1 ring-white/10"
              aria-hidden="true"
            >
              <BedDouble className="size-5" />
            </span>
          </div>
          <dl className="relative mt-5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-white/12 pt-4 text-sm sm:grid-cols-3">
            <Figure label={t("adr")} value={money(f.adrCents)} />
            <Figure label={t("revpar")} value={money(f.revparCents)} />
            <Figure label={t("guests")} value={String(f.guests)} />
          </dl>
          <div className="relative mt-5">
            <p className="text-xs font-medium opacity-75">
              {t("next14", { pct: pct(home.aheadTotals.occupancyPct) })}
            </p>
            <div className="mt-3 flex h-20 items-end gap-1 sm:h-28 sm:gap-1.5">
              {home.ahead.map((d, i) => (
                <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                  <div
                    className={cn(
                      "w-full rounded-md",
                      i === 0
                        ? "bg-[var(--brass)] bg-[image:var(--brass-gradient)]"
                        : "shade-sky shade-bar opacity-80",
                    )}
                    style={{ height: `${Math.max(6, (d.occupancyPct / maxAhead) * 80)}%` }}
                    title={`${fmtDay(d.day, { day: "numeric", month: "short" })} · ${pct(d.occupancyPct)} · ${d.sold}/${d.rooms}`}
                  />
                  <span className={cn("text-[10px] tabular-nums", i === 0 ? "font-bold" : "opacity-70")}>
                    {fmtDay(d.day, { day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <StatLink href={`${base}/frontdesk`}>
            <StatCard
              label={t("arrivals")}
              value={home.arrivals.length}
              hint={home.precheckins ? t("precheckins", { n: home.precheckins }) : undefined}
              icon={<LogIn />}
              tone="azure"
            />
          </StatLink>
          <StatLink href={`${base}/frontdesk`}>
            <StatCard
              label={t("departures")}
              value={home.departures.length}
              icon={<LogOut />}
              tone="periwinkle"
            />
          </StatLink>
          <StatLink href={`${base}/stays`}>
            <StatCard
              label={t("inHouse")}
              value={home.inHouse}
              hint={t("guestsN", { n: f.guests })}
              icon={<Users />}
              tone="cyan"
            />
          </StatLink>
          <StatLink href={can(ctx, "tables.view") ? `${base}/rooms` : null}>
            <StatCard
              label={t("toClean")}
              value={toClean}
              hint={
                home.rooms.outOfOrder
                  ? t("outOfOrder", { n: home.rooms.outOfOrder })
                  : t("cleaning", { n: home.rooms.cleaning })
              }
              icon={<SprayCan />}
              tone="royal"
            />
          </StatLink>
        </div>
      </section>

      {/* Quick access */}
      <nav aria-label={t("quickTitle")} className="mt-4 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {quick
          .filter((q) => q.show)
          .map(({ href, label, Icon }, i) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-1.5 py-3 text-center shadow-[var(--shadow-card)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-brand-300",
                SHADES[i % SHADES.length],
              )}
            >
              <span className="shade-fill grid size-11 place-items-center rounded-full transition-transform group-hover:scale-105">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="line-clamp-2 text-xs leading-tight font-semibold sm:text-[13px]">{label}</span>
            </Link>
          ))}
      </nav>

      {/* Bookings taken today, per channel: what the hotel's own page brings in */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">{t("bookedToday")}</p>
            <p className="text-2xl font-bold tabular-nums">{home.bookedToday.count}</p>
            {home.bookedToday.cents ? (
              <p className="text-sm font-semibold text-fg-muted tabular-nums">
                {money(home.bookedToday.cents)}
              </p>
            ) : null}
          </div>
          {/* Phone: the channels take the full width under the figure instead of a narrow column. */}
          <ul className="flex min-w-0 basis-full flex-wrap gap-1.5 sm:flex-1 sm:basis-0">
            {home.bookedToday.bySource.map((b) => (
              <li
                key={b.source}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  b.source === "website" ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
                )}
              >
                {tSource.has(b.source as "direct") ? tSource(b.source as "direct") : b.source} · {b.count}
              </li>
            ))}
            {home.bookedToday.count === 0 ? (
              <li className="text-sm text-fg-muted">{t("noBookingsToday")}</li>
            ) : null}
          </ul>
          <a
            href={`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}/h/${ctx.restaurant.slug}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline"
          >
            <Globe className="size-4" aria-hidden="true" />
            {t("bookingPageHint")}
          </a>
        </div>
      </Card>

      {doneCount < steps.length ? (
        <Card className="mt-4">
          <CardHeader
            title={t("setupTitle")}
            description={t("setupSubtitle")}
            action={
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text tabular-nums">
                {doneCount}/{steps.length}
              </span>
            }
          />
          <ol className="grid gap-1 p-3 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2",
                    !s.done && "font-medium",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      s.done ? "bg-accent text-accent-fg" : "text-fg-muted ring-1 ring-border-strong",
                    )}
                    aria-hidden="true"
                  >
                    {s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("text-sm", s.done && "text-fg-muted line-through")}>
                    {t(`setup.${s.key}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {/* The day's lists */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader
            title={t("arrivalsTitle")}
            action={<SeeAll href={`${base}/frontdesk`} label={t("seeAll")} />}
          />
          {home.arrivals.length ? (
            <ul className="divide-y divide-border">
              {home.arrivals.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center">
                  <Link
                    href={`${base}/stays/${s.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 ps-5 pe-2 transition-colors hover:bg-surface-2"
                  >
                    <RoomBadge label={s.roomLabel} code={s.typeCode} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {name(s)}
                        {s.vip ? (
                          <span className="ms-1.5 text-[11px] font-bold text-warning">VIP</span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-fg-muted">
                        {t("nightsN", { n: nights(s.arrival, s.departure) })}
                        {s.accountName ? ` | ${s.accountName}` : ""}
                      </span>
                    </span>
                    {s.precheckinAt ? (
                      <span className="shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-bold text-success">
                        {t("precheckedIn")}
                      </span>
                    ) : s.eta ? (
                      <bdi dir="ltr" className="shrink-0 text-sm font-semibold text-fg-muted tabular-nums">
                        {s.eta.slice(0, 5)}
                      </bdi>
                    ) : null}
                  </Link>
                  {canDesk ? (
                    <span className="shrink-0 pe-4">
                      <CheckInButton
                        restaurantId={ctx.restaurant.id}
                        currency={ctx.restaurant.currency}
                        stayId={s.id}
                        label={t("checkIn")}
                        variant="secondary"
                      />
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<LogIn />} text={t("noArrivals")} />
          )}
        </Card>
        <Card className="flex flex-col">
          <CardHeader
            title={t("departuresTitle")}
            action={<SeeAll href={`${base}/frontdesk`} label={t("seeAll")} />}
          />
          {home.departures.length ? (
            <ul className="divide-y divide-border">
              {home.departures.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`${base}/stays/${s.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                  >
                    <RoomBadge label={s.roomLabel} code={s.typeCode} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{name(s)}</span>
                      <span className="block truncate text-xs text-fg-muted">
                        {t("nightsN", { n: nights(s.arrival, s.departure) })}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                        s.balanceCents > 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
                      )}
                    >
                      {s.balanceCents > 0 ? money(s.balanceCents) : t("settled")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<LogOut />} text={t("noDepartures")} />
          )}
        </Card>
      </div>

      {/* Money */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader
            title={t("revenueTitle")}
            description={t("revenueHint")}
            action={
              can(ctx, "accounting.manage") ? (
                <SeeAll href={`${base}/ledger`} label={t("books")} />
              ) : undefined
            }
          />
          {home.departments.length ? (
            <div className="space-y-3 p-5">
              {home.departments.map((d) => (
                <div key={d.department}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      {tDept.has(d.department as "room") ? tDept(d.department as "room") : d.department}
                    </span>
                    <span className="tabular-nums">{money(d.cents)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.max(2, (d.cents / Math.max(1, home.departments[0]!.cents)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="font-bold">{t("total")}</span>
                <span className="font-bold tabular-nums">{money(home.revenueCents)}</span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-sm text-fg-muted">
                <span>{t("collected")}</span>
                <span className="tabular-nums">{money(home.paymentsCents)}</span>
              </div>
            </div>
          ) : (
            <Empty icon={<ChartSpline />} text={t("noRevenue")} />
          )}
        </Card>
        <Card className="flex flex-col">
          <CardHeader
            title={t("lastAuditTitle")}
            description={
              home.lastAudit
                ? fmtDay(home.lastAudit.businessDate, { weekday: "long", day: "numeric", month: "long" })
                : undefined
            }
            action={<SeeAll href={`${base}/forecast`} label={t("forecast")} />}
          />
          {home.lastAudit ? (
            <dl className="grid grid-cols-2 gap-4 p-5">
              <AuditFigure
                label={t("occupancy")}
                value={pct(
                  home.lastAudit.roomsAvailable
                    ? (home.lastAudit.roomsSold / home.lastAudit.roomsAvailable) * 100
                    : 0,
                )}
              />
              <AuditFigure
                label={t("adr")}
                value={money(
                  home.lastAudit.roomsSold
                    ? Math.round(home.lastAudit.roomRevenueCents / home.lastAudit.roomsSold)
                    : 0,
                )}
              />
              <AuditFigure label={t("totalRevenue")} value={money(home.lastAudit.totalRevenueCents)} />
              <AuditFigure label={t("collected")} value={money(home.lastAudit.paymentsCents)} />
            </dl>
          ) : (
            <Empty icon={<AlertTriangle />} text={t("noAudit")} />
          )}
        </Card>
      </div>
    </>
  );
}

const nights = (a: string, d: string) =>
  Math.max(1, Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs opacity-70">{label}</dt>
      <dd className="mt-0.5 font-bold break-words tabular-nums">{value}</dd>
    </div>
  );
}

function AuditFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function RoomBadge({ label, code }: { label: string | null; code: string }) {
  return (
    <span
      className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-center leading-none text-accent-text"
      aria-hidden="true"
    >
      <span>
        <span className="block text-sm font-bold tabular-nums">{label ?? "—"}</span>
        <span className="mt-0.5 block text-[10px] font-semibold opacity-75">{code}</span>
      </span>
    </span>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
    >
      {label}
      <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
    </Link>
  );
}

function StatLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) return children;
  return (
    <Link
      href={href}
      className="block rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[var(--ring)] [&>*]:h-full"
    >
      {children}
    </Link>
  );
}

function Empty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center text-sm text-fg-muted">
      <span className="grid size-11 place-items-center rounded-2xl bg-surface-2 text-fg-subtle [&_svg]:size-5">
        {icon}
      </span>
      {text}
    </div>
  );
}
