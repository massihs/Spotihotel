import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { BedDouble, Building2, Gauge, LogIn, LogOut, Search, TrendingUp, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { StatusText } from "@/components/pms/status-text";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getMoney } from "@/lib/money-server";
import { localDay } from "@/lib/period";
import { isDay } from "@/server/modules/pms/calc";
import { chainAvailability, chainFinancials, chainOverview, chainSearch } from "@/server/modules/pms/chain";
import { fiscalYearStart } from "@/server/modules/ledger/periods";

const TABS = ["overview", "availability", "search", "finance"] as const;
type Tab = (typeof TABS)[number];
type Props = PageProps<"/[locale]/dashboard/[restaurantId]/chain">;

export default function ChainPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Chain params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const th = "px-3 py-2.5 text-start text-xs font-semibold text-fg-muted";
const thEnd = "px-3 py-2.5 text-end text-xs font-semibold text-fg-muted";
const td = "px-3 py-2";
const tdNum = "px-3 py-2 text-end tabular-nums";

/** The hotel chain: every hotel of the group at a glance, central reservations, group accounts. */
async function Chain({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "overview";
  const locale = await getLocale();
  const [t, money] = await Promise.all([getTranslations("chain"), getMoney(ctx.restaurant.currency)]);
  const day = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), { ...o, timeZone: "UTC" }).format(
      new Date(`${d}T12:00:00Z`),
    );
  const base = `/dashboard/${ctx.restaurant.id}`;
  const today = localDay(new Date(), ctx.restaurant.timezone);
  let body: React.ReactNode = null;

  if (tab === "overview") {
    const o = await chainOverview(db, ctx);
    const T = o.totals;
    body = (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t("occupancy")}
            value={`${T.occupancyPct}%`}
            hint={t("roomsSold", { sold: T.sold, rooms: T.rooms })}
            icon={<Gauge />}
            tone="ink"
          />
          <StatCard label={t("adr")} value={money(T.adrCents)} icon={<TrendingUp />} tone="indigo" />
          <StatCard label={t("revpar")} value={money(T.revparCents)} icon={<BedDouble />} tone="teal" />
          <StatCard
            label={t("guests")}
            value={T.guests}
            hint={t("hotelsN", { n: T.hotels })}
            icon={<Users />}
            tone="amber"
          />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[900px] text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("hotel")}</th>
                <th className={thEnd}>{t("businessDay")}</th>
                <th className={thEnd}>{t("occupancy")}</th>
                <th className={thEnd}>{t("adr")}</th>
                <th className={thEnd}>{t("revpar")}</th>
                <th className={thEnd}>
                  <LogIn className="inline size-3.5" aria-label={t("arrivals")} />
                </th>
                <th className={thEnd}>
                  <LogOut className="inline size-3.5" aria-label={t("departures")} />
                </th>
                <th className={thEnd}>{t("inHouse")}</th>
                <th className={thEnd}>{t("openBills")}</th>
              </tr>
            </thead>
            <tbody>
              {o.hotels.map((h) => (
                <tr key={h.id}>
                  <td className={cn(td, "font-semibold")}>
                    <Link href={`/dashboard/${h.id}/frontdesk`} className="hover:underline">
                      {h.name}
                    </Link>
                  </td>
                  <td className={tdNum}>{day(h.businessDate)}</td>
                  <td className={tdNum}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${Math.min(100, h.occupancyPct)}%` }}
                        />
                      </span>
                      {h.occupancyPct}%
                    </span>
                  </td>
                  <td className={tdNum}>{money(h.adrCents)}</td>
                  <td className={tdNum}>{money(h.revparCents)}</td>
                  <td className={tdNum}>{h.arrivals}</td>
                  <td className={tdNum}>{h.departures}</td>
                  <td className={tdNum}>{h.inHouse}</td>
                  <td className={tdNum}>{money(h.openBalanceCents)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-bold">
                <td className={td}>{t("total")}</td>
                <td className={td} />
                <td className={tdNum}>{T.occupancyPct}%</td>
                <td className={tdNum}>{money(T.adrCents)}</td>
                <td className={tdNum}>{money(T.revparCents)}</td>
                <td className={tdNum}>{T.arrivals}</td>
                <td className={tdNum}>{T.departures}</td>
                <td className={tdNum}>{o.hotels.reduce((s, h) => s + h.inHouse, 0)}</td>
                <td className={tdNum}>{money(T.openBalanceCents)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {ctx.role === "owner" ? (
          <Link href={`${base}/branches`} className={buttonClasses("secondary", "md")}>
            <Building2 className="size-4" aria-hidden="true" />
            {t("openHotel")}
          </Link>
        ) : null}
      </div>
    );
  } else if (tab === "availability") {
    const from = typeof sp.from === "string" && isDay(sp.from) ? sp.from : today;
    const grid = await chainAvailability(db, ctx, from, 14);
    const nights = grid[0]?.nights ?? [];
    body = (
      <div className="space-y-4">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="availability" />
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("from")}</span>
            <DateInput name="from" defaultValue={from} required />
          </label>
          <button className={buttonClasses("secondary", "lg")}>{t("show")}</button>
        </form>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[1000px] text-xs">
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("hotel")}</th>
                {nights.map((d) => (
                  <th key={d} className="px-1 py-2 text-center font-semibold">
                    <span className="block text-fg-muted">{day(d, { weekday: "narrow" })}</span>
                    {day(d, { day: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.flatMap((h) => [
                <tr key={h.id} className="border-t border-border bg-surface-2/40">
                  <td className={cn(td, "font-bold")} colSpan={nights.length + 1}>
                    <Link href={`/dashboard/${h.id}/planning?from=${from}`} className="hover:underline">
                      {h.name}
                    </Link>
                  </td>
                </tr>,
                ...h.types.map((ty) => (
                  <tr key={`${h.id}${ty.id}`} className="border-t border-border">
                    <td className={cn(td, "whitespace-nowrap")}>
                      <Link
                        href={`/dashboard/${h.id}/stays/new?type=${ty.id}&arrival=${from}`}
                        className="hover:underline"
                      >
                        {ty.code} <span className="text-fg-muted">· {ty.rooms}</span>
                      </Link>
                    </td>
                    {ty.days.map((d) => (
                      <td
                        key={d.day}
                        className={cn(
                          "px-1 py-2 text-center font-semibold tabular-nums",
                          d.closed
                            ? "bg-danger-soft text-danger"
                            : d.free <= 0
                              ? "text-danger"
                              : d.free <= 1
                                ? "text-warning"
                                : "text-success",
                        )}
                      >
                        {d.closed ? "×" : d.free}
                      </td>
                    ))}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">{t("availabilityHint")}</p>
      </div>
    );
  } else if (tab === "search") {
    const q = typeof sp.q === "string" ? sp.q : "";
    const rows = q ? await chainSearch(db, ctx, q) : [];
    body = (
      <div className="space-y-4">
        <form className="flex gap-2" role="search">
          <input type="hidden" name="tab" value="search" />
          <label className="relative flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-fg-muted"
              aria-hidden="true"
            />
            <input
              name="q"
              defaultValue={q}
              placeholder={t("searchHint")}
              className="h-11 w-full rounded-xl border border-border-strong bg-surface ps-9 pe-3 text-[15px]"
            />
          </label>
          <button className={buttonClasses("secondary", "lg")}>{t("find")}</button>
        </form>
        {q ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dashboard/${r.restaurantId}/stays/${r.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {r.lastName} {r.firstName}
                    </span>
                    <span className="block text-sm text-fg-muted">
                      {r.hotel} | #{r.number} | {r.typeCode}
                      {r.room ? ` | ${r.room}` : ""} | {day(r.arrival)} → {day(r.departure)}
                    </span>
                  </span>
                  <StatusText status={r.status} />
                </Link>
              </li>
            ))}
            {!rows.length ? <li className="px-4 py-8 text-center text-fg-muted">{t("noResults")}</li> : null}
          </ul>
        ) : null}
      </div>
    );
  } else {
    const from = typeof sp.from === "string" && isDay(sp.from) ? sp.from : fiscalYearStart(today);
    const to = typeof sp.to === "string" && isDay(sp.to) ? sp.to : today;
    const f = await chainFinancials(db, ctx, from, to);
    const row = (r: { code: string; name: string; total: number; byHotel: Record<string, number> }) => (
      <tr key={r.code}>
        <td className={cn(td, "whitespace-nowrap")}>
          <span className="font-mono text-xs text-fg-muted">{r.code}</span> {r.name}
        </td>
        {f.hotels.map((h) => (
          <td key={h.id} className={tdNum}>
            {money(r.byHotel[h.id] ?? 0)}
          </td>
        ))}
        <td className={cn(tdNum, "font-semibold")}>{money(r.total)}</td>
      </tr>
    );
    body = (
      <div className="space-y-6">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="finance" />
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("from")}</span>
            <DateInput name="from" defaultValue={from} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("to")}</span>
            <DateInput name="to" defaultValue={to} required />
          </label>
          <button className={buttonClasses("secondary", "lg")}>{t("show")}</button>
        </form>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t("revenue")} value={money(f.totals.revenue)} tone="ink" />
          <StatCard label={t("expenses")} value={money(f.totals.expense)} tone="rose" />
          <StatCard
            label={t("netResult")}
            value={money(f.totals.net)}
            tone={f.totals.net >= 0 ? "emerald" : "rose"}
          />
          <StatCard label={t("assets")} value={money(f.totals.assets)} tone="indigo" />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[800px] text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border">
            <thead className="bg-surface-2">
              <tr>
                <th className={th}>{t("account")}</th>
                {f.hotels.map((h) => (
                  <th key={h.id} className={thEnd}>
                    {h.name}
                  </th>
                ))}
                <th className={thEnd}>{t("group")}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-surface-2/60">
                <td className={cn(td, "font-bold")} colSpan={f.hotels.length + 2}>
                  {t("revenue")}
                </td>
              </tr>
              {f.revenue.map(row)}
              <tr className="bg-surface-2/60">
                <td className={cn(td, "font-bold")} colSpan={f.hotels.length + 2}>
                  {t("expenses")}
                </td>
              </tr>
              {f.expense.map(row)}
              <tr className="bg-surface-2 font-bold">
                <td className={td}>{t("netResult")}</td>
                {f.hotels.map((h) => (
                  <td key={h.id} className={tdNum}>
                    {money(h.net)}
                  </td>
                ))}
                <td className={tdNum}>{money(f.totals.net)}</td>
              </tr>
              <tr className="font-semibold">
                <td className={td}>{t("booksBalanced")}</td>
                {f.hotels.map((h) => (
                  <td key={h.id} className={cn(tdNum, h.balanced ? "text-success" : "text-danger")}>
                    {h.balanced ? "✓" : "⚠"}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-fg-muted">{t("financeHint")}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="seg mb-5 print:hidden" aria-label={t("title")}>
        {TABS.map((k) => (
          <Link
            key={k}
            href={`${base}/chain?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className="seg-item"
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
