import { Suspense } from "react";
import { ServiceModule } from "@/components/hotel/service-module";
import { requireRestaurant } from "@/server/auth/current";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/damages">;

export default function DamagesPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Damages {...props} />
    </Suspense>
  );
}

/** خسارت: damage price list, damages recorded per room, settled on the bill or at the desk. */
async function Damages({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  return <ServiceModule ctx={ctx} kind="damage" path="damages" sp={await searchParams} />;
}
