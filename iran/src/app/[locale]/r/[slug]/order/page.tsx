import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlaceHeader } from "@/components/reservations/place-header";
import { getCurrentDiner } from "@/server/auth/diner";
import { db } from "@/server/db/client";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { getOnlineStore } from "@/server/modules/online/service";
import { OrderApp } from "./order-app";

type Props = PageProps<"/[locale]/r/[slug]/order">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getOnlineStore(db, slug).catch(() => null);
  const t = await getTranslations("online");
  return store ? { title: t("metaTitle", { name: store.name }) } : {};
}

export default function OnlineOrderPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse bg-surface-2" />}>
      <Online params={params} />
    </Suspense>
  );
}

async function Online({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const store = await getOnlineStore(db, slug);
  if (!store) notFound();
  const [menu, diner, t] = await Promise.all([
    getPublicMenu(store.id),
    getCurrentDiner(),
    getTranslations("online"),
  ]);
  return (
    <div data-brand={store.brandColor}>
      <PlaceHeader name={store.name} logoKey={store.logoKey} title={t("title")} />
      <main className="relative mx-auto -mt-8 max-w-3xl rounded-t-3xl bg-bg pt-2">
        <OrderApp
          slug={store.slug}
          menu={menu}
          currency={store.currency}
          takeaway={store.takeaway}
          delivery={store.delivery}
          zones={store.zones}
          signedIn={Boolean(diner)}
          hasPhone={Boolean(diner?.phone)}
          defaultName={diner?.name ?? ""}
        />
      </main>
    </div>
  );
}
