import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { FileDown } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { getMoney } from "@/lib/money-server";
import { calendarLocale, formatCalendarDate, jalaliYearStart } from "@/lib/jalali-calendar";
import { localDay } from "@/lib/period";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isDay } from "@/server/modules/pms/calc";
import { DeskActions, DeskTable, KeyValues, PeriodForm } from "@/components/pms/desk-table";
import { BarChart } from "@/components/pms/bar-chart";
import { addDays } from "@/server/modules/pms/calc";
import {
  DESK_TABLES,
  chartSeries,
  comprehensive,
  type Cell,
  type DeskTableKey,
} from "@/server/modules/pms/desk-reports";
import {
  defaultPeriod,
  lastClosedDay,
  managerReport,
  occupancyHistory,
  revenueBySegment,
} from "@/server/modules/pms/reports";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/hotel-reports">;
const TABS = [
  "manager",
  "comprehensive",
  "occupancy",
  "dailySales",
  "charts",
  "accounts",
  "accountPerformance",
  "plans",
  "segments",
  "bank",
  "invoices",
  "expected",
  "individual",
  "pax",
  "openFolios",
  "debtors",
  "roomCharge",
] as const;
/** Tabs drawn from the front office tables (same screen, print and CSV as the desk's lists). */
const DESK: Partial<Record<(typeof TABS)[number], DeskTableKey>> = {
  dailySales: "dailySales",
  accounts: "creditAccounts",
  accountPerformance: "accountPerformance",
  plans: "planSales",
  bank: "bankReport",
  invoices: "stayInvoiceList",
  expected: "expectedGuests",
  individual: "individualGuests",
  pax: "paxSales",
  openFolios: "openFolios",
  debtors: "inHouseDebtors",
  roomCharge: "roomCharges",
};

export default function HotelReportsPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <HotelReports {...props} />
    </Suspense>
  );
}

