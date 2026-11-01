import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, LayoutGrid, ReceiptText, Store } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { ImportMenu, NewBranchButton } from "@/components/branches/branches-ui";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { groupOverview } from "@/server/modules/branches/service";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/branches">;

export default function BranchesPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Branches params={params} />
    </Suspense>
  );
}

async function Branches({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, tKind, locale, rows] = await Promise.all([
    getTranslations("branches"),
    getTranslations("kinds"),
    getLocale(),
    groupOverview(db, ctx),
  ]);
  const money = (c: number, cur: string) => formatMoney(c, cur, locale);
  const n = (v: number) => v.toLocaleString(locale === "fa" ? "fa-IR" : locale);
  const cur = ctx.restaurant.currency;
  const same = rows.filter((r) => r.currency === cur);
  const total = (k: "todayCents" | "weekCents" | "todayOrders" | "activeOrders") =>
    same.reduce((s, r) => s + r[k], 0);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle", { count: rows.length })}
        actions={
          ctx.role === "owner" ? (
            <NewBranchButton rid={ctx.restaurant.id} current={ctx.restaurant.name} />
          ) : null
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("todaySales"), money(total("todayCents"), cur)],
          [t("todayOrders"), n(total("todayOrders"))],
          [t("weekSales"), money(total("weekCents"), cur)],
          [t("activeOrders"), n(total("activeOrders"))],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-xs text-fg-muted">{k}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <ul className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const share =
            total("todayCents") > 0 && r.currency === cur ? r.todayCents / total("todayCents") : 0;
          return (
            <li
              key={r.id}
              className={cn(
                "rounded-2xl border bg-surface p-4",
                r.isCurrent ? "border-accent ring-2 ring-accent/15" : "border-border",
              )}
            >
              <div className="flex items-start gap-3">
                {r.logoKey ? (
                  <img
                    src={logoUrl(r.logoKey)!}
                    alt=""
                    className="size-11 shrink-0 rounded-xl border border-border object-cover"
                  />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Store className="size-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-fg-muted">
                    {tKind.has(r.kind) ? tKind(r.kind) : r.kind}
                    {r.isCurrent ? ` · ${t("current")}` : ""}
                    {r.status === "suspended" ? ` · ${t("suspended")}` : ""}
                  </p>
                </div>
                {!r.isCurrent ? (
                  <Link
                    href={`/dashboard/${r.id}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 ring-border hover:bg-surface-2"
                  >
                    {t("open")}
                    <ArrowLeft className="size-3.5 ltr:rotate-180" />
                  </Link>
                ) : null}
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-fg-muted">{t("today")}</p>
                  <p className="text-xl font-bold tabular-nums">{money(r.todayCents, r.currency)}</p>
                </div>
                <p className="text-xs text-fg-muted">
                  {t("week")}: <b className="text-fg tabular-nums">{money(r.weekCents, r.currency)}</b>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(share * 100)}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">
                  <ReceiptText className="size-3.5" />
                  {t("ordersToday", { count: r.todayOrders })}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1",
                    r.activeOrders ? "bg-accent-soft text-accent" : "bg-surface-2",
                  )}
                >
                  {t("inProgress", { count: r.activeOrders })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">
                  <LayoutGrid className="size-3.5" />
                  {t("openTables", { count: r.openTables })}
                </span>
                {r.lowStock ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-1 text-danger">
                    <AlertTriangle className="size-3.5" />
                    {t("lowStock", { count: r.lowStock })}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {can(ctx, "menu.manage") ? (
        <ImportMenu
          rid={ctx.restaurant.id}
          sources={rows.filter((r) => !r.isCurrent).map((r) => ({ id: r.id, name: r.name }))}
        />
      ) : null}
    </>
  );
}
