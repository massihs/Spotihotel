import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { MaintenanceBoard } from "@/components/hotel/housekeeping-ui";
import { CategoriesForm, EquipmentPanel, PreventiveList } from "@/components/hotel/modules-ui";
import { periodOf } from "@/components/hotel/service-module";
import { DeskActions, DeskTable, DeskTabs, PeriodForm, tableCsv } from "@/components/pms/desk-table";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { diningTables } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { hotelStaff, listTickets } from "@/server/modules/hotel/housekeeping";
import { engineeringReport, listEquipment } from "@/server/modules/hotel/engineering";
import { servicesSettings } from "@/server/modules/hotel/services";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/engineering">;
const TABS = ["orders", "equipment", "preventive", "reports", "settings"] as const;

export default function EngineeringPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Engineering {...props} />
    </Suspense>
  );
}

/** فنی و مهندسی: repair orders, the equipment register, preventive maintenance, reports, settings. */
async function Engineering({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "orders";
  const t = await getTranslations("engineering");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/engineering`;
  const { from, to, today } = await periodOf(ctx, sp, 29);
  const rooms = await db
    .select({ id: diningTables.id, label: diningTables.label })
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room")))
    .orderBy(asc(diningTables.number), asc(diningTables.label));
  const conf = (await servicesSettings(db, rid, ctx.restaurant.timezone)).engineering;
  let body: React.ReactNode;
  if (tab === "orders") {
    const staff = await hotelStaff(db, rid);
    body = (
      <MaintenanceBoard
        restaurantId={rid}
        today={today}
        rooms={rooms}
        staff={staff.map((m) => ({ ...m, rooms: 0 }))}
        tickets={(await listTickets(db, ctx)).map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }))}
      />
    );
  } else if (tab === "equipment") {
    body = (
      <EquipmentPanel
        rid={rid}
        list={await listEquipment(db, ctx)}
        categories={conf.categories}
        rooms={rooms}
        canManage={can(ctx, "tables.manage")}
        today={today}
      />
    );
  } else if (tab === "preventive") {
    body = <PreventiveList rid={rid} list={await listEquipment(db, ctx)} today={today} />;
  } else if (tab === "reports") {
    const rep = await engineeringReport(db, ctx, from, to);
    const cur = ctx.restaurant.currency;
    const s = rep.summary;
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <DeskActions csv={await tableCsv(rep.tickets, cur)} />
        <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(["total", "open", "done", "urgent", "avgHours", "services"] as const).map((k) => (
            <div
              key={k}
              className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
            >
              <dt className="text-xs text-fg-muted">{t(`report.${k}`)}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{s[k]}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-bold">{t("report.tickets")}</h2>
            <DeskTable table={rep.tickets} currency={cur} timeZone={ctx.restaurant.timezone} />
          </section>
          <section>
            <h2 className="mb-2 font-bold">{t("report.serviceLog")}</h2>
            <DeskTable table={rep.services} currency={cur} timeZone={ctx.restaurant.timezone} />
          </section>
        </div>
      </>
    );
  } else {
    body = <CategoriesForm rid={rid} values={conf} />;
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="engineering" />
      {body}
    </>
  );
}
