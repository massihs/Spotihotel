import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { DEFAULT_CATEGORY_TEMPLATES } from "@/server/modules/catalog/defaults";
import { listCategories } from "@/server/modules/menu/categories";
import { listProducts } from "@/server/modules/menu/products";
import { MenuBoard } from "./menu-board";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/menu">;

export default function MenuPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Menu params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Menu({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.view");
  const sp = await searchParams;
  const [t, tRouting, categories] = await Promise.all([
    getTranslations("menu"),
    getTranslations("routing"),
    listCategories(db, ctx),
  ]);
  const wanted = typeof sp.category === "string" ? sp.category : undefined;
  const selected = categories.find((c) => c.id === wanted) ?? categories[0] ?? null;
  // Every dish: the board searches and filters the whole menu.
  const products = await listProducts(db, ctx);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            {can(ctx, "menu.manage") ? (
              <Link
                href={`/dashboard/${ctx.restaurant.id}/menu/import`}
                className={buttonClasses("secondary")}
              >
                {t("importLink")}
              </Link>
            ) : null}
            <Link
              href={`/dashboard/${ctx.restaurant.id}/menu/stations`}
              className={buttonClasses("secondary")}
            >
              {tRouting("menuLink")}
            </Link>
            <Link
              href={`/dashboard/${ctx.restaurant.id}/menu/nutrition`}
              className={buttonClasses("secondary")}
            >
              {t("nutritionLink")}
            </Link>
            <Link
              href={`/dashboard/${ctx.restaurant.id}/menu/options`}
              className={buttonClasses("secondary")}
            >
              {t("optionsLink")}
            </Link>
          </>
        }
      />
      <MenuBoard
        restaurantId={ctx.restaurant.id}
        categories={categories}
        selected={selected}
        products={products}
        currency={ctx.restaurant.currency}
        canManage={can(ctx, "menu.manage")}
        canFlag={can(ctx, "menu.manage") || can(ctx, "orders.update_status")}
        templates={[...DEFAULT_CATEGORY_TEMPLATES]}
      />
    </>
  );
}
