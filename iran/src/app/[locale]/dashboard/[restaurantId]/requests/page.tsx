import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { RequestsBoard } from "@/components/hotel/requests-board";
import { GuestCallsPanel } from "../team/guest-calls";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listRequests } from "@/server/modules/hotel/requests";
import { takersOf } from "@/server/modules/hotel/rooms";
import { CALL_ICONS, guestCallsOf, listGuestCalls, listSections } from "@/server/modules/team/sections";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/requests">;

export default function RequestsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Requests params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * The front desk of a hotel: what the rooms asked for (housekeeping, pressing, a taxi…) from
 * "new" to "done", and the services the rooms' bell offers.
 */
async function Requests({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ restaurantId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireRestaurant(restaurantId, "orders.view");
  const t = await getTranslations("hotel");
  const manage = can(ctx, "members.manage");
  const tab = sp.tab === "services" && manage ? "services" : "board";
  const base = `/dashboard/${ctx.restaurant.id}/requests`;
  const [rows, options] = await Promise.all([
    tab === "board" ? listRequests(db, ctx) : Promise.resolve([]),
    guestCallsOf(db, ctx.restaurant.id, { room: true }),
  ]);
  const icons = Object.fromEntries(options.map((o) => [o.key, o.icon]));
  const takers = await takersOf(
    db,
    rows.map((r) => r.takenByUserId),
  );
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav
        className="-mx-4 mb-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4"
        aria-label={t("title")}
      >
        {(["board", ...(manage ? ["services"] : [])] as const).map((k) => (
          <Link
            key={k}
            href={k === "board" ? base : `${base}?tab=${k}`}
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
      {tab === "board" ? (
        <>
          <LiveRefresh types={["waiter.called", "notification.created"]} />
          <RequestsBoard
            restaurantId={ctx.restaurant.id}
            timeZone={ctx.restaurant.timezone}
            canAct={can(ctx, "orders.update_status")}
            icons={icons}
            requests={rows.map((r) => ({
              id: r.id,
              room: r.placeLabel,
              kind: r.kind,
              label: r.label,
              note: r.note,
              status: r.status,
              createdAt: r.createdAt.toISOString(),
              takenAt: r.takenAt?.toISOString() ?? null,
              takenBy: r.takenByUserId ? (takers.get(r.takenByUserId) ?? null) : null,
              doneAt: r.doneAt?.toISOString() ?? null,
            }))}
          />
        </>
      ) : (
        <ServicesTab restaurantId={ctx.restaurant.id} />
      )}
    </>
  );
}

async function ServicesTab({ restaurantId }: { restaurantId: string }) {
  const ctx = await requireRestaurant(restaurantId, "members.manage");
  const [calls, sections] = await Promise.all([listGuestCalls(db, ctx), listSections(db, ctx)]);
  return (
    <GuestCallsPanel
      restaurantId={ctx.restaurant.id}
      calls={calls}
      sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      icons={[...CALL_ICONS]}
      hotel
    />
  );
}
