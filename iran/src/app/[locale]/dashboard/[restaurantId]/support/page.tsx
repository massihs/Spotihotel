import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskConsole } from "@/components/support/desk-console";
import { OpenTeamChat } from "@/components/support/open-team-chat";
import { requireRestaurant } from "@/server/auth/current";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/support">;

export default function SupportPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Support params={params} />
    </Suspense>
  );
}

async function Support({ params }: Pick<Props, "params">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const t = await getTranslations("support");
  return (
    <>
      <PageHeader title={t("pageTitle")} description={t("pageSubtitle")} actions={<OpenTeamChat />} />
      <DeskConsole restaurantId={ctx.restaurant.id} />
    </>
  );
}
