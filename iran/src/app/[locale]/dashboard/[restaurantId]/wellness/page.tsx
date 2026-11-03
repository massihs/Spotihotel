import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { WellnessBoard } from "@/components/pms/wellness-board";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { diningTables, hotelGuests, stays } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { wellnessDay } from "@/server/modules/pms/wellness";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/wellness">;

export default function WellnessPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Wellness params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Spa, sauna, pool, massage…: the day's bookings by service, and booking a slot. */
async function Wellness({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const [t, data, guests] = await Promise.all([
    getTranslations("pms.wellness"),
    wellnessDay(db, ctx, typeof sp.day === "string" ? sp.day : undefined),
    db
      .select({
        id: stays.id,
        room: diningTables.label,
        lastName: hotelGuests.lastName,
        firstName: hotelGuests.firstName,
      })
      .from(stays)
      .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
      .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
      .where(and(eq(stays.restaurantId, rid), inArray(stays.status, ["in_house", "confirmed"])))
      .orderBy(diningTables.label),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <LiveRefresh types={["notification.created"]} />
      <WellnessBoard
        restaurantId={rid}
        currency={ctx.restaurant.currency}
        timeZone={ctx.restaurant.timezone}
        day={data.day}
        services={data.services.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
          capacity: s.capacity,
          active: s.active,
        }))}
        bookings={data.bookings.map((b) => ({
          id: b.id,
          serviceId: b.serviceId,
          guestName: b.guestName,
          roomLabel: b.roomLabel,
          startsAt: b.startsAt.toISOString(),
          people: b.people,
          status: b.status,
          staffName: b.staffName,
          priceCents: b.priceCents,
        }))}
        inHouse={guests.map((g) => ({
          id: g.id,
          label: `${g.room ?? "—"} | ${[g.lastName, g.firstName].filter(Boolean).join(" ")}`,
        }))}
        preselectStay={typeof sp.stay === "string" ? sp.stay : null}
        canManage={can(ctx, "frontdesk.manage")}
      />
    </>
  );
}
