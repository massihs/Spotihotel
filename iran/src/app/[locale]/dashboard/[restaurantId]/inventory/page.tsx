import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { PurchaseForm, RecipeList, StockTable, SupplierList } from "@/components/inventory/inventory-ui";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  listMovements,
  listPurchases,
  listRecipes,
  listStock,
  listSuppliers,
} from "@/server/modules/inventory/service";
import { can } from "@/server/tenancy";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/inventory">;
const TABS = ["stock", "purchases", "recipes", "suppliers", "movements"] as const;

export default function InventoryPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Inventory params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Inventory({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "inventory.view");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab))
    ? (sp.tab as (typeof TABS)[number])
    : "stock";
  const [t, format, items, suppliers] = await Promise.all([
    getTranslations("inventory"),
    getFormatter(),
    listStock(db, ctx),
    listSuppliers(db, ctx),
  ]);
  const manage = can(ctx, "inventory.manage");
  const base = `/dashboard/${ctx.restaurant.id}/inventory`;
  const cur = ctx.restaurant.currency;
  const money = (c: number) => formatMoney(c, cur, "fa");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          manage ? (
            <PurchaseForm rid={ctx.restaurant.id} items={items} suppliers={suppliers} currency={cur} />
          ) : null
        }
      />
      <nav
        className="-mx-4 mb-5 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {TABS.map((k) => (
          <Link
            key={k}
            href={k === "stock" ? base : `${base}?tab=${k}`}
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

      {tab === "stock" ? (
        <StockTable rid={ctx.restaurant.id} items={items} currency={cur} canManage={manage} />
      ) : null}
      {tab === "suppliers" ? (
        <SupplierList rid={ctx.restaurant.id} suppliers={suppliers} canManage={manage} />
      ) : null}
      {tab === "recipes" ? (
        <RecipeList
          rid={ctx.restaurant.id}
          recipes={await listRecipes(db, ctx)}
          items={items}
          currency={cur}
          canManage={manage}
        />
      ) : null}
      {tab === "purchases" ? (
        <PurchasesList
          rows={await listPurchases(db, ctx)}
          money={money}
          date={(d) => format.dateTime(d, { dateStyle: "medium" })}
          empty={t("noPurchases")}
          t={(k, v) => t(k, v)}
        />
      ) : null}
      {tab === "movements" ? (
        <Card>
          <ul className="divide-y divide-border">
            {(await listMovements(db, ctx)).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    "w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold",
                    m.quantity >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                  )}
                >
                  {t(`kinds.${m.kind}`)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{m.itemName}</span>
                <span dir="ltr" className="font-bold tabular-nums">
                  {m.quantity > 0 ? "+" : ""}
                  {m.quantity} {t(`units.${m.unit}`)}
                </span>
                <span className="w-28 shrink-0 text-end text-xs text-fg-subtle">
                  {format.dateTime(m.createdAt, {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: ctx.restaurant.timezone,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function PurchasesList({
  rows,
  money,
  date,
  empty,
  t,
}: {
  rows: {
    id: string;
    reference: string | null;
    totalCents: number;
    purchasedAt: Date;
    supplierName: string | null;
    lineCount: number;
  }[];
  money: (c: number) => string;
  date: (d: Date) => string;
  empty: string;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  if (!rows.length) return <p className="py-10 text-center text-fg-muted">{empty}</p>;
  return (
    <Card>
      <ul className="divide-y divide-border">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.supplierName ?? "—"}</p>
              <p className="text-xs text-fg-muted">
                {date(p.purchasedAt)} · {t("lines", { count: p.lineCount })}
                {p.reference ? ` · ${p.reference}` : ""}
              </p>
            </div>
            <p className="font-bold tabular-nums">{money(p.totalCents)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
