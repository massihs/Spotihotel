import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { QueueForm } from "@/components/reservations/public-ui";
import { PlaceHeader } from "@/components/reservations/place-header";
import { db } from "@/server/db/client";
import { placeBySlug } from "@/server/modules/reservations/service";

type Props = PageProps<"/[locale]/r/[slug]/queue">;

export default function QueuePage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Queue params={params} />
    </Suspense>
  );
}

async function Queue({ params }: Pick<Props, "params">) {
  const { slug } = await params;
  const place = await placeBySlug(db, slug);
  if (!place?.enabled) notFound();
  const t = await getTranslations("booking");
  return (
    <div data-brand={place.brandColor}>
      <PlaceHeader name={place.name} logoKey={place.logoKey} title={t("queueTitle")} />
      <main className="relative mx-auto -mt-8 max-w-md rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        <p className="mb-4 text-sm text-fg-muted">{t("queueHint")}</p>
        <QueueForm slug={slug} />
      </main>
    </div>
  );
}
