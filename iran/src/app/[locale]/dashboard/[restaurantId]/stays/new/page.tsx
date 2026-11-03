import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { StayForm } from "@/components/pms/stay-form";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getPmsSettings, listRatePlans, listRoomTypes } from "@/server/modules/pms/setup";
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
  const [t, settings, types, plans, accounts] = await Promise.all([
    getTranslations("pms.book"),
    getPmsSettings(db, rid, ctx.restaurant.timezone),
    listRoomTypes(db, rid),
    listRatePlans(db, rid, true),
    listAccounts(db, rid),
  ]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <StayForm
        restaurantId={rid}
        currency={ctx.restaurant.currency}
        today={settings.businessDate}
        types={types.map((x) => ({ id: x.id, code: x.code, name: x.name, maxOccupancy: x.maxOccupancy }))}
        plans={plans.map((p) => ({ id: p.id, code: p.code, name: p.name, isDefault: p.isDefault }))}
        accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
        canNegotiate={can(ctx, "folio.adjust")}
        initial={{
          roomTypeId: typeof sp.type === "string" ? sp.type : undefined,
          arrival: typeof sp.arrival === "string" && isDay(sp.arrival) ? sp.arrival : undefined,
        }}
      />
    </>
  );
}