/** The hotel's standard reports, to read, print or export. */
async function HotelReports({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "analytics.view");
  const tab = TABS.find((x) => x === sp.tab) ?? "manager";
  const [t, tDept, tSource, tPay, locale, money] = await Promise.all([
    getTranslations("hotelReports"),
    getTranslations("pms.dept"),
    getTranslations("pms.source"),
    getTranslations("pms.method"),
    getLocale(),
    getMoney(ctx.restaurant.currency),
  ]);
  const rid = ctx.restaurant.id;
  const today = localDay(new Date(), ctx.restaurant.timezone);
  const last = await lastClosedDay(db, rid);
  const period = defaultPeriod(last, today);
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  // Expected guests look ahead; the other reports look back over closed days.
  const ahead = tab === "expected";
  const from = isDay(str(sp.from)) ? str(sp.from) : ahead ? today : period.from;
  const to = isDay(str(sp.to)) ? str(sp.to) : ahead ? addDays(today, 30) : period.to;
  const q = str(sp.q);
  const deskKey = DESK[tab];
  const legacy = tab === "manager" || tab === "occupancy" || tab === "segments";
  const day = isDay(str(sp.day)) ? str(sp.day) : (last ?? today);
  const fmt = (
    d: string,
    opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
  ) =>
    formatCalendarDate(
      new Intl.DateTimeFormat(calendarLocale(locale, EDITION), { ...opts, timeZone: "UTC" }),
      new Date(`${d}T12:00:00Z`),
    );
  const label = (tr: typeof tDept, k: string | null) =>
    k && tr.has(k as "room") ? tr(k as "room") : (k ?? "—");
  const base = `/dashboard/${rid}/hotel-reports`;
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          deskKey ? (
            <DeskActions
              csv={`/dashboard/${rid}/desk-export?report=${deskKey}&from=${from}&to=${to}&q=${encodeURIComponent(q)}`}
            />
          ) : !legacy ? (
            <DeskActions />
          ) : (
            <div className="flex flex-wrap gap-2 print:hidden">
              {tab !== "manager" ? (
                <a
                  href={`${prefix}${base}/export?report=${tab}&from=${from}&to=${to}`}
                  className={buttonClasses("secondary", "md")}
                >
                  <FileDown className="size-4" aria-hidden="true" />
                  {t("csv")}
                </a>
              ) : null}
              <PrintButton label={t("print")} />
            </div>
          )
        }
      />
      <nav className="seg mb-5 print:hidden" aria-label={t("title")}>
        {TABS.map((x) => (
          <Link
            key={x}
            href={`${base}?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className="seg-item"
          >
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      {!legacy ? (
        <PeriodForm
          base={base}
          tab={tab}
          from={from}
          to={to}
          q={q}
          search={["accounts", "expected", "openFolios", "debtors"].includes(tab)}
          period={!["accounts", "openFolios", "debtors"].includes(tab)}
        />
      ) : (
        <form className="mb-5 flex flex-wrap items-end gap-3 print:hidden" action={`${prefix}${base}`}>
          <input type="hidden" name="tab" value={tab} />
          {tab === "manager" ? (
            <label className="text-sm">
              <span className="mb-1 block text-fg-muted">{t("day")}</span>
              <span className="block w-60">
                <DateInput name="day" defaultValue={day} required aria-label={t("day")} />
              </span>
            </label>
          ) : (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-fg-muted">{t("from")}</span>
                <span className="block w-60">
                  <DateInput name="from" defaultValue={from} required aria-label={t("from")} />
                </span>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-fg-muted">{t("to")}</span>
                <span className="block w-60">
                  <DateInput name="to" defaultValue={to} required aria-label={t("to")} />
                </span>
              </label>
            </>
          )}
          <button type="submit" className={buttonClasses("primary", "md")}>
            {t("show")}
          </button>
        </form>
      )}

      {deskKey ? (
        <DeskTable
          table={await DESK_TABLES[deskKey](db, ctx, { from, to, q })}
          currency={ctx.restaurant.currency}
          limit={sp.all ? 100_000 : 400}
          allHref={`${base}?tab=${tab}&from=${from}&to=${to}&q=${encodeURIComponent(q)}&all=1`}
          links={{
            number: (row: Record<string, Cell>) => (row.id ? `/dashboard/${rid}/stays/${row.id}` : null),
            invoice: (row: Record<string, Cell>) => (row.link ? String(row.link) : null),
          }}
        />
      ) : tab === "charts" ? (
        await (async () => {
          const series = await chartSeries(db, ctx, { from, to });
          return (
            <div className="grid gap-4">
              <BarChart
                title={t("chart.occupancy")}
                points={series.map((x) => ({
                  label: fmt(x.day, { day: "numeric", month: "short" }),
                  value: x.occupancy,
                }))}
                format={(v) => `${v}%`}
                max={100}
                empty={t("none")}
              />
              <BarChart
                title={t("chart.revenue")}
                points={series.map((x) => ({
                  label: fmt(x.day, { day: "numeric", month: "short" }),
                  value: x.roomCents + x.otherCents,
                  part: x.roomCents,
                }))}
                format={(v) => money(v)}
                legend={[t("chart.room"), t("chart.other")]}
                empty={t("none")}
              />
              <BarChart
                title={t("chart.adr")}
                points={series.map((x) => ({
                  label: fmt(x.day, { day: "numeric", month: "short" }),
                  value: x.adrCents,
                }))}
                format={(v) => money(v)}
                empty={t("none")}
              />
            </div>
          );
        })()
      ) : tab === "comprehensive" ? (
        await (async () => {
          const c = await comprehensive(db, ctx, { from, to });
          const f = c.figures;
          return (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {t("comprehensiveOf", { from: fmt(from), to: fmt(to), days: c.days })}
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <KeyValues
                  title={t("figures")}
                  rows={[
                    [t("rows.roomsAvailable"), String(f.roomsAvailable)],
                    [t("rows.roomsSold"), String(f.roomsSold)],
                    [t("rows.occupancy"), `${f.occupancyPct}%`],
                    [t("rows.adr"), money(f.adrCents)],
                    [t("rows.revpar"), money(f.revparCents)],
                    [t("rows.trevpar"), money(f.trevparCents)],
                    [t("rows.roomRevenue"), money(f.roomRevenueCents)],
                    [t("rows.totalRevenue"), money(f.totalRevenueCents)],
                    [t("rows.guestNights"), String(f.guestNights)],
                  ]}
                />
                <KeyValues
                  title={t("revenueByDept")}
                  rows={c.revenue.map(([k, v]) => [label(tDept, k), money(v)] as [string, string])}
                />
                <KeyValues
                  title={t("paymentsByMethod")}
                  rows={c.payments.map(([k, v]) => [label(tPay, k), money(v)] as [string, string])}
                />
                <KeyValues
                  title={t("movements")}
                  rows={[
                    [t("mv.arrivals"), String(c.movements.arrivals)],
                    [t("mv.departures"), String(c.movements.departures)],
                    [t("mv.noShows"), String(c.movements.noShows)],
                    [t("mv.cancellations"), String(c.movements.cancellations)],
                    [t("mv.booked"), String(c.movements.booked)],
                  ]}
                />
                <KeyValues
                  title={t("outstanding")}
                  rows={[
                    [t("out.inHouse"), money(c.outstanding.inHouse)],
                    [t("out.cityLedger"), money(c.outstanding.cityLedger)],
                    [t("out.departed"), money(c.outstanding.departed)],
                  ]}
                />
              </div>
            </div>
          );
        })()
      ) : tab === "manager" ? (
        await (async () => {
          const r = await managerReport(
            db,
            ctx,
            day,
            EDITION === "iran" ? jalaliYearStart(day) : `${day.slice(0, 4)}-01-01`,
          );
          const cols = [
            { key: "today", label: t("today"), v: r.today },
            { key: "mtd", label: t("mtd"), v: r.mtd },
            { key: "ytd", label: t("ytd"), v: r.ytd },
          ];
          return (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {t("managerOf", {
                  day: fmt(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
                })}
                {r.closed ? "" : ` · ${t("notClosed")}`}
              </p>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
                    <tr>
                      <th className="px-4 py-2.5 text-start font-medium" />
                      {cols.map((c) => (
                        <th key={c.key} className="px-4 py-2.5 text-end font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {(
                      [
                        ["roomsAvailable", (v: (typeof cols)[number]["v"]) => String(v.rooms)],
                        ["roomsSold", (v: (typeof cols)[number]["v"]) => String(v.sold)],
                        ["occupancy", (v: (typeof cols)[number]["v"]) => `${v.occupancyPct}%`],
                        ["adr", (v: (typeof cols)[number]["v"]) => money(v.adrCents)],
                        ["revpar", (v: (typeof cols)[number]["v"]) => money(v.revparCents)],
                        ["roomRevenue", (v: (typeof cols)[number]["v"]) => money(v.roomCents)],
                        ["totalRevenue", (v: (typeof cols)[number]["v"]) => money(v.totalCents)],
                      ] as const
                    ).map(([k, f]) => (
                      <tr key={k}>
                        <th className="px-4 py-2.5 text-start font-medium">{t(`rows.${k}`)}</th>
                        {cols.map((c) => (
                          <td key={c.key} className="px-4 py-2.5 text-end">
                            {f(c.v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="grid gap-4 md:grid-cols-3">
                <ReportList
                  title={t("revenueByDept")}
                  rows={r.revenue.map((x) => [label(tDept, x.department), money(x.cents)])}
                  empty={t("none")}
                />
                <ReportList
                  title={t("paymentsByMethod")}
                  rows={r.payments.map((x) => [label(tPay, x.method), money(x.cents)])}
                  empty={t("none")}
                />
                <ReportList
                  title={t("movements")}
                  empty={t("none")}
                  rows={[
                    [t("mv.arrivals"), String(r.movements.arrivals)],
                    [t("mv.departures"), String(r.movements.departures)],
                    [t("mv.noShows"), String(r.movements.noShows)],
                    [t("mv.cancellations"), String(r.movements.cancellations)],
                    [t("mv.booked"), String(r.movements.booked)],
                    [t("mv.guests"), String(r.guests)],
                  ]}
                />
              </div>
            </div>
          );
        })()
      ) : tab === "occupancy" ? (
        await (async () => {
          const h = await occupancyHistory(db, ctx, from, to);
          return (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
                  <tr>
                    {(
                      [
                        "day",
                        "roomsSold",
                        "occupancy",
                        "adr",
                        "revpar",
                        "roomRevenue",
                        "totalRevenue",
                      ] as const
                    ).map((k) => (
                      <th
                        key={k}
                        className={cn("px-3 py-2.5 font-medium", k === "day" ? "text-start" : "text-end")}
                      >
                        {t(`cols.${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border tabular-nums">
                  {h.days.map((d) => (
                    <tr key={d.day}>
                      <td className="px-3 py-2">
                        {fmt(d.day, { weekday: "short", day: "numeric", month: "short" })}
                      </td>
                      <td className="px-3 py-2 text-end">
                        {d.sold} / {d.rooms}
                      </td>
                      <td className="px-3 py-2 text-end">{d.occupancyPct}%</td>
                      <td className="px-3 py-2 text-end">{money(d.adrCents)}</td>
                      <td className="px-3 py-2 text-end">{money(d.revparCents)}</td>
                      <td className="px-3 py-2 text-end">{money(d.roomCents)}</td>
                      <td className="px-3 py-2 text-end">{money(d.totalCents)}</td>
                    </tr>
                  ))}
                  {!h.days.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-fg-muted">
                        {t("noDays")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot className="border-t-2 border-border font-semibold tabular-nums">
                  <tr>
                    <td className="px-3 py-2.5">{t("total")}</td>
                    <td className="px-3 py-2.5 text-end">
                      {h.totals.sold} / {h.totals.rooms}
                    </td>
                    <td className="px-3 py-2.5 text-end">{h.totals.occupancyPct}%</td>
                    <td className="px-3 py-2.5 text-end">{money(h.totals.adrCents)}</td>
                    <td className="px-3 py-2.5 text-end">{money(h.totals.revparCents)}</td>
                    <td className="px-3 py-2.5 text-end">{money(h.totals.roomCents)}</td>
                    <td className="px-3 py-2.5 text-end">{money(h.totals.totalCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          );
        })()
      ) : (
        await (async () => {
          const s = await revenueBySegment(db, ctx, from, to);
          return (
            <div className="space-y-4">
              <p className="text-sm text-fg-muted">
                {t("segmentsTotal", {
                  nights: s.totals.nights,
                  revenue: money(s.totals.cents),
                  adr: money(s.totals.adrCents),
                })}
              </p>
              <div className="grid gap-4 lg:grid-cols-3">
                {(
                  [
                    ["byChannel", s.bySource, (k: string) => label(tSource, k)],
                    ["byPlan", s.byPlan, (k: string) => k],
                    ["byType", s.byType, (k: string) => k],
                  ] as const
                ).map(([key, list, name]) => (
                  <Card key={key} className="overflow-x-auto">
                    <h2 className="border-b border-border px-4 py-3 font-semibold">{t(key)}</h2>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-fg-muted">
                        <tr>
                          <th className="px-4 py-2 text-start font-medium" />
                          <th className="px-2 py-2 text-end font-medium">{t("cols.nights")}</th>
                          <th className="px-2 py-2 text-end font-medium">{t("cols.adr")}</th>
                          <th className="px-4 py-2 text-end font-medium">{t("cols.roomRevenue")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border tabular-nums">
                        {list.map((r) => (
                          <tr key={r.key}>
                            <td className="px-4 py-2">
                              {name(r.key)} <span className="text-xs text-fg-muted">{r.sharePct}%</span>
                            </td>
                            <td className="px-2 py-2 text-end">{r.nights}</td>
                            <td className="px-2 py-2 text-end">{money(r.adrCents)}</td>
                            <td className="px-4 py-2 text-end">{money(r.cents)}</td>
                          </tr>
                        ))}
                        {!list.length ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-fg-muted">
                              {t("none")}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </Card>
                ))}
              </div>
            </div>
          );
        })()
      )}
    </>
  );
}

function ReportList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: (readonly [string, string])[];
  empty: string;
}) {
  return (
    <Card>
      <h2 className="border-b border-border px-4 py-3 font-semibold">{title}</h2>
      <dl className="divide-y divide-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-4 py-2">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
        {!rows.length ? <p className="px-4 py-6 text-center text-fg-muted">{empty}</p> : null}
      </dl>
    </Card>
  );
}
