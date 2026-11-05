import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { NewOutletButton, OutletCard, QuickAdd } from "@/components/outlets/outlets-ui";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getMoney } from "@/lib/money-server";
import { can } from "@/server/tenancy";
import { categoriesWithOutlets, listOutlets } from "@/server/modules/outlets/service";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/outlets">;

export default function OutletsPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-surface-2" />}>
      <Outlets params={params} />
    </Suspense>
  );
}

/** The hotel's restaurants, cafés and bars: create one in a click, then run each on its own. */
async function Outlets({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const [t, money, outlets, cats] = await Promise.all([
    getTranslations("outlets"),
    getMoney(ctx.restaurant.currency),
    listOutlets(db, ctx),
    categoriesWithOutlets(db, ctx.restaurant.id),
  ]);
  const canManage = can(ctx, "tables.manage");
  const has = (kind: string) => outlets.some((o) => o.kind === kind);
  // Typical outlets of a hotel, offered until one of each kind exists.
  const presets = (
    [
      { kind: "restaurant", name: t("presets.restaurant"), tables: 20 },
      { kind: "cafe", name: t("presets.cafe"), tables: 10 },
      { kind: "bar", name: t("presets.bar"), tables: 8 },
      { kind: "pool_bar", name: t("presets.pool_bar"), tables: 6 },
      { kind: "pastry", name: t("presets.pastry"), tables: 6 },
    ] as const
  ).filter((p) => !has(p.kind));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={canManage ? <NewOutletButton restaurantId={ctx.restaurant.id} /> : null}
      />
      {canManage && presets.length ? (
        <div className="mb-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
          <QuickAdd restaurantId={ctx.restaurant.id} presets={presets.map((p) => ({ ...p }))} />
        </div>
      ) : null}
      {outlets.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {outlets.map((o) => (
            <OutletCard
              key={o.id}
              restaurantId={ctx.restaurant.id}
              canManage={canManage}
              categories={cats}
              outlet={{
                id: o.id,
                name: o.name,
                kind: o.kind,
                location: o.location,
                hours: o.hours,
                tables: o.tables,
                openTables: o.openTables,
                categories: o.categories,
                ordersToday: o.ordersToday,
                salesToday: money(o.salesToday),
              }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-brand-200 bg-surface px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-100 text-brand-700">
            <Store className="size-6" aria-hidden="true" />
          </span>
          <p className="font-semibold">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-fg-muted">{t("emptyBody")}</p>
        </div>
      )}
    </>
  );
}
