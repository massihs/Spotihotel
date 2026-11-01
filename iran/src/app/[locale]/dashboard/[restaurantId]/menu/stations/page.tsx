import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { routingView } from "@/server/modules/kitchen/stations";
import { RoutingBoard } from "./routing-board";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/menu/stations">;

export default function StationsRoutingPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
      <Routing params={params} />
    </Suspense>
  );
}

async function Routing({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.view");
  const [t, view] = await Promise.all([getTranslations("routing"), routingView(db, ctx)]);
  const base = `/dashboard/${ctx.restaurant.id}`;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Link href={`${base}/settings#printers`} className={buttonClasses("secondary")}>
              {t("printers")}
            </Link>
            <Link href={`${base}/kitchen`} className={buttonClasses("secondary")}>
              {t("manageStations")}
            </Link>
          </>
        }
      />
      <RoutingBoard restaurantId={ctx.restaurant.id} canManage={can(ctx, "menu.manage")} {...view} />
    </>
  );
}
