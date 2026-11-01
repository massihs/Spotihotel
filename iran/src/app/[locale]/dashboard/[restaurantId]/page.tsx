import {
  ConciergeBell,
  Shirt,
  AlertTriangle,
  ArrowRight,
  Blocks,
  BellRing,
  Calculator,
  CalendarClock,
  ChartColumn,
  Check,
  ChefHat,
  Clock,
  Flame,
  LayoutGrid,
  QrCode,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { hotelToday } from "@/server/modules/hotel/requests";
import { HotelOverview } from "@/components/hotel/hotel-overview";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, StatCard, TONE_TILE, type Tone } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getOverviewLive, getSetupOverview, getTodayStats } from "@/server/modules/dashboard/service";
import { countLowStock } from "@/server/modules/inventory/service";
import { countNewOrders } from "@/server/modules/orders/service";
import { can } from "@/server/tenancy";
import { getDisabledModules } from "@/server/modules/restaurants/settings";
import type { ModuleKey } from "@/lib/modules";

export default function OverviewPage({ params }: PageProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense
      fallback={
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      }
    >
      <Overview params={params} />
    </Suspense>
  );
}

/** Same chip colours as the order cards. */
const STATUS_CHIP: Record<string, string> = {
  pending_payment: "bg-surface-2 text-fg-muted",
  received: "bg-accent-soft text-accent-text",
  accepted: "bg-warning-soft text-fg",
  preparing: "bg-warning-soft text-fg",
  ready: "bg-success-soft text-success",
};

const minutesSince = (d: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 60_000));

/** "12 min", "3 h", "2 d" in the locale's narrow units: an order forgotten overnight stays readable. */
function waited(min: number, locale: string) {
  const [n, unit] =
    min < 60
      ? [min, "minute"]
      : min < 1440
        ? [Math.floor(min / 60), "hour"]
        : [Math.floor(min / 1440), "day"];
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "narrow" }).format(n);
}

