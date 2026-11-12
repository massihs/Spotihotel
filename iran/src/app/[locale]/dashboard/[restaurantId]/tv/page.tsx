import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskActions, DeskTable, DeskTabs, PeriodForm, tableCsv } from "@/components/pms/desk-table";
import { TvBoard, TvPackages } from "@/components/hotel/modules-ui";
import { SettingsForm } from "@/components/hotel/services-ui";
import { periodOf } from "@/components/hotel/service-module";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { servicesSettings } from "@/server/modules/hotel/services";
import { tvActivity, tvBoard } from "@/server/modules/hotel/tv";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/tv">;
const TABS = ["rooms", "activity", "settings"] as const;

export default function TvPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Tv {...props} />
    </Suspense>
  );
}

/** تلویزیون تحت شبکه: each room's TV, the activity report, packages and automation. */
async function Tv({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "rooms";
  const t = await getTranslations("tv");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/tv`;
  const conf = (await servicesSettings(db, rid, ctx.restaurant.timezone)).tv;
  let body: React.ReactNode;
  if (tab === "rooms") {
    const rooms = await tvBoard(db, ctx);
    body = (
      <TvBoard
        rid={rid}
        rooms={rooms.map((r) => ({ ...r, since: undefined }))}
        packages={conf.packages.map((p) => p.name)}
      />
    );
  } else if (tab === "activity") {
    const { from, to } = await periodOf(ctx, sp, 6);
    const table = await tvActivity(db, ctx, from, to);
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <DeskActions csv={await tableCsv(table, ctx.restaurant.currency)} />
        <DeskTable table={table} currency={ctx.restaurant.currency} timeZone={ctx.restaurant.timezone} />
      </>
    );
  } else {
    body = (
      <div className="space-y-5">
        <SettingsForm
          rid={rid}
          section="tv"
          ns="tv"
          values={conf}
          fields={[
            { key: "autoActivate", type: "bool" },
            { key: "deactivateOnCheckout", type: "bool" },
            { key: "welcome", type: "text", max: 300, multiline: true },
            { key: "server", type: "text", max: 200 },
          ]}
        />
        <TvPackages rid={rid} currency={ctx.restaurant.currency} values={conf} />
      </div>
    );
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="tv" />
      {body}
    </>
  );
}
