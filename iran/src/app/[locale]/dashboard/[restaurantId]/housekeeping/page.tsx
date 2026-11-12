import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import { HousekeepingPlan, MaintenanceBoard, MyRooms } from "@/components/hotel/housekeeping-ui";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { housekeepingPlan, listTickets } from "@/server/modules/hotel/housekeeping";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/housekeeping">;
const TABS = ["plan", "mine", "maintenance"] as const;

export default function HousekeepingPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Housekeeping {...props} />
    </Suspense>
  );
}

/** Housekeeping and maintenance: today's plan, each housekeeper's list, the repairs. */
async function Housekeeping({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  // The supervisor (gouvernante): whoever may manage the rooms.
  const manage = can(ctx, "tables.manage");
  const asked = (await searchParams).tab;
  const tab = TABS.find((x) => x === asked) ?? (manage ? "plan" : "mine");
  const [t, plan] = await Promise.all([getTranslations("housekeeping"), housekeepingPlan(db, ctx)]);
  const base = `/dashboard/${ctx.restaurant.id}/housekeeping`;
  const rooms = plan.rooms.map((r) => ({
    id: r.id,
    label: r.label,
    typeCode: r.typeCode,
    housekeeping: r.housekeeping,
    floor: r.floor.key,
    occupancy: r.occupancy,
    eta: r.eta,
    priority: r.priority,
    housekeeperUserId: r.housekeeperUserId,
    tickets: r.tickets,
  }));
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <LiveRefresh types={["notification.created", "session.closed"]} />
      <nav className="seg mb-5 print:hidden" aria-label={t("title")}>
        {TABS.map((x) => (
          <Link
            key={x}
            href={`${base}?tab=${x}`}
            aria-current={x === tab ? "page" : undefined}
            className="seg-item"
          >
            {t(`tabs.${x}`)}
          </Link>
        ))}
      </nav>
      {tab === "plan" ? (
        <HousekeepingPlan
          restaurantId={ctx.restaurant.id}
          rooms={rooms}
          floors={plan.floors.map((f) => ({
            key: f.key,
            label: f.label == null ? null : String(f.label),
            numbered: typeof f.label === "number",
          }))}
          staff={plan.staff}
          counts={plan.counts}
          canManage={manage}
        />
      ) : tab === "mine" ? (
        <MyRooms
          restaurantId={ctx.restaurant.id}
          rooms={rooms.filter((r) => r.housekeeperUserId === ctx.user.id)}
        />
      ) : (
        <MaintenanceBoard
          restaurantId={ctx.restaurant.id}
          today={plan.businessDate}
          rooms={rooms.map((r) => ({ id: r.id, label: r.label }))}
          staff={plan.staff}
          tickets={(await listTickets(db, ctx)).map((k) => ({
            ...k,
            createdAt: k.createdAt.toISOString(),
          }))}
        />
      )}
    </>
  );
}