async function Overview({ params }: { params: PageProps<"/[locale]/dashboard/[restaurantId]">["params"] }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  // Each job lands on its own screen: the kitchen and bar on their tickets, the till on the
  // orders to accept, waiters on the floor.
  // In a hotel the front desk and housekeeping start on the rooms' requests.
  const home = (
    ctx.restaurant.kind === "hotel"
      ? { kitchen: "kitchen", bar: "kitchen", cashier: "requests", waiter: "requests" }
      : { kitchen: "kitchen", bar: "kitchen", cashier: "orders", waiter: "waiter" }
  )[ctx.job ?? ""];
  if (home) redirect({ href: `/dashboard/${ctx.restaurant.id}/${home}`, locale: await getLocale() });
  const [t, tStatus, tRes, locale, overview, today, live, lowStock, newOrders, disabled] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("orderStatus"),
    getTranslations("reservations.status"),
    getLocale(),
    getSetupOverview(db, ctx),
    getTodayStats(db, ctx),
    getOverviewLive(db, ctx),
    countLowStock(db, ctx),
    countNewOrders(db, ctx),
    getDisabledModules(db, ctx),
  ]);
  const hotel = ctx.restaurant.kind === "hotel" && can(ctx, "orders.view") ? await hotelToday(db, ctx) : null;
  const tz = ctx.restaurant.timezone;
  const money = (c: number) => formatMoney(c, ctx.restaurant.currency, locale);
  const base = `/dashboard/${ctx.restaurant.id}`;
  const on = (m: ModuleKey) => !disabled.includes(m);
  const now = today.asOf;
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const steps = [
    { key: "profile", done: overview.profileComplete, href: `${base}/settings#profile` },
    { key: "logo", done: overview.hasLogo, href: `${base}/settings#profile` },
    // An empty menu starts from the spreadsheet import: the fastest way in.
    {
      key: "menu",
      done: overview.products > 0,
      href: overview.products > 0 ? `${base}/menu` : `${base}/menu/import`,
    },
    { key: "tables", done: overview.tables > 0, href: `${base}/tables` },
    { key: "payments", done: overview.paymentsReady, href: `${base}/settings#payments` },
    { key: "firstOrder", done: overview.hasOrders, href: `${base}/tables` },
  ] as const;
  const doneCount = steps.filter((s) => s.done).length;

  // Last 7 days, oldest first, zero-filled; plus the same weekday last week for the trend chip.
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const centsOn = (key: string) => today.revenueByDay.find((r) => r.day === key)?.cents ?? 0;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 86_400_000);
    const key = dayKey(d);
    return {
      key,
      label: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: tz }).format(d),
      cents: centsOn(key),
    };
  });
  const max = Math.max(1, ...days.map((d) => d.cents));
  const lastWeek = centsOn(dayKey(new Date(now.getTime() - 7 * 86_400_000)));
  // No trend before the first sale of the day: "-100 %" at opening time says nothing.
  const delta =
    lastWeek > 0 && today.revenueTodayCents > 0
      ? Math.round(((today.revenueTodayCents - lastWeek) / lastWeek) * 100)
      : null;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: tz }).format(now);
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(now);

  // A hotel books rooms elsewhere: table bookings stay in its restaurant pages, off its home.
  const showReservations = !hotel && on("reservations") && can(ctx, "orders.view");
  const alerts = [
    hotel &&
      hotel.open > 0 && {
        href: `${base}/requests`,
        label: t("hotel.alertOpen", { n: hotel.open }),
        Icon: ConciergeBell,
        className: "bg-danger text-white",
      },
    newOrders > 0 && {
      href: `${base}/orders`,
      label: t("alerts.newOrders", { n: newOrders }),
      Icon: BellRing,
      className: "bg-danger text-white",
    },
    showReservations &&
      live.pendingBookings > 0 && {
        href: `${base}/reservations`,
        label: t("alerts.pendingBookings", { n: live.pendingBookings }),
        Icon: CalendarClock,
        className: "bg-tone-fuchsia/12 text-tone-fuchsia",
      },
    on("inventory") &&
      lowStock > 0 && {
        href: `${base}/inventory`,
        label: t("alerts.lowStock", { n: lowStock }),
        Icon: AlertTriangle,
        className: "bg-warning-soft text-warning",
      },
    live.unpaidCents > 0 && {
      href: `${base}/orders`,
      label: t("alerts.unpaid", { amount: money(live.unpaidCents) }),
      Icon: Wallet,
      className: "bg-surface-2 text-fg",
    },
  ].filter((x) => !!x);

  const quick = [
    hotel && {
      href: `${base}/requests`,
      label: t("hotel.requests"),
      Icon: ConciergeBell,
      tone: "orange" as Tone,
    },
    hotel &&
      can(ctx, "members.manage") && {
        href: `${base}/requests?tab=services`,
        label: t("hotel.services"),
        Icon: Shirt,
        tone: "violet" as Tone,
      },
    on("pos") &&
      can(ctx, "orders.create") && {
        href: `${base}/pos`,
        label: t("quickActions.pos"),
        Icon: Calculator,
        tone: "emerald" as Tone,
      },
    on("kitchen") &&
      can(ctx, "orders.view") && {
        href: `${base}/kitchen`,
        label: t("quickActions.kitchen"),
        Icon: ChefHat,
        tone: "orange" as Tone,
      },
    !hotel &&
      on("floor") &&
      can(ctx, "tables.view") && {
        href: `${base}/floor`,
        label: t("quickActions.floor"),
        Icon: LayoutGrid,
        tone: "teal" as Tone,
      },
    showReservations && {
      href: `${base}/reservations`,
      label: t("quickActions.reservations"),
      Icon: CalendarClock,
      tone: "fuchsia" as Tone,
    },
    can(ctx, "menu.view") && {
      href: `${base}/menu`,
      label: t("quickActions.menu"),
      Icon: UtensilsCrossed,
      tone: "rose" as Tone,
    },
    can(ctx, "tables.view") && {
      href: `${base}/tables`,
      label: t("quickActions.qr"),
      Icon: QrCode,
      tone: "sky" as Tone,
    },
    can(ctx, "accounting.manage") && {
      href: `${base}/reports`,
      label: t("quickActions.reports"),
      Icon: ChartColumn,
      tone: "indigo" as Tone,
    },
    can(ctx, "restaurant.manage") && {
      href: `${base}/settings#modules`,
      label: t("quickActions.modules"),
      Icon: Blocks,
      tone: "amber" as Tone,
    },
  ].filter((x) => !!x);

  const seeAll = (href: string) => (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text hover:underline"
    >
      {t("seeAll")}
      <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden="true" />
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t("welcome", { name: ctx.user.fullName.split(" ")[0] ?? "" })}
        description={<span className="first-letter:uppercase">{dateLabel}</span>}
        actions={
          hotel ? (
            <Link href={`${base}/requests`} className={buttonClasses("primary")}>
              <ConciergeBell className="size-4" aria-hidden="true" />
              {t("hotel.requests")}
            </Link>
          ) : on("pos") && can(ctx, "orders.create") ? (
            <Link href={`${base}/pos`} className={buttonClasses("primary")}>
              <Calculator className="size-4" aria-hidden="true" />
              {t("quickActions.pos")}
            </Link>
          ) : null
        }
      />

      {alerts.length ? (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {alerts.map(({ href, label, Icon, className }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-85",
                className,
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      {hotel ? (
        <HotelOverview ctx={ctx} today={hotel} money={money} asOf={now} />
      ) : (
        <>
          {/* Today */}
          <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card
              className="overflow-hidden border-transparent p-6 text-white shadow-accent"
              style={{ background: "var(--brand-gradient)" }}
            >
              <div
                className="pointer-events-none absolute -end-16 -top-20 size-64 rounded-full bg-white/10"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute start-1/3 -bottom-24 size-56 rounded-full bg-white/[0.06]"
                aria-hidden="true"
              />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium opacity-80">{t("revenueToday")}</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
                    {money(today.revenueTodayCents)}
                  </p>
                  {delta !== null ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/18 px-2.5 py-1 text-xs font-semibold">
                      {delta >= 0 ? (
                        <TrendingUp className="size-3.5" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-3.5" aria-hidden="true" />
                      )}
                      <bdi dir="ltr" className="tabular-nums">
                        {delta > 0 ? "+" : ""}
                        {delta}%
                      </bdi>
                      <span className="opacity-85">{t("vsLastWeek", { day: weekday })}</span>
                    </p>
                  ) : null}
                </div>
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/18"
                  aria-hidden="true"
                >
                  <Wallet className="size-5" />
                </span>
              </div>
              <div className="relative mt-5 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <p>
                  <span className="opacity-75">{t("averageTicket")} </span>
                  <span className="font-bold tabular-nums">{money(today.averageTicketCents)}</span>
                </p>
                <p className="font-semibold opacity-90">{t("ordersN", { n: today.ordersToday })}</p>
              </div>
              <div className="relative mt-5">
                <p className="text-xs font-medium opacity-75">{t("last7")}</p>
                <div className="mt-3 flex h-16 items-end gap-2 sm:h-28">
                  {days.map((d, i) => (
                    <div
                      key={d.key}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1.5"
                    >
                      <div
                        className={cn(
                          "w-full rounded-lg transition-colors",
                          i === 6 ? "bg-white" : "bg-white/30 group-hover:bg-white/50",
                        )}
                        style={{ height: `${Math.max(8, (d.cents / max) * 75)}%` }}
                        title={money(d.cents)}
                      />
                      <span className={cn("text-[10px]", i === 6 ? "font-bold" : "opacity-75")}>
                        {d.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-4">
              <KpiLink href={can(ctx, "orders.view") ? `${base}/orders` : null}>
                <StatCard
                  label={t("ordersToday")}
                  value={today.ordersToday}
                  icon={<ReceiptText />}
                  tone="sky"
                />
              </KpiLink>
              <KpiLink href={on("kitchen") && can(ctx, "orders.view") ? `${base}/kitchen` : null}>
                <StatCard label={t("inKitchen")} value={today.inKitchen} icon={<ChefHat />} tone="orange" />
              </KpiLink>
              <KpiLink href={on("floor") && can(ctx, "tables.view") ? `${base}/floor` : null}>
                <StatCard
                  label={t("openTables")}
                  value={
                    <>
                      {today.openTables}
                      <span className="text-base font-medium text-fg-subtle"> / {overview.tables}</span>
                    </>
                  }
                  icon={<LayoutGrid />}
                  tone="teal"
                />
              </KpiLink>
              {showReservations ? (
                <KpiLink href={`${base}/reservations`}>
                  <StatCard
                    label={t("reservationsToday")}
                    value={live.bookingsToday}
                    hint={t("coversN", { n: live.coversToday })}
                    icon={<CalendarClock />}
                    tone="fuchsia"
                  />
                </KpiLink>
              ) : (
                <StatCard
                  label={t("stats.products")}
                  value={overview.products}
                  icon={<UtensilsCrossed />}
                  tone="rose"
                />
              )}
            </div>
          </section>
        </>
      )}

      {/* Quick access: an app-launcher row */}
      <nav aria-label={t("quick")} className="mt-4 grid grid-cols-4 gap-2 sm:gap-3 lg:grid-cols-8">
        {quick.map(({ href, label, Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-1.5 py-3 text-center shadow-[var(--shadow-soft)] transition-colors hover:border-accent/40 hover:bg-accent-soft/40"
          >
            <span
              className={cn(
                "grid size-11 place-items-center rounded-2xl transition-transform group-hover:scale-105",
                TONE_TILE[tone],
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="line-clamp-2 text-xs leading-tight font-semibold sm:text-[13px]">{label}</span>
          </Link>
        ))}
      </nav>

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
          <ol className="grid gap-1 p-3 sm:grid-cols-2 xl:grid-cols-3">
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

      <Suspense fallback={null}>
        <KpiCard ctx={ctx} canManage={can(ctx, "restaurant.manage")} />
      </Suspense>

      <div className={cn("mt-4 grid gap-4", showReservations ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
        {/* Live orders, oldest first: what the team should look at next */}
        {can(ctx, "orders.view") ? (
          <Card className="flex flex-col">
            <CardHeader title={t("liveOrders")} action={seeAll(`${base}/orders`)} />
            {live.active.length ? (
              <ul className="divide-y divide-border">
                {live.active.map((o) => {
                  const min = minutesSince(o.placedAt, now);
                  const late = o.status !== "ready" && min >= 20;
                  const warn = o.status !== "ready" && min >= 10;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`${base}/orders`}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-accent-soft px-1 font-bold text-accent-text tabular-nums",
                            (o.tableLabel?.length ?? 0) > 3 ? "text-[10px] break-all" : "text-sm",
                          )}
                          aria-hidden="true"
                        >
                          {o.tableLabel ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <bdi dir="ltr" className="font-bold tabular-nums">
                              #{o.number}
                            </bdi>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-bold",
                                STATUS_CHIP[o.status],
                              )}
                            >
                              {tStatus(o.status)}
                            </span>
                          </span>
                          <span className="block text-xs text-fg-muted tabular-nums">
                            {money(o.totalCents)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                            late
                              ? "bg-danger text-white"
                              : warn
                                ? "bg-warning-soft text-warning"
                                : "bg-surface-2 text-fg-muted",
                          )}
                        >
                          <Clock className="size-3" aria-hidden="true" />
                          {waited(min, locale)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty icon={<ReceiptText />} text={t("noLiveOrders")} />
            )}
          </Card>
        ) : null}

        {showReservations ? (
          <Card className="flex flex-col">
            <CardHeader title={t("nextBookings")} action={seeAll(`${base}/reservations`)} />
            {live.bookings.length ? (
              <ul className="divide-y divide-border">
                {live.bookings.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-14 shrink-0 text-sm font-bold tabular-nums">
                      <bdi dir="ltr">{time.format(b.startsAt)}</bdi>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{b.name}</span>
                      <span className="block text-xs text-fg-muted">{t("partyN", { n: b.partySize })}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                        b.status === "pending"
                          ? "bg-warning-soft text-warning"
                          : "bg-tone-fuchsia/12 text-tone-fuchsia",
                      )}
                    >
                      {tRes(b.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<CalendarClock />} text={t("noBookingsToday")} />
            )}
          </Card>
        ) : null}

        <Card className="flex flex-col">
          <CardHeader
            title={t("topProducts")}
            action={can(ctx, "accounting.manage") ? seeAll(`${base}/reports?tab=products`) : undefined}
          />
          {live.top.length ? (
            <ol className="space-y-3 p-5">
              {live.top.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-black tabular-nums",
                      i === 0 ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {i === 0 ? <Flame className="size-4" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{p.name}</span>
                      <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                        {t("soldN", { n: p.quantity })}
                      </span>
                    </span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${(p.quantity / live.top[0]!.quantity) * 100}%` }}
                      />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty icon={<Flame />} text={t("noSales")} />
          )}
        </Card>
      </div>
    </>
  );
}

function KpiLink({ href, children }: { href: string | null; children: ReactNode }) {
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
