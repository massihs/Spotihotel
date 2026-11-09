import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { FileDown } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { getMoney } from "@/lib/money-server";
import { calendarLocale, jalaliYearStart } from "@/lib/jalali-calendar";
import { localDay } from "@/lib/period";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isDay } from "@/server/modules/pms/calc";
import {
  defaultPeriod,
  lastClosedDay,
  managerReport,
  occupancyHistory,
  revenueBySegment,
} from "@/server/modules/pms/reports";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/hotel-reports">;
const TABS = ["manager", "occupancy", "segments"] as const;

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
  const from = isDay(str(sp.from)) ? str(sp.from) : period.from;
  const to = isDay(str(sp.to)) ? str(sp.to) : period.to;
  const day = isDay(str(sp.day)) ? str(sp.day) : (last ?? today);
  const fmt = (
    d: string,
    opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
  ) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), { ...opts, timeZone: "UTC" }).format(
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
        }
      />
      <nav className="mb-4 flex flex-wrap gap-1.5 print:hidden" aria-label={t("title")}>
        {TABS.map((x) => (
          <Link
            key={x}
            href={`${base}?tab=${x}`}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold ring-1",
              x === tab ? "bg-brand-700 text-white ring-brand-700" : "bg-surface text-fg-muted ring-border",
            )}
          >
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      <form className="mb-5 flex flex-wrap items-end gap-3 print:hidden" action={`${prefix}${base}`}>
        <input type="hidden" name="tab" value={tab} />
        {tab === "manager" ? (
          <label className="text-sm">
            <span className="mb-1 block text-fg-muted">{t("day")}</span>
            <input
              type="date"
              name="day"
              defaultValue={day}
              className="h-10 rounded-xl border border-border bg-surface px-3"
            />
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-fg-muted">{t("from")}</span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="h-10 rounded-xl border border-border bg-surface px-3"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-fg-muted">{t("to")}</span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="h-10 rounded-xl border border-border bg-surface px-3"
              />
            </label>
          </>
        )}
        <button type="submit" className={buttonClasses("primary", "md")}>
          {t("show")}
        </button>
      </form>

      {tab === "manager"
        ? await (async () => {
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
        : tab === "occupancy"
          ? await (async () => {
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
          : await (async () => {
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
            })()}
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
