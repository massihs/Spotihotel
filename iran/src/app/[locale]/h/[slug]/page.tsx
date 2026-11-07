import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { onlineHotel } from "@/server/modules/pms/online";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { OnlineBooking } from "@/components/pms/online-booking";

type Props = PageProps<"/[locale]/h/[slug]">;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onlineBooking");
  return { title: t("metaTitle") };
}

export default function HotelBookingPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="min-h-dvh animate-pulse bg-surface-2" />}>
      <HotelBooking params={params} />
    </Suspense>
  );
}

/** The hotel's own booking engine: guests book a room directly, without a platform. */
async function HotelBooking({ params }: Pick<Props, "params">) {
  await connection();
  const { slug } = await params;
  const hotel = await onlineHotel(db, slug);
  if (!hotel) notFound();
  const { businessDate } = await getPmsSettings(db, hotel.id, hotel.timezone);
  return (
    <div data-brand={hotel.brandColor} data-kind="hotel">
      <OnlineBooking
        slug={hotel.slug}
        hotel={{ name: hotel.name, city: hotel.city, address: hotel.addressLine1, phone: hotel.phone }}
        currency={hotel.currency}
        today={businessDate}
      />
    </div>
  );
}
