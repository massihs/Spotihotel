import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { HousekeepingPlan, MaintenanceBoard, MyRooms } from "@/components/hotel/housekeeping-ui";
import { CreditsForm, HkOperations, Logbook } from "@/components/hotel/modules-ui";
import { SettingsForm } from "@/components/hotel/services-ui";
import { HkRack } from "@/components/hotel/hk-rack";
import { periodOf } from "@/components/hotel/service-module";
import { DeskActions, DeskTable, DeskTabs, PeriodForm, tableCsv } from "@/components/pms/desk-table";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { roomTypes } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { housekeepingPlan, listTickets } from "@/server/modules/hotel/housekeeping";
import { servicesSettings } from "@/server/modules/hotel/services";
import { cleaningReport, listLogbook } from "@/server/modules/hotel/hk-extra";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/housekeeping">;
/** As in the reference PMS: base data, cleaning rack, logbook, operations, housekeeping rack, reports, settings. */
const TABS = [
  "base",
  "plan",
  "log",
  "operations",
  "rack",
  "reports",
  "settings",
  "mine",
  "maintenance",
] as const;
const STAFF_TABS = ["plan", "log", "rack", "mine", "maintenance"] as const;

export default function HousekeepingPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Housekeeping {...props} />
    </Suspense>
  );
}

/** خانه داری: today's plan, the racks, the logbook, bulk operations, reports and settings. */
async function Housekeeping({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  // The supervisor (gouvernante): whoever may manage the rooms.
  const manage = can(ctx, "tables.manage");
  const sp = await searchParams;
  const tabs = manage ? TABS : STAFF_TABS;
  const tab = (tabs as readonly string[]).find((x) => x === sp.tab) ?? (manage ? "plan" : "mine");
  const [t, plan] = await Promise.all([getTranslations("housekeeping"), housekeepingPlan(db, ctx)]);
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/housekeeping`;
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
  const floors = plan.floors.map((f) => ({
    key: f.key,
    label: f.label == null ? null : String(f.label),
    numbered: typeof f.label === "number",
  }));
  const roomList = rooms.map((r) => ({ id: r.id, label: r.label }));
  let body: React.ReactNode;
  if (tab === "plan") {
    body = (
      <HousekeepingPlan
        restaurantId={rid}
        rooms={rooms}
        floors={floors}
        staff={plan.staff}
        counts={plan.counts}
        canManage={manage}
      />
    );
  } else if (tab === "mine") {
    body = <MyRooms restaurantId={rid} rooms={rooms.filter((r) => r.housekeeperUserId === ctx.user.id)} />;
  } else if (tab === "maintenance") {
    body = (
      <MaintenanceBoard
        restaurantId={rid}
        today={plan.businessDate}
        rooms={roomList}
        staff={plan.staff}
        tickets={(await listTickets(db, ctx)).map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }))}
      />
    );
  } else if (tab === "rack") {
    body = <HkRack rooms={rooms} floors={floors} />;
  } else if (tab === "log") {
    const { from, to } = await periodOf(ctx, sp, 2);
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <Logbook
          rid={rid}
          rows={await listLogbook(db, ctx, from, to)}
          rooms={roomList}
          timeZone={ctx.restaurant.timezone}
        />
      </>
    );
  } else if (tab === "operations") {
    body = <HkOperations rid={rid} />;
  } else if (tab === "reports") {
    const { from, to } = await periodOf(ctx, sp, 6);
    const table = await cleaningReport(db, ctx, from, to);
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <DeskActions csv={await tableCsv(table, ctx.restaurant.currency)} />
        <DeskTable table={table} currency={ctx.restaurant.currency} />
      </>
    );
  } else {
    const conf = (await servicesSettings(db, rid, ctx.restaurant.timezone)).housekeeping;
    if (tab === "base") {
      const types = await db
        .select({ id: roomTypes.id, code: roomTypes.code, name: roomTypes.name })
        .from(roomTypes)
        .where(eq(roomTypes.restaurantId, rid))
        .orderBy(asc(roomTypes.code));
      const tx = await getTranslations("hkx");
      body = (
        <div className="grid gap-5 lg:grid-cols-2">
          <CreditsForm rid={rid} types={types} values={conf} />
          <section className="h-fit rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
            <h3 className="font-bold">{tx("base.staff")}</h3>
            <p className="mb-3 text-sm text-fg-muted">{tx("base.staffHint")}</p>
            <ul className="divide-y divide-border">
              {plan.staff.map((s) => (
                <li key={s.userId} className="flex justify-between py-2 text-sm">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-fg-muted">
                    {rooms.filter((r) => r.housekeeperUserId === s.userId).length} {tx("base.roomsToday")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      );
    } else {
      body = (
        <SettingsForm
          rid={rid}
          section="housekeeping"
          ns="hkx"
          values={conf}
          fields={[
            { key: "dirtyStayoversDaily", type: "bool" },
            { key: "inspectionRequired", type: "bool" },
          ]}
        />
      );
    }
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <LiveRefresh types={["notification.created", "session.closed"]} />
      <DeskTabs base={base} tabs={tabs} current={tab} ns="housekeeping" />
      {body}
    </>
  );
}
