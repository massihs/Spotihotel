import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { MenuImport } from "./menu-import";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/menu/import">;

export default function MenuImportPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <ImportPage {...props} />
    </Suspense>
  );
}

async function ImportPage({ params }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.manage");
  const t = await getTranslations("menuImport");
  return (
    <div className="xl:max-w-5xl">
      <Link href={`/dashboard/${ctx.restaurant.id}/menu`} className="text-sm text-fg-muted hover:text-fg">
        ← {t("back")}
      </Link>
      <div className="mt-2">
        <PageHeader title={t("title")} description={t("subtitle")} />
      </div>
      <Card className="p-5 sm:p-6">
        <MenuImport restaurantId={ctx.restaurant.id} currency={ctx.restaurant.currency} />
      </Card>
      <p className="mt-4 text-sm text-fg-muted">{t("help")}</p>
    </div>
  );
}
