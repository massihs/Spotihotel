import { Suspense } from "react";
import { ArrowRight, Phone, Star } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { CustomerEditor, HouseAccount } from "@/components/customers/customers-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getCustomer, listAccountEntries, loyaltyConfig } from "@/server/modules/customers/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/customers/[customerId]">;

export default function CustomerPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <CustomerFile params={params} />
    </Suspense>
  );
}

async function CustomerFile({ params }: Pick<Props, "params">) {
  const { restaurantId, customerId } = await params;
  const ctx = await requireRestaurant(restaurantId, "customers.view");
  const [t, tOrders, format, file, cfg, accountEntries] = await Promise.all([
    getTranslations("customers"),
    getTranslations("orderStatus"),
    getFormatter(),
    getCustomer(db, ctx, customerId),
    loyaltyConfig(db, restaurantId),
    listAccountEntries(db, ctx, customerId),
  ]);
  const { customer: c } = file;
  const money = (v: number) => formatMoney(v, ctx.restaurant.currency, "fa");
  const base = `/dashboard/${ctx.restaurant.id}`;
  return (
    <>
      <Link
        href={`${base}/customers`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowRight className="size-4 ltr:rotate-180" />
        {t("title")}
      </Link>
      <PageHeader
        title={c.name ?? t("unnamed")}
        description={
          <a href={`tel:${c.phone}`} dir="ltr" className="inline-flex items-center gap-1 tabular-nums">
            <Phone className="size-3.5" />
            {c.phone}
          </a>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="text-xs text-fg-muted">{t("points")}</p>
          <p className="inline-flex items-center gap-1 text-lg font-bold tabular-nums">
            <Star className="size-4 fill-warning text-warning" />
            {c.points.toLocaleString("fa-IR")}
          </p>
          <p className="text-xs text-fg-muted">≈ {money(c.points * cfg.pointValueCents)}</p>
        </div>
        {[
          [t("statSpent"), money(c.totalSpentCents)],
          [t("orders"), c.ordersCount.toLocaleString("fa-IR")],
          [t("lastVisit"), c.lastOrderAt ? format.dateTime(c.lastOrderAt, { dateStyle: "medium" }) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface px-4 py-3">
            <p className="text-xs text-fg-muted">{k}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <CustomerEditor rid={ctx.restaurant.id} customer={c} canManage={can(ctx, "customers.manage")} />
          <HouseAccount
            rid={ctx.restaurant.id}
            customerId={c.id}
            currency={ctx.restaurant.currency}
            creditLimitCents={c.creditLimitCents}
            balanceCents={c.balanceCents}
            entries={accountEntries.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }))}
            canManage={can(ctx, "customers.manage")}
            canRecord={can(ctx, "payments.record")}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">{t("orders")}</p>
            {file.orders.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-fg-muted">—</p>
            ) : (
              <ul className="divide-y divide-border">
                {file.orders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="font-semibold tabular-nums">{o.number}</span>
                    <span className="text-xs text-fg-muted">
                      {tOrders.has(o.status) ? tOrders(o.status) : o.status}
                    </span>
                    <span className="ms-auto text-xs text-fg-subtle">
                      {format.dateTime(o.placedAt, { dateStyle: "short" })}
                    </span>
                    <span className="w-28 text-end font-bold tabular-nums">{money(o.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <p className="border-b border-border px-4 py-3 font-semibold">{t("ledger")}</p>
            <ul className="divide-y divide-border">
              {file.ledger.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span>{t(`entry.${e.kind}`)}</span>
                  <span className="ms-auto text-xs text-fg-subtle">
                    {format.dateTime(e.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span
                    dir="ltr"
                    className={cn(
                      "w-16 text-end font-bold tabular-nums",
                      e.points >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {e.points > 0 ? "+" : ""}
                    {e.points}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
