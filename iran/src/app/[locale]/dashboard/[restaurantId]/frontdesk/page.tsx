import { Suspense } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { BedDouble, CalendarPlus, FileDown, Gauge, TrendingUp, Users } from "lucide-react";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { PageHeader } from "@/components/dashboard/app-shell";
import { StatCard } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { LiveRefresh } from "@/components/realtime/live";
import { FrontDeskBoard } from "@/components/pms/frontdesk-board";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { diningTables, stays } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { getMoney } from "@/lib/money-server";
import { frontDesk } from "@/server/modules/pms/stays";
import { auditPreflight } from "@/server/modules/pms/night-audit";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/frontdesk">;

export default function FrontDeskPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <FrontDesk params={params} />
    </Suspense>
  );
}

async function FrontDesk({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const locale = await getLocale();
  const [t, money, desk, preflight, rooms, occupied] = await Promise.all([
    getTranslations("pms.desk"),
    getMoney(ctx.restaurant.currency),
    frontDesk(db, ctx),
    auditPreflight(db, ctx),
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        roomTypeId: diningTables.roomTypeId,
        housekeeping: diningTables.housekeeping,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      )
      .orderBy(diningTables.number, diningTables.label),
    db
      .select({ roomId: stays.roomId })
      .from(stays)
      .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"))),
  ]);
  const busy = new Set(occupied.map((o) => o.roomId));
  const f = desk.figures;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <a
              href={`${locale === DEFAULT_LOCALE ? "" : `/${locale}`}/dashboard/${rid}/frontdesk/travellers?day=${desk.businessDate}`}
              className={buttonClasses("secondary", "md")}
            >
              <FileDown className="size-4" aria-hidden="true" />
              {t("travellers")}
            </a>
            {can(ctx, "frontdesk.manage") ? (
              <Link href={`/dashboard/${rid}/stays/new`} className={buttonClasses("primary", "md")}>
                <CalendarPlus className="size-4" aria-hidden="true" />
                {t("newBooking")}
              </Link>
            ) : null}
          </>
        }
      />
      <LiveRefresh types={["notification.created", "session.closed", "order.created"]} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("occupancy")}
          value={`${f.occupancyPct}%`}
          hint={t("roomsSold", { sold: f.sold, rooms: f.rooms })}
          icon={<Gauge />}
          tone="ink"
        />
        <StatCard label={t("adr")} value={money(f.adrCents)} icon={<TrendingUp />} tone="indigo" />
        <StatCard label={t("revpar")} value={money(f.revparCents)} icon={<BedDouble />} tone="teal" />
        <StatCard label={t("guests")} value={f.guests} icon={<Users />} tone="amber" />
      </div>
      <FrontDeskBoard
        restaurantId={rid}
        currency={ctx.restaurant.currency}
        businessDate={desk.businessDate}
        arrivals={desk.arrivals}
        departures={desk.departures}
        inHouse={desk.inHouse}
        rooms={rooms.map((r) => ({ ...r, occupied: busy.has(r.id) }))}
        preflight={{ dueOut: preflight.dueOut.length, noShows: preflight.noShows.length }}
        canManage={can(ctx, "frontdesk.manage")}
      />
    </>
  );
}
