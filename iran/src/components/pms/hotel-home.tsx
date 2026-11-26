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
  CalendarDays,
  Users,
  Check,
  Globe,
  Wand2,
} from "@/components/icons";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
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
      tone: "bg-danger text-white",
    },
    home.openRequests > 0 &&
      can(ctx, "orders.view") && {
        href: `${base}/requests`,
        label: t("alerts.requests", { n: home.openRequests }),
        Icon: ConciergeBell,
        tone: "bg-danger-soft text-danger",
      },
    checkedIn > 0 && {
      href: `${base}/frontdesk`,
      label: t("alerts.arrivals", { n: checkedIn }),
      Icon: LogIn,
      tone: "bg-info-soft text-info",
    },
    home.departures.length > 0 && {
      href: `${base}/frontdesk`,
      label: t("alerts.departures", { n: home.departures.length }),
      Icon: LogOut,
      tone: "bg-warning-soft text-warning",
    },
    toClean > 0 && {
      href: `${base}/rooms`,
      label: t("alerts.dirty", { n: toClean }),
      Icon: SprayCan,
      tone: "shade-soft shade-cyan",
    },
    home.unassignedSoon > 0 &&
      can(ctx, "frontdesk.manage") && {
        href: `${base}/planning`,
        label: t("alerts.unassigned", { n: home.unassignedSoon }),
        Icon: Wand2,
        tone: "shade-soft shade-periwinkle",
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

  const settled = home.departures.filter((s) => s.balanceCents <= 0).length;
  const ready = Math.max(
    0,
    home.rooms.total - home.rooms.dirty - home.rooms.cleaning - home.rooms.outOfOrder,
  );
  const share = (n: number, of: number) => (of > 0 ? Math.min(100, (n / of) * 100) : 0);
  // Fridays (the Iranian weekend) stand out on the two weeks ahead.
  const weekend = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === (EDITION === "iran" ? 5 : 6);

  return (
    <>
      {/* Greeting: the business day, its state, tonight in one sentence, the main actions. */}
      <section className="home-hero relative isolate mb-5 overflow-hidden rounded-2xl border border-border bg-surface px-5 py-5 shadow-[var(--shadow-card)] sm:px-7 sm:py-6">
        <span
          aria-hidden="true"
          className="texture-khatam texture-fade-corner [--tex-color:var(--shade,var(--accent))] [--tex-opacity:0.1] [--tex-size:58px]"
        />
        <span
          aria-hidden="true"
          className="home-hero-glow pointer-events-none absolute -end-28 -top-32 size-80 rounded-full"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-fg ring-1 ring-border">
                <CalendarDays className="size-3.5 text-accent-text" aria-hidden="true" />
                {fmtDay(home.businessDate, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </span>
              {home.auditLate ? (
                <Link
                  href={`${base}/frontdesk`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 font-semibold text-danger ring-1 ring-danger/20"
                >
                  <MoonStar className="size-3.5" aria-hidden="true" />
                  {t("auditPending")}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 font-semibold text-success ring-1 ring-success/20">
                  <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                  {t("dayOpen")}
                </span>
              )}
            </p>
            <h1 className="title-ink mt-3 text-[27px] leading-tight font-extrabold sm:text-[34px]">
              {t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-fg-muted">
              {t("heroLine", {
                pct: pct(f.occupancyPct),
                arrivals: home.arrivals.length,
                departures: home.departures.length,
              })}
            </p>
          </div>
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
        </div>
      </section>

      {/* Tonight, and what needs doing */}
      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <Card className="sidebar-shade relative isolate overflow-hidden border-transparent bg-[var(--sidebar)] p-6 text-[var(--sidebar-fg)] shadow-[var(--shadow-float)] ring-1 ring-white/5">
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:var(--brass)] [--tex-opacity:0.14] [--tex-size:64px]"
          />
          <span aria-hidden="true" className="texture-grain [--grain-opacity:0.1]" />
          <div className="relative flex items-center gap-5">
            <OccupancyRing pct={f.occupancyPct} label={pct(f.occupancyPct)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium opacity-75">{t("tonight")}</p>
              <p className="mt-1 text-[15px] leading-6 font-semibold">
                {t("roomsSold", { sold: f.sold, rooms: f.rooms })}
              </p>
            </div>
          </div>
          <dl className="relative mt-4 grid grid-cols-3 gap-2">
            <Figure label={t("adr")} value={money(f.adrCents)} />
            <Figure label={t("revpar")} value={money(f.revparCents)} />
            <Figure label={t("guests")} value={String(f.guests)} />
          </dl>
          <div className="relative mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-xs font-semibold opacity-80">
                {t("next14", { pct: pct(home.aheadTotals.occupancyPct) })}
              </p>
              <span className="flex items-center gap-1.5 text-[11px] opacity-70">
                <span className="size-2 rounded-sm bg-[var(--brass)]" aria-hidden="true" />
                {t("tonight")}
              </span>
            </div>
            <div className="mt-3 flex h-24 items-end gap-1 sm:h-32 sm:gap-1.5">
              {home.ahead.map((d, i) => (
                <div
                  key={d.day}
                  className="group/bar flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                >
                  <span className="text-[10px] font-semibold tabular-nums opacity-0 transition-opacity group-hover/bar:opacity-90">
                    {pct(d.occupancyPct)}
                  </span>
                  <div
                    className={cn(
                      "w-full rounded-t-md rounded-b-sm transition-[filter] group-hover/bar:brightness-125",
                      i === 0
                        ? "bg-[var(--brass)] bg-[image:var(--brass-gradient)]"
                        : "shade-sky shade-bar opacity-85",
                    )}
                    style={{ height: `${Math.max(6, (d.occupancyPct / maxAhead) * 78)}%` }}
                    title={`${fmtDay(d.day, { weekday: "long", day: "numeric", month: "long" })} · ${pct(d.occupancyPct)} · ${d.sold}/${d.rooms}`}
                  />
                  <span
                    className={cn(
                      "text-[10px] tabular-nums",
                      i === 0
                        ? "font-bold text-[var(--brass)]"
                        : weekend(d.day)
                          ? "font-semibold opacity-95"
                          : "opacity-60",
                    )}
                  >
                    {fmtDay(d.day, { day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHeader
            title={t("attention")}
            action={
              alerts.length ? (
                <span className="k-cut k-sm grid h-6 min-w-6 place-items-center bg-danger px-1.5 text-xs font-bold text-white tabular-nums">
                  {alerts.length}
                </span>
              ) : undefined
            }
          />
          {alerts.length ? (
            <ul className="flex-1 divide-y divide-border">
              {alerts.map(({ href, label, Icon, tone }) => (
                <li key={label}>
                  <Link href={href} className="row-hover group flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-[18px]",
                        tone,
                      )}
                    >
                      <Icon aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm leading-5 font-semibold">{label}</span>
                    <ArrowRight
                      className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Check />} text={t("allClear")} />
          )}
        </Card>
      </section>

      {/* The day's key figures, each with how far along it is */}
      <section className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiTile
          href={`${base}/frontdesk`}
          shade="shade-azure"
          icon={<LogIn />}
          label={t("arrivals")}
          value={home.arrivals.length}
          hint={t("precheckins", { n: home.precheckins })}
          progress={share(home.precheckins, home.arrivals.length)}
        />
        <KpiTile
          href={`${base}/frontdesk`}
          shade="shade-periwinkle"
          icon={<LogOut />}
          label={t("departures")}
          value={home.departures.length}
          hint={t("settledN", { n: settled })}
          progress={share(settled, home.departures.length)}
        />
        <KpiTile
          href={`${base}/stays`}
          shade="shade-cyan"
          icon={<Users />}
          label={t("inHouse")}
          value={home.inHouse}
          hint={t("guestsN", { n: f.guests })}
          progress={f.occupancyPct}
        />
        <KpiTile
          href={can(ctx, "tables.view") ? `${base}/rooms` : null}
          shade="shade-royal"
          icon={<SprayCan />}
          label={t("toClean")}
          value={toClean}
          hint={
            home.rooms.outOfOrder
              ? t("outOfOrder", { n: home.rooms.outOfOrder })
              : t("readyRooms", { n: ready })
          }
          progress={share(ready, home.rooms.total)}
        />
      </section>

      {/* Quick access */}
      <nav aria-label={t("quickTitle")} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {quick
          .filter((q) => q.show)
          .map(({ href, label, Icon }, i) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-soft)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--shade)] hover:shadow-[var(--shadow-card)]",
                SHADES[i % SHADES.length],
              )}
            >
              <span className="shade-fill k-cut grid size-10 shrink-0 place-items-center transition-transform duration-200 group-hover:scale-105">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{label}</span>
              <ArrowRight
                className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 ltr:rotate-180"
                aria-hidden="true"
              />
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
                  "k-cut k-sm px-2.5 py-1 text-xs font-semibold",
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
              <span className="k-cut k-sm bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-text tabular-nums">
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
            title={
              <span className="flex items-center gap-2">
                {t("arrivalsTitle")}
                <CountChip n={home.arrivals.length} />
              </span>
            }
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
            title={
              <span className="flex items-center gap-2">
                {t("departuresTitle")}
                <CountChip n={home.departures.length} />
              </span>
            }
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
                        "k-cut k-sm shrink-0 px-2 py-0.5 text-xs font-bold tabular-nums",
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
              {home.departments.map((d, i) => (
                <div key={d.department} className={SHADES[i % SHADES.length]}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="size-2.5 rounded-[3px] bg-[var(--shade)]" aria-hidden="true" />
                      {tDept.has(d.department as "room") ? tDept(d.department as "room") : d.department}
                    </span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-xs text-fg-subtle">
                        {pct((d.cents / Math.max(1, home.revenueCents)) * 100)}
                      </span>
                      <span className="font-semibold">{money(d.cents)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="shade-bar h-full rounded-full"
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
            <dl className="grid grid-cols-2 gap-3 p-5">
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
    <div className="min-w-0 rounded-xl bg-white/[0.06] px-3 py-2 ring-1 ring-white/10">
      <dt className="text-[11px] opacity-70">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-bold break-words tabular-nums sm:text-[15px]">{value}</dd>
    </div>
  );
}

/** Tonight's occupancy as a brass ring, the figure in its middle. */
function OccupancyRing({ pct, label }: { pct: number; label: string }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-32 shrink-0 place-items-center sm:size-36" aria-hidden="true">
      <svg viewBox="0 0 108 108" className="absolute inset-0 size-full -rotate-90">
        <defs>
          <linearGradient id="occ-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brass)" stopOpacity="0.75" />
            <stop offset="1" stopColor="var(--brass)" />
          </linearGradient>
        </defs>
        <circle cx="54" cy="54" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="9" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="url(#occ-ring)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * c} ${c}`}
        />
      </svg>
      <span className="text-[2rem] leading-none font-extrabold tabular-nums sm:text-[2.3rem]">{label}</span>
    </div>
  );
}

/** A key figure of the day: its blue, an icon, the number, a line under it and how far along. */
function KpiTile({
  href,
  shade,
  icon,
  label,
  value,
  hint,
  progress,
}: {
  href: string | null;
  shade: string;
  icon: ReactNode;
  label: string;
  value: number;
  hint: string;
  progress: number;
}) {
  const body = (
    <div
      className={cn(
        "kpi group h-full p-4 transition-shadow duration-200 hover:shadow-[var(--shadow-float)] sm:p-5",
        shade,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-label text-[13px] font-semibold">{label}</p>
        <span
          className="shade-fill k-cut grid size-9 shrink-0 place-items-center [&_svg]:size-[18px]"
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <p className="kpi-value mt-1 text-[2rem] leading-none font-extrabold tabular-nums sm:text-[2.4rem]">
        {value}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <span
          className="shade-bar block h-full rounded-full"
          style={{ width: `${Math.max(2, progress)}%` }}
        />
      </div>
      <p className="mt-2 truncate text-xs text-fg-muted">{hint}</p>
    </div>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function AuditFigure({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi stat-auto px-4 pt-3.5 pb-3">
      <dt className="kpi-label">{label}</dt>
      <dd className="kpi-value mt-1 text-lg font-bold tabular-nums">{value}</dd>
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

function CountChip({ n }: { n: number }) {
  return (
    <span className="shade-soft k-cut k-sm grid h-6 min-w-6 place-items-center px-2 text-xs font-bold tabular-nums">
      {n}
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
