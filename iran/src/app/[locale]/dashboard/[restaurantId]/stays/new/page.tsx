import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { BookingDesk } from "@/components/pms/booking-desk";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getPmsSettings, listRoomTypes } from "@/server/modules/pms/setup";
import { listAccounts } from "@/server/modules/pms/guests";
import { isDay } from "@/server/modules/pms/calc";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/stays/new">;

export default function NewStayPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <NewStay params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function NewStay({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.manage");
  const rid = ctx.restaurant.id;
  const [t, settings, types, accounts] = await Promise.all([
    getTranslations("pms.book"),
    getPmsSettings(db, rid, ctx.restaurant.timezone),
    listRoomTypes(db, rid),
    listAccounts(db, rid),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {!types.length ? <p className="mb-4 rounded-xl bg-warning-soft p-4 text-sm">{t("noTypes")}</p> : null}
      <BookingDesk
        restaurantId={rid}
        currency={ctx.restaurant.currency}
        today={settings.businessDate}
        accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        canNegotiate={can(ctx, "folio.adjust")}
        initial={{
          roomTypeId: typeof sp.type === "string" ? sp.type : undefined,
          arrival: typeof sp.arrival === "string" && isDay(sp.arrival) ? sp.arrival : undefined,
          departure: typeof sp.departure === "string" && isDay(sp.departure) ? sp.departure : undefined,
          roomId: typeof sp.room === "string" ? sp.room : undefined,
          source: typeof sp.source === "string" ? sp.source : undefined,
        }}
      />
    </>
  );
}
