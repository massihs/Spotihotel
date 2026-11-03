import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BedDouble, CalendarRange, Gauge, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getMoney } from "@/lib/money-server";
import { channelMix, forecast } from "@/server/modules/pms/revenue";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { addDays } from "@/server/modules/pms/calc";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/forecast">;

export default function ForecastPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Forecast params={params} />
    </Suspense>
  );
}

const th = "px-3 py-2.5 text-start text-xs font-semibold text-fg-muted";
const thEnd = "px-3 py-2.5 text-end text-xs font-semibold text-fg-muted";
const tdNum = "px-3 py-2 text-end tabular-nums";

/** Revenue management: the coming nights on the books, and where the business comes from. */
async function Forecast({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const locale = await getLocale();
  const { businessDate: today } = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const [t, tSrc, money, fc, past, ahead] = await Promise.all([
    getTranslations("pms.forecast"),
    getTranslations("pms.source"),
    getMoney(ctx.restaurant.currency),
    forecast(db, ctx, today, 30),
    channelMix(db, ctx, addDays(today, -30), addDays(today, -1)),
    channelMix(db, ctx, today, addDays(today, 60)),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const mix = (title: string, m: typeof past) => (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[560px] text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("channel")}</th>
              <th className={thEnd}>{t("bookings")}</th>
              <th className={thEnd}>{t("roomNights")}</th>
              <th className={thEnd}>{t("revenue")}</th>
              <th className={thEnd}>{t("adr")}</th>
              <th className={thEnd}>{t("share")}</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.source}>
                <td className="px-3 py-2 font-semibold">{tSrc.has(r.source) ? tSrc(r.source) : r.source}</td>
                <td className={tdNum}>{r.bookings}</td>
                <td className={tdNum}>{r.nights}</td>
                <td className={tdNum}>{money(r.revenue)}</td>
                <td className={tdNum}>{money(r.adrCents)}</td>
                <td className={tdNum}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full bg-accent" style={{ width: `${r.sharePct}%` }} />
                    </span>
                    {r.sharePct}%
                  </span>
                </td>
              </tr>
            ))}
            {!m.rows.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-fg-muted">
                  {t("none")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("otbOccupancy")}
          value={`${fc.totals.occupancyPct}%`}
          icon={<Gauge />}
          tone="ink"
        />
        <StatCard
          label={t("otbRevenue")}
          value={money(fc.totals.revenueCents)}
          icon={<TrendingUp />}
          tone="indigo"
        />
        <StatCard label={t("adr")} value={money(fc.totals.adrCents)} icon={<BedDouble />} tone="teal" />
        <StatCard label={t("roomNights")} value={fc.totals.sold} icon={<CalendarRange />} tone="amber" />
      </div>
      <div className="mb-6 overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[820px] text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
          <thead className="bg-surface-2">
            <tr>
              <th className={th}>{t("night")}</th>
              <th className={thEnd}>{t("sold")}</th>
              <th className={thEnd}>{t("blocked")}</th>
              <th className={thEnd}>{t("free")}</th>
              <th className={thEnd}>{t("occupancy")}</th>
              <th className={thEnd}>{t("revenue")}</th>
              <th className={thEnd}>{t("adr")}</th>
              <th className={thEnd}>{t("arrivals")}</th>
              <th className={thEnd}>{t("departures")}</th>
            </tr>
          </thead>
          <tbody>
            {fc.rows.map((r) => (
              <tr key={r.day}>
                <td className="px-3 py-2 whitespace-nowrap">{day(r.day)}</td>
                <td className={tdNum}>{r.sold}</td>
                <td className={tdNum}>{r.blocked || ""}</td>
                <td
                  className={cn(
                    tdNum,
                    r.free <= 0 ? "font-bold text-danger" : r.free <= 1 ? "text-warning" : "",
                  )}
                >
                  {r.free}
                </td>
                <td className={tdNum}>
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                      <span
                        className={cn(
                          "block h-full",
                          r.occupancyPct >= 90
                            ? "bg-danger"
                            : r.occupancyPct >= 70
                              ? "bg-warning"
                              : "bg-accent",
                        )}
                        style={{ width: `${Math.min(100, r.occupancyPct)}%` }}
                      />
                    </span>
                    {r.occupancyPct}%
                  </span>
                </td>
                <td className={tdNum}>{money(r.revenueCents)}</td>
                <td className={tdNum}>{money(r.adrCents)}</td>
                <td className={tdNum}>{r.arrivals}</td>
                <td className={tdNum}>{r.departures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {mix(t("mixPast"), past)}
        {mix(t("mixAhead"), ahead)}
      </div>
    </>
  );
}
