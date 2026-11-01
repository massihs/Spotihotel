import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { listCategories } from "@/server/modules/menu/categories";
import { listOptionGroups } from "@/server/modules/menu/options";
import { getProduct } from "@/server/modules/menu/products";
import { ALLERGENS, MAX_PRODUCT_IMAGES, SUGGESTED_TAGS } from "@/server/modules/menu/schemas";
import { listTaxRates } from "@/server/modules/restaurants/settings";
import { DeleteProductButton, ProductForm, ProductPhotos, type ProductValues } from "./product-form";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/menu/products/[productId]">;

export default function ProductPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <ProductEditor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductEditor({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId, productId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.manage");
  const sp = await searchParams;
  const isNew = productId === "new";
  const rid = ctx.restaurant.id;

  const [t, categories, rates, groups] = await Promise.all([
    getTranslations("product"),
    listCategories(db, ctx),
    listTaxRates(db, ctx),
    listOptionGroups(db, ctx),
  ]);

  let product: Awaited<ReturnType<typeof getProduct>> | null = null;
  if (!isNew) {
    try {
      product = await getProduct(db, ctx, productId);
    } catch (e) {
      if (isAppError(e) && e.code === "NOT_FOUND") notFound();
      throw e;
    }
  }

  const wantedCategory = typeof sp.category === "string" ? sp.category : undefined;
  const categoryId =
    product?.categoryId ?? categories.find((c) => c.id === wantedCategory)?.id ?? categories[0]?.id;
  if (!categoryId) notFound(); // a product needs a category

  const values: ProductValues = product
    ? {
        id: product.id,
        categoryId: product.categoryId,
        name: product.name,
        description: product.description,
        priceCents: product.priceCents,
        compareAtPriceCents: product.compareAtPriceCents,
        takeawayPriceCents: product.takeawayPriceCents,
        deliveryPriceCents: product.deliveryPriceCents,
        taxRateId: product.taxRateId,
        ingredients: product.ingredients,
        allergens: product.allergens,
        caloriesKcal: product.caloriesKcal,
        weightGrams: product.weightGrams,
        nutrition: product.nutrition,
        nutritionSource: product.nutritionSource,
        tags: product.tags,
        isActive: product.isActive,
        isAvailable: product.isAvailable,
        isFeatured: product.isFeatured,
        optionGroupIds: product.optionGroupIds,
      }
    : {
        categoryId,
        name: "",
        description: null,
        priceCents: null,
        compareAtPriceCents: null,
        takeawayPriceCents: null,
        deliveryPriceCents: null,
        taxRateId: null,
        ingredients: null,
        allergens: [],
        caloriesKcal: null,
        weightGrams: null,
        nutrition: null,
        nutritionSource: null,
        tags: [],
        isActive: true,
        isAvailable: true,
        isFeatured: false,
        optionGroupIds: [],
      };

  return (
    <>
      <Link
        href={`/dashboard/${rid}/menu?category=${categoryId}`}
        className="text-sm text-fg-muted hover:text-fg"
      >
        ← {t("back")}
      </Link>
      <div className="mt-2">
        <PageHeader
          title={product ? product.name : t("new")}
          description={sp.created ? t("created") : undefined}
          actions={
            product ? (
              <DeleteProductButton
                restaurantId={rid}
                productId={product.id}
                categoryId={product.categoryId}
                name={product.name}
              />
            ) : null
          }
        />
      </div>
      <div className="space-y-6">
        {product ? (
          <ProductPhotos
            restaurantId={rid}
            productId={product.id}
            max={MAX_PRODUCT_IMAGES}
            images={product.images.map((i) => ({ id: i.id, urls: i.urls, placeholder: i.placeholder }))}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-fg-muted">
            {t("photosAfterSave")}
          </p>
        )}
        <ProductForm
          restaurantId={rid}
          values={values}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          taxRates={rates.map((r) => ({
            id: r.id,
            name: r.name,
            rateBps: r.rateBps,
            isDefault: r.isDefault,
          }))}
          groups={groups.map((g) => ({
            id: g.id,
            name: g.name,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            values: g.values.map((v) => ({ name: v.name, priceDeltaCents: v.priceDeltaCents })),
          }))}
          allergens={ALLERGENS}
          suggestedTags={SUGGESTED_TAGS}
          currency={ctx.restaurant.currency}
          photo={product?.images[0]?.urls.sm ?? null}
        />
      </div>
    </>
  );
}
