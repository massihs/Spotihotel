import { Suspense } from "react";
import { Search, Star, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import {
  CampaignForm,
  CouponList,
  LoyaltySettings,
  NewCustomerButton,
} from "@/components/customers/customers-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  AUDIENCES,
  countAudience,
  customerStats,
  listCampaigns,
  listCoupons,
  listCustomers,
  loyaltyConfig,
  type Audience,
} from "@/server/modules/customers/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/customers">;
const TABS = ["customers", "coupons", "campaigns", "loyalty"] as const;

export default function CustomersPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Customers params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Customers({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "customers.view");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "customers";
  const [t, format] = await Promise.all([getTranslations("customers"), getFormatter()]);
  const manage = can(ctx, "customers.manage");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/customers`;
  const cur = ctx.restaurant.currency;
  const money = (c: number) => formatMoney(c, cur, "fa");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={manage && tab === "customers" ? <NewCustomerButton rid={rid} /> : null}
      />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.map((k) => (
          <Link
            key={k}
            href={k === "customers" ? base : `${base}?tab=${k}`}
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

      {tab === "customers" ? (
        <CustomerTab
          rid={rid}
          q={typeof sp.q === "string" ? sp.q : ""}
          segment={(AUDIENCES as readonly string[]).includes(String(sp.s)) ? (sp.s as Audience) : "all"}
          money={money}
          date={(d) => format.relativeTime(d)}
          ctx={ctx}
        />
      ) : null}
      {tab === "coupons" ? (
        <CouponList rid={rid} coupons={await listCoupons(db, ctx)} currency={cur} canManage={manage} />
      ) : null}
      {tab === "campaigns" ? (
        <div className="space-y-4">
          {manage ? (
            <CampaignForm
              rid={rid}
              restaurantName={ctx.restaurant.name}
              counts={await countAudience(db, ctx)}
            />
          ) : null}
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">{t("history")}</p>
            <ul className="divide-y divide-border">
              {(await listCampaigns(db, ctx)).map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <p className="line-clamp-2 text-sm">{c.message}</p>
                  <p className="mt-1 text-xs text-fg-muted">
                    {t(`audiences.${c.audience}`)} · {t("sentOf", { sent: c.sent, total: c.recipients })} ·{" "}
                    {format.dateTime(c.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
      {tab === "loyalty" ? (
        <LoyaltySettings rid={rid} currency={cur} initial={await loyaltyConfig(db, rid)} canManage={manage} />
      ) : null}
    </>
  );
}

async function CustomerTab({
  rid,
  q,
  segment,
  money,
  date,
  ctx,
}: {
  rid: string;
  q: string;
  segment: Audience;
  money: (c: number) => string;
  date: (d: Date) => string;
  ctx: Awaited<ReturnType<typeof requireRestaurant>>;
}) {
  const t = await getTranslations("customers");
  const [stats, rows] = await Promise.all([customerStats(db, ctx), listCustomers(db, ctx, { q, segment })]);
  const base = `/dashboard/${rid}/customers`;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("statTotal"), stats.total.toLocaleString("fa-IR")],
          [t("statActive"), stats.active.toLocaleString("fa-IR")],
          [t("statPoints"), stats.points.toLocaleString("fa-IR")],
          [t("statSpent"), money(stats.spent)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-xs text-fg-muted">{k}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form action={base} className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-10 w-full rounded-full border border-border-strong bg-surface ps-9 pe-3 text-sm"
          />
          {segment !== "all" ? <input type="hidden" name="s" value={segment} /> : null}
        </form>
        {AUDIENCES.map((a) => (
          <Link
            key={a}
            href={a === "all" ? base : `${base}?s=${a}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              segment === a ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t(`audiences.${a}`)}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-fg-muted">
          <Users className="mx-auto mb-2 size-8 text-fg-subtle" />
          {t("noCustomers")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`${base}/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent">
                  {(c.name ?? "#").slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.name ?? t("unnamed")}</p>
                  <p dir="ltr" className="text-start text-xs text-fg-muted tabular-nums">
                    {c.phone}
                  </p>
                </div>
                <div className="hidden text-end text-xs text-fg-muted sm:block">
                  <p>{t("ordersCount", { count: c.ordersCount })}</p>
                  <p>{c.lastOrderAt ? date(c.lastOrderAt) : "—"}</p>
                </div>
                <div className="w-28 shrink-0 text-end">
                  <p className="text-sm font-bold tabular-nums">{money(c.totalSpentCents)}</p>
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                    <Star className="size-3 fill-current" />
                    {c.points.toLocaleString("fa-IR")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
