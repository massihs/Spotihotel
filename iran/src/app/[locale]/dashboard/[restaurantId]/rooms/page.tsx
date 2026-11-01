import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { RoomsBoard } from "@/components/hotel/rooms-board";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { roomsBoard } from "@/server/modules/hotel/rooms";
import { guestCallsOf } from "@/server/modules/team/sections";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/rooms">;

export default function RoomsPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Rooms params={params} />
    </Suspense>
  );
}

/** The front desk's view of the hotel: every room by floor, who is in, what it needs. */
async function Rooms({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const [t, board, options] = await Promise.all([
    getTranslations("hotel.rooms"),
    roomsBoard(db, ctx),
    guestCallsOf(db, ctx.restaurant.id, { room: true }),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <LiveRefresh
        types={["waiter.called", "notification.created", "order.created", "order.updated", "session.closed"]}
      />
      <RoomsBoard
        restaurantId={ctx.restaurant.id}
        timeZone={ctx.restaurant.timezone}
        currency={ctx.restaurant.currency}
        canAct={can(ctx, "orders.update_status")}
        canCheckOut={can(ctx, "sessions.close")}
        icons={Object.fromEntries(options.map((o) => [o.key, o.icon]))}
        floors={board.floors.map((f) => ({
          key: f.key,
          label: f.label == null ? null : String(f.label),
          numbered: typeof f.label === "number",
        }))}
        rooms={board.rooms.map((r) => ({
          id: r.id,
          label: r.label,
          capacity: r.capacity,
          floor: r.floor.key,
          housekeeping: r.housekeeping,
          housekeepingAt: r.housekeepingAt?.toISOString() ?? null,
          guests: r.session?.guests ?? null,
          since: r.session?.openedAt.toISOString() ?? null,
          todayCents: r.todayCents,
          requests: r.requests.map((q) => ({
            id: q.id,
            kind: q.kind,
            label: q.label,
            note: q.note,
            status: q.status,
            createdAt: q.createdAt.toISOString(),
          })),
          orders: r.orders.map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            totalCents: o.totalCents,
          })),
        }))}
      />
    </>
  );
}
