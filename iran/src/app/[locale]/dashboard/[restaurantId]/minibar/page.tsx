import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskActions, DeskTable, DeskTabs, PeriodForm, tableCsv } from "@/components/pms/desk-table";
import { MinibarPanel } from "@/components/pms/setup-panels";
import { MinibarRegister, MinibarSettings } from "@/components/hotel/modules-ui";
import { periodOf } from "@/components/hotel/service-module";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listMinibar } from "@/server/modules/pms/minibar";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { inHouseRooms } from "@/server/modules/hotel/services";
import { minibarReport } from "@/server/modules/hotel/hk-extra";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/minibar">;
const TABS = ["register", "base", "reports", "settings"] as const;

export default function MinibarPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Minibar {...props} />
    </Suspense>
  );
}

/** مینی بار: what a room took (charged to its bill), the minibar list, consumption reports. */
async function Minibar({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "register";
  const t = await getTranslations("minibarx");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/minibar`;
  const currency = ctx.restaurant.currency;
  let body: React.ReactNode;
  if (tab === "register") {
    const [items, rooms] = await Promise.all([listMinibar(db, rid, true), inHouseRooms(db, rid)]);
    body = <MinibarRegister rid={rid} currency={currency} items={items} rooms={rooms} />;
  } else if (tab === "base") {
    body = <MinibarPanel restaurantId={rid} currency={currency} items={await listMinibar(db, rid)} />;
  } else if (tab === "reports") {
    const { from, to } = await periodOf(ctx, sp, 29);
    const rep = await minibarReport(db, ctx, from, to);
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <DeskActions csv={await tableCsv(rep.byItem, currency)} />
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-bold">{t("byItem")}</h2>
            <DeskTable table={rep.byItem} currency={currency} />
          </section>
          <section>
            <h2 className="mb-2 font-bold">{t("byRoom")}</h2>
            <DeskTable table={rep.byRoom} currency={currency} />
          </section>
        </div>
      </>
    );
  } else {
    const s = await getPmsSettings(db, rid, ctx.restaurant.timezone);
    body = <MinibarSettings rid={rid} selfService={s.minibarSelfService} />;
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="minibarx" />
      {body}
    </>
  );
}
