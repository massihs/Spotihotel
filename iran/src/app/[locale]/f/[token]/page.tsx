import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PlaceHeader } from "@/components/reservations/place-header";
import { db } from "@/server/db/client";
import { getFeedbackPage } from "@/server/modules/feedback/service";
import { FeedbackForm } from "./feedback-form";

type Props = PageProps<"/[locale]/f/[token]">;

/** A guest's survey link is personal: never indexed. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function FeedbackPage({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <Feedback params={params} />
    </Suspense>
  );
}

async function Feedback({ params }: Pick<Props, "params">) {
  const { token } = await params;
  const page = await getFeedbackPage(db, token);
  if (!page) notFound();
  const t = await getTranslations("feedbackPage");
  return (
    <div data-brand={page.brandColor} className="min-h-dvh bg-bg">
      <PlaceHeader name={page.restaurantName} logoKey={page.logoKey} title={t("title")} />
      <main className="relative mx-auto -mt-8 max-w-md rounded-t-3xl bg-bg px-4 pt-6 pb-12">
        <p className="mb-6 text-center text-sm text-fg-muted">
          {t("subtitle", { number: page.orderNumber })}
        </p>
        <FeedbackForm
          token={token}
          initialRating={page.rating}
          wheel={page.wheel}
          initialPrize={page.prize}
        />
      </main>
    </div>
  );
}
