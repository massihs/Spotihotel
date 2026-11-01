import { Suspense } from "react";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { CustomPeriod, DeleteExpense, NewExpenseButton } from "@/components/reports/reports-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { localDay, PRESETS, resolvePeriod } from "@/lib/period";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listSecurityEvents, profitAndLoss } from "@/server/modules/reports/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/reports">;
const TABS = ["overview", "sales", "products", "expenses", "security"] as const;

export default function ReportsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Reports params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "accounting.manage");
  const sp = await searchParams;
  const tz = ctx.restaurant.timezone;
  const period = resolvePeriod(sp, tz, ctx.restaurant.currency === "IRR");
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "overview";
  const [t, format, locale, data] = await Promise.all([
    getTranslations("reports"),
    getFormatter(),
    getLocale(),
    profitAndLoss(db, ctx, period),
  ]);
  const { sales, pnl } = data;
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/reports`;
  const cur = ctx.restaurant.currency;
  const money = (c: number) => (c < 0 ? `−${formatMoney(-c, cur, locale)}` : formatMoney(c, cur, locale));
  const n = (v: number) => v.toLocaleString(locale === "fa" ? "fa-IR" : locale);
  const periodQs =
    period.preset === "custom" ? `from=${period.first}&to=${period.last}` : `p=${period.preset}`;
  const tabHref = (k: string) => `${base}?${k === "overview" ? "" : `tab=${k}&`}${periodQs}`;
  const presetHref = (p: string) => `${base}?${tab === "overview" ? "" : `tab=${tab}&`}p=${p}`;
  const day = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" });
  const exportHref = (kind: string) =>
    `/api/v1/restaurants/${rid}/reports/export?kind=${kind}&${periodQs}&l=${locale}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("periodLabel", { from: day(period.first), to: day(period.last), days: period.days })}
        actions={
          tab === "expenses" ? (
            <NewExpenseButton rid={rid} currency={cur} today={localDay(new Date(), tz)} />
          ) : (
            <a
              href={exportHref(tab === "overview" ? "pnl" : tab)}
              className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-border"
            >
              <Download className="size-4" />
              {t("exportCsv")}
            </a>
          )
        }
      />
      <div className="-mx-4 mb-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
        {PRESETS.filter((p) => p !== "custom").map((p) => (
          <Link
            key={p}
            href={presetHref(p)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
              period.preset === p ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`presets.${p}`)}
          </Link>
        ))}
        <CustomPeriod
          base={tab === "overview" ? base : `${base}?tab=${tab}`}
          from={period.first}
          to={period.last}
        />
      </div>
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.filter((k) => k !== "security" || can(ctx, "audit.view")).map((k) => (
          <Link
            key={k}
            href={tabHref(k)}
            aria-current={tab === k ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap",
              tab === k ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={t("revenue")}
              value={money(pnl.revenueCents)}
              hint={t("ordersN", { count: sales.summary.orders })}
            />
            <Kpi label={t("avgTicket")} value={money(sales.summary.avgTicketCents)} />
            <Kpi label={t("grossMargin")} value={money(pnl.grossCents)} hint={t("afterCogs")} />
            <Kpi
              label={t("netProfit")}
              value={money(pnl.netCents)}
              tone={pnl.netCents >= 0 ? "good" : "bad"}
              hint={t("marginPct", { pct: Math.round(pnl.marginPct * 10) / 10 })}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Card className="p-4">
              <p className="mb-3 font-semibold">{t("dailySales")}</p>
              <DailyChart rows={sales.daily} money={money} day={day} />
            </Card>
            <Card>
              <p className="border-b border-border px-4 py-3 font-semibold">{t("pnl")}</p>
              <dl className="divide-y divide-border text-sm">
                <Row k={t("revenue")} v={money(pnl.revenueCents)} />
                <Row k={t("vat")} v={`−${money(pnl.taxCents)}`} muted />
                <Row k={t("netSales")} v={money(pnl.netSalesCents)} bold />
                <Row
                  k={t("cogs")}
                  v={`−${money(pnl.cogsCents)}`}
                  muted
                  hint={t("cogsCoverage", { pct: Math.round(sales.cogs.coverage * 100) })}
                />
                <Row k={t("grossMargin")} v={money(pnl.grossCents)} bold />
                {pnl.expensesByCategory.map((e) => (
                  <Row key={e.category} k={t(`categories.${e.category}`)} v={`−${money(e.cents)}`} muted />
                ))}
                <Row
                  k={t("netProfit")}
                  v={money(pnl.netCents)}
                  bold
                  tone={pnl.netCents >= 0 ? "good" : "bad"}
                />
              </dl>
              <p className="border-t border-border px-4 py-2.5 text-xs text-fg-muted">
                {t("purchasesNote", {
                  amount: money(data.purchases.totalCents),
                  count: data.purchases.count,
                })}
              </p>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <p className="mb-3 font-semibold">{t("paymentMethods")}</p>
              <Bars
                rows={sales.methods.map((m) => ({
                  label: t.has(`providers.${m.provider}`) ? t(`providers.${m.provider}`) : m.provider,
                  value: m.amountCents,
                  hint: n(m.count),
                }))}
                format={money}
              />
            </Card>
            <Card className="p-4">
              <p className="mb-3 font-semibold">{t("channels")}</p>
              <Bars
                rows={sales.channels.map((c) => ({
                  label: t(`channel.${c.key}`),
                  value: c.totalCents,
                  hint: n(c.orders),
                }))}
                format={money}
              />
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "sales" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("subtotal")} value={money(sales.summary.subtotalCents)} />
            <Kpi label={t("discounts")} value={money(sales.summary.discountCents)} />
            <Kpi label={t("vat")} value={money(sales.summary.taxCents)} />
            <Kpi
              label={t("cancelled")}
              value={n(sales.summary.cancelledOrders)}
              hint={money(sales.summary.cancelledCents)}
              tone={sales.summary.cancelledOrders ? "bad" : undefined}
            />
          </div>
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("byHour")}</p>
            <HourChart rows={sales.hourly} />
          </Card>
          <Card>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t("date")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("orders")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("revenue")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.daily.map((d) => (
                  <tr key={d.day}>
                    <td className="px-4 py-2">
                      {format.dateTime(new Date(`${d.day}T12:00:00Z`), {
                        dateStyle: "full",
                        timeZone: "UTC",
                      })}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">{n(d.orders)}</td>
                    <td className="px-4 py-2 text-end font-semibold tabular-nums">{money(d.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ) : null}

      {tab === "products" ? (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="mb-3 font-semibold">{t("byCategory")}</p>
            <Bars
              rows={sales.categories.map((c) => ({
                label: c.name,
                value: c.revenueCents,
                hint: n(c.quantity),
              }))}
              format={money}
            />
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t("product")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("qty")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("revenue")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("cost")}</th>
                  <th className="px-4 py-2 text-end font-medium">{t("margin")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sales.products.map((p, i) => {
                  const m =
                    p.costCents != null && p.revenueCents > 0 ? 1 - p.costCents / p.revenueCents : null;
                  return (
                    <tr key={`${p.productId}-${p.name}`}>
                      <td className="px-4 py-2">
                        <span className="me-2 text-xs text-fg-subtle tabular-nums">{n(i + 1)}</span>
                        <span className="font-medium">{p.name}</span>
                        <span className="ms-2 text-xs text-fg-muted">{p.category}</span>
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{n(p.quantity)}</td>
                      <td className="px-4 py-2 text-end font-semibold tabular-nums">
                        {money(p.revenueCents)}
                      </td>
                      <td className="px-4 py-2 text-end text-fg-muted tabular-nums">
                        {p.costCents != null ? money(p.costCents) : "—"}
                      </td>
                      <td className="px-4 py-2 text-end">
                        {m != null ? (
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              m >= 0.6
                                ? "bg-success-soft text-success"
                                : m >= 0.4
                                  ? "bg-warning-soft text-warning"
                                  : "bg-danger-soft text-danger",
                            )}
                          >
                            {n(Math.round(m * 100))}٪
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!sales.products.length ? <p className="py-10 text-center text-fg-muted">{t("noData")}</p> : null}
          </Card>
        </div>
      ) : null}

      {tab === "security" && can(ctx, "audit.view")
        ? await (async () => {
            const events = await listSecurityEvents(db, ctx, period);
            const detail = (m: Record<string, unknown>) =>
              [
                m.number ? String(m.number) : null,
                Array.isArray(m.orders) ? (m.orders as string[]).join("، ") : null,
                typeof m.totalCents === "number" ? money(m.totalCents) : null,
                typeof m.amountCents === "number" ? money(m.amountCents) : null,
                typeof m.discountCents === "number" && m.discountCents > 0
                  ? t("security.discount", { amount: money(m.discountCents) })
                  : null,
                typeof m.differenceCents === "number"
                  ? t("security.difference", { amount: money(m.differenceCents) })
                  : null,
                m.reason ? String(m.reason) : null,
                m.from && m.to ? `${String(m.from)} → ${String(m.to)}` : null,
                m.provider
                  ? t.has(`providers.${String(m.provider)}`)
                    ? t(`providers.${String(m.provider)}`)
                    : String(m.provider)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ");
            return (
              <Card>
                <p className="border-b border-border px-4 py-3 text-sm text-fg-muted">{t("security.hint")}</p>
                {events.length === 0 ? (
                  <p className="py-12 text-center text-fg-muted">{t("security.empty")}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {events.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            /cancel|refund|deleted|removed/.test(e.action)
                              ? "bg-danger-soft text-danger"
                              : "bg-warning-soft text-warning",
                          )}
                        >
                          {t.has(`security.actions.${e.action.replace(".", "_")}`)
                            ? t(`security.actions.${e.action.replace(".", "_")}`)
                            : e.action}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-fg-muted">{detail(e.metadata)}</span>
                        <span className="text-xs font-medium">{e.actorName ?? t("security.system")}</span>
                        <span className="w-32 text-end text-xs text-fg-subtle">
                          {format.dateTime(e.createdAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                            timeZone: tz,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })()
        : null}

      {tab === "expenses" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label={t("totalExpenses")}
              value={money(pnl.expensesCents)}
              hint={t("entries", { count: data.expenses.length })}
            />
            {pnl.expensesByCategory.slice(0, 3).map((e) => (
              <Kpi key={e.category} label={t(`categories.${e.category}`)} value={money(e.cents)} />
            ))}
          </div>
          <Card>
            {data.expenses.length === 0 ? (
              <p className="py-12 text-center text-fg-muted">{t("noExpenses")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.expenses.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-24 shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-center text-xs font-semibold">
                      {t(`categories.${e.category}`)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{e.description ?? "—"}</p>
                      <p className="text-xs text-fg-muted">
                        {format.dateTime(e.paidAt, { dateStyle: "medium", timeZone: tz })} ·{" "}
                        {t(`methods.${e.method}`)}
                      </p>
                    </div>
                    <p className="font-bold tabular-nums">{money(e.amountCents)}</p>
                    <DeleteExpense rid={rid} id={e.id} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <a
            href={exportHref("expenses")}
            className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg"
          >
            <Download className="size-4" />
            {t("exportCsv")}
          </a>
        </div>
      ) : null}
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
      <p className="flex items-center gap-1 text-xs text-fg-muted">
        {tone === "good" ? <TrendingUp className="size-3.5 text-success" /> : null}
        {tone === "bad" ? <TrendingDown className="size-3.5 text-danger" /> : null}
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

function Row({
  k,
  v,
  bold,
  muted,
  hint,
  tone,
}: {
  k: string;
  v: string;
  bold?: boolean;
  muted?: boolean;
  hint?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 px-4 py-2",
        bold && "bg-surface-2/50 font-semibold",
      )}
    >
      <dt className={cn(muted && "text-fg-muted")}>
        {k}
        {hint ? <span className="ms-1 text-xs text-fg-subtle">({hint})</span> : null}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          muted && "text-fg-muted",
          tone === "good" && "text-success",
          tone === "bad" && "text-danger",
        )}
      >
        {v}
      </dd>
    </div>
  );
}

function Bars({
  rows,
  format,
}: {
  rows: { label: string; value: number; hint?: string }[];
  format: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <p className="py-6 text-center text-sm text-fg-muted">—</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">
              {r.label}
              {r.hint ? <span className="ms-1.5 text-xs text-fg-subtle">×{r.hint}</span> : null}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {format(r.value)}
              <span className="ms-1.5 text-xs font-normal text-fg-subtle">
                {total ? Math.round((r.value / total) * 100) : 0}%
              </span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({
  rows,
  money,
  day,
}: {
  rows: { day: string; orders: number; totalCents: number }[];
  money: (c: number) => string;
  day: (d: string) => string;
}) {
  if (!rows.length) return <p className="py-16 text-center text-sm text-fg-muted">—</p>;
  const max = Math.max(1, ...rows.map((r) => r.totalCents));
  return (
    <div className="flex h-48 items-end gap-1" dir="ltr">
      {rows.map((r) => (
        <div key={r.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
          <div
            className="rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent"
            style={{ height: `${Math.max(2, (r.totalCents / max) * 100)}%` }}
            title={`${day(r.day)} · ${money(r.totalCents)} · ${r.orders}`}
          />
          {rows.length <= 14 ? (
            <span className="mt-1 truncate text-center text-[10px] text-fg-subtle">{day(r.day)}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function HourChart({ rows }: { rows: { hour: number; orders: number }[] }) {
  const by = new Map(rows.map((r) => [r.hour, r.orders]));
  const max = Math.max(1, ...rows.map((r) => r.orders));
  return (
    <div className="flex h-32 items-end gap-0.5" dir="ltr">
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className="flex h-full flex-1 flex-col justify-end"
          title={`${h}:00 · ${by.get(h) ?? 0}`}
        >
          <div
            className={cn("rounded-t-sm", by.get(h) ? "bg-accent/80" : "bg-surface-2")}
            style={{ height: `${Math.max(3, ((by.get(h) ?? 0) / max) * 100)}%` }}
          />
          <span className="mt-1 text-center text-[9px] text-fg-subtle">{h % 3 === 0 ? h : ""}</span>
        </div>
      ))}
    </div>
  );
}
