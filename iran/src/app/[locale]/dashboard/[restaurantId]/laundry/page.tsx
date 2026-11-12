import { Suspense } from "react";
import { ServiceModule } from "@/components/hotel/service-module";
import { requireRestaurant } from "@/server/auth/current";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/laundry">;

export default function LaundryPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Laundry {...props} />
    </Suspense>
  );
}

/** لاندری: price list, bags registered per room, their progress, the cash desk and reports. */
async function Laundry({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  return <ServiceModule ctx={ctx} kind="laundry" path="laundry" sp={await searchParams} />;
}
