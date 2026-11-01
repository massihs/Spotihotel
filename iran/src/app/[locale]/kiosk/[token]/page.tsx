import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlaceHeader } from "@/components/reservations/place-header";
import { db } from "@/server/db/client";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { getKioskStore } from "@/server/modules/online/service";
import { OrderApp } from "../../r/[slug]/order/order-app";

type Props = PageProps<"/[locale]/kiosk/[token]">;

/** The counter tablet's page: its link is the credential, never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function KioskPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse bg-surface-2" />}>
      <Kiosk params={params} />
    </Suspense>
  );
}

async function Kiosk({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const store = await getKioskStore(db, token);
  if (!store) notFound();
  const [menu, t] = await Promise.all([getPublicMenu(store.id), getTranslations("online")]);
  return (
    <div data-brand={store.brandColor} className="min-h-dvh bg-bg">
      <PlaceHeader name={store.name} logoKey={store.logoKey} title={t("kioskTitle")} />
      <main className="relative mx-auto -mt-8 max-w-4xl rounded-t-3xl bg-bg pt-2">
        <OrderApp
          kioskToken={token}
          slug={store.slug}
          menu={menu}
          currency={store.currency}
          takeaway
          delivery={false}
          zones={[]}
          signedIn={false}
          hasPhone={false}
          defaultName=""
        />
      </main>
    </div>
  );
}
