import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { PlanningGrid } from "@/components/pms/planning-grid";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { availabilityGrid, planning } from "@/server/modules/pms/stays";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { addDays, isDay } from "@/server/modules/pms/calc";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/planning">;
const DAYS = 14;

export default function PlanningPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Planning params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Room planning (tape chart): who sleeps in which room, night by night. */
async function Planning({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const settings = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const from = typeof sp.from === "string" && isDay(sp.from) ? sp.from : addDays(settings.businessDate, -1);
  const [t, plan, avail] = await Promise.all([
    getTranslations("pms.planning"),
    planning(db, ctx, from, DAYS),
    availabilityGrid(db, ctx, from, DAYS),
  ]);
  const base = `/dashboard/${ctx.restaurant.id}/planning`;
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <LiveRefresh types={["notification.created", "session.closed"]} />
      <PlanningGrid
        restaurantId={ctx.restaurant.id}
        nights={plan.nights}
        rooms={plan.rooms}
        stays={plan.stays}
        availability={avail.types.map((a) => ({ id: a.id, code: a.code, days: a.days }))}
        today={settings.businessDate}
        prevHref={`${base}?from=${addDays(from, -7)}`}
        nextHref={`${base}?from=${addDays(from, 7)}`}
        todayHref={base}
        canManage={can(ctx, "frontdesk.manage")}
      />
    </>
  );
}
