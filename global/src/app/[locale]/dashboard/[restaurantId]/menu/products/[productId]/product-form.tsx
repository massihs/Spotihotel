"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  Checkbox,
  FormFeedback,
  SelectField,
  SubmitButton,
  TextareaField,
  useActionForm,
  useFieldError,
} from "@/components/ui/form";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/cn";
import {
  createProductAction,
  deleteProductAction,
  productImageCommandAction,
  updateProductAction,
  uploadProductImageAction,
} from "../../actions";

export type ProductValues = {
  id?: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  compareAtPriceCents: number | null;
  taxRateId: string | null;
  ingredients: string | null;
  allergens: string[];
  caloriesKcal: number | null;
  weightGrams: number | null;
  tags: string[];
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  optionGroupIds: string[];
};

type Option = { id: string; name: string };
type Group = Option & {
  minSelect: number;
  maxSelect: number;
  values: { name: string; priceDeltaCents: number }[];
};

export function ProductForm({
  restaurantId,
  values,
  categories,
  taxRates,
  groups,
  allergens,
  suggestedTags,
  currency,
}: {
  restaurantId: string;
  values: ProductValues;
  categories: Option[];
  taxRates: (Option & { rateBps: number; isDefault: boolean })[];
  groups: Group[];
  allergens: readonly string[];
  suggestedTags: readonly string[];
  currency: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const editing = Boolean(values.id);
  const form = useActionForm(
    editing
      ? updateProductAction.bind(null, restaurantId, values.id!)
      : createProductAction.bind(null, restaurantId),
  );
  const err = useFieldError(form.state);
  const customTags = values.tags.filter((tag) => !suggestedTags.includes(tag));
  const money = (c: number) => format.number(c / 100, { style: "currency", currency });

  return (
    <ActionForm form={form} className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card>
          <CardHeader title={t("product.general")} />
          <div className="space-y-4 p-5">
            <Field
              label={t("product.name")}
              name="name"
              required
              maxLength={120}
              defaultValue={values.name}
              error={err("name")}
            />
            <SelectField
              label={t("product.category")}
              name="categoryId"
              defaultValue={values.categoryId}
              error={err("categoryId")}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextareaField
              label={t("product.description")}
              name="description"
              maxLength={1000}
              defaultValue={values.description ?? ""}
              hint={t("product.descriptionHint")}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title={t("product.pricing")} />
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <Field
              label={`${t("product.price")} (${currency})`}
              name="price"
              required
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={centsToInput(values.priceCents, locale)}
              hint={t("product.priceHint")}
              error={err("price") ?? err("priceCents")}
            />
            <Field
              label={t("product.compareAt")}
              name="compareAt"
              inputMode="decimal"
              defaultValue={centsToInput(values.compareAtPriceCents, locale)}
              hint={t("product.compareAtHint")}
              error={err("compareAt") ?? err("compareAtPriceCents")}
            />
            <SelectField
              label={t("product.taxRate")}
              name="taxRateId"
              defaultValue={values.taxRateId ?? ""}
              error={err("taxRateId")}
            >
              <option value="">{t("product.taxDefault")}</option>
              {taxRates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("product.composition")} />
          <div className="space-y-4 p-5">
            <TextareaField
              label={t("product.ingredients")}
              name="ingredients"
              maxLength={1000}
              defaultValue={values.ingredients ?? ""}
            />
            <fieldset>
              <legend className="text-sm font-medium">{t("product.allergens")}</legend>
              <p className="mb-2 text-sm text-fg-muted">{t("product.allergensHint")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {allergens.map((a) => (
                  <Checkbox
                    key={a}
                    name="allergens"
                    value={a}
                    label={t(`allergens.${a}`)}
                    defaultChecked={values.allergens.includes(a)}
                  />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("product.calories")}
                name="caloriesKcal"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={values.caloriesKcal ?? ""}
                error={err("caloriesKcal")}
              />
              <Field
                label={t("product.weight")}
                name="weightGrams"
                type="number"
                min={0}
                inputMode="numeric"
                defaultValue={values.weightGrams ?? ""}
                error={err("weightGrams")}
              />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("product.optionsTitle")}
            description={t("product.optionsHint")}
            action={
              <Link href={`/dashboard/${restaurantId}/menu/options`} className={buttonClasses("ghost", "sm")}>
                {t("product.manageOptions")}
              </Link>
            }
          />
          <div className="p-5">
            {groups.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("product.noOptionGroups")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {groups.map((g) => (
                  <Checkbox
                    key={g.id}
                    name="optionGroupIds"
                    value={g.id}
                    defaultChecked={values.optionGroupIds.includes(g.id)}
                    className="rounded-xl border border-border p-3"
                    label={
                      <>
                        {g.name}{" "}
                        <span className="font-normal text-fg-muted">
                          · {t("options.rule", { min: g.minSelect, max: g.maxSelect })}
                        </span>
                      </>
                    }
                    description={g.values
                      .map((v) => (v.priceDeltaCents ? `${v.name} +${money(v.priceDeltaCents)}` : v.name))
                      .join(", ")}
                  />
                ))}
              </div>
            )}
            {err("optionGroupIds") ? (
              <p className="mt-2 text-sm text-danger">{err("optionGroupIds")}</p>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardHeader title={t("product.visibility")} />
          <div className="space-y-4 p-5">
            <Checkbox name="isActive" label={t("product.isActive")} defaultChecked={values.isActive} />
            <Checkbox
              name="isAvailable"
              label={t("product.isAvailable")}
              description={t("product.isAvailableHint")}
              defaultChecked={values.isAvailable}
            />
            <Checkbox
              name="isFeatured"
              label={t("product.isFeatured")}
              description={t("product.isFeaturedHint")}
              defaultChecked={values.isFeatured}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("product.tagsTitle")} />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {suggestedTags.map((tag) => (
                <label key={tag} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="tags"
                    value={tag}
                    defaultChecked={values.tags.includes(tag)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]">
                    {t(`tags.${tag}`)}
                  </span>
                </label>
              ))}
            </div>
            <Field
              label={t("product.customTags")}
              name="customTags"
              defaultValue={customTags.join(", ")}
              hint={t("product.customTagsHint")}
              error={
                Object.keys((form.state && !form.state.ok && form.state.fieldErrors) || {}).some((k) =>
                  k.startsWith("tags"),
                )
                  ? t("errorCodes.invalid_tag")
                  : undefined
              }
            />
          </div>
        </Card>
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
          <FormFeedback state={form.state} success={t("common.saved")} />
          <SubmitButton className="w-full">{editing ? t("common.save") : t("product.create")}</SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}

export function ProductPhotos({
  restaurantId,
  productId,
  images,
  max,
}: {
  restaurantId: string;
  productId: string;
  images: { id: string; urls: { sm: string; md: string }; placeholder: string | null }[];
  max: number;
}) {
  const t = useTranslations();
  const upload = useActionForm(uploadProductImageAction.bind(null, restaurantId, productId));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (imageId: string, command: "primary" | "delete") =>
    startTransition(async () => {
      const res = await productImageCommandAction(restaurantId, imageId, command);
      setError(
        res && !res.ok
          ? t.has(`errorCodes.${res.error}`)
            ? t(`errorCodes.${res.error}`)
            : t("errorCodes.internal")
          : null,
      );
    });

  return (
    <Card>
      <CardHeader title={t("product.photos")} description={t("product.photosHint")} />
      <div className="space-y-4 p-5">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((img, i) => (
            <li
              key={img.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border border-border",
                pending && "opacity-60",
              )}
            >
              <img
                src={img.urls.md}
                alt=""
                className="aspect-[4/3] w-full object-cover"
                style={
                  img.placeholder
                    ? { backgroundImage: `url(${img.placeholder})`, backgroundSize: "cover" }
                    : undefined
                }
              />
              {i === 0 ? (
                <Badge tone="accent" className="absolute start-2 top-2">
                  {t("product.primary")}
                </Badge>
              ) : null}
              <div className="flex justify-between gap-1 border-t border-border bg-surface p-1.5">
                {i > 0 ? (
                  <button
                    type="button"
                    onClick={() => run(img.id, "primary")}
                    className="rounded-md px-2 py-1 text-xs hover:bg-surface-2"
                  >
                    {t("product.makePrimary")}
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => run(img.id, "delete")}
                  className="rounded-md px-2 py-1 text-xs text-danger hover:bg-danger-soft"
                  aria-label={t("product.deletePhoto")}
                >
                  {t("common.delete")}
                </button>
              </div>
            </li>
          ))}
          {images.length < max ? (
            <li>
              <ActionForm form={upload} className="h-full">
                <label
                  className={cn(
                    "grid aspect-[4/3] h-full w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-center text-sm text-fg-muted focus-within:ring-4 focus-within:ring-[var(--ring)] hover:border-accent hover:text-accent",
                    upload.pending && "animate-pulse",
                  )}
                >
                  <span>+ {t("product.addPhoto")}</span>
                  <input
                    type="file"
                    name="photo"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="sr-only"
                    onChange={(e) => e.target.form?.requestSubmit()}
                  />
                </label>
              </ActionForm>
            </li>
          ) : null}
        </ul>
        <FormFeedback state={upload.state} />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function DeleteProductButton({
  restaurantId,
  productId,
  categoryId,
  name,
}: {
  restaurantId: string;
  productId: string;
  categoryId: string;
  name: string;
}) {
  const t = useTranslations("product");
  return (
    <form
      action={async () => {
        await deleteProductAction(restaurantId, productId, categoryId);
      }}
      onSubmit={(e) => {
        if (!window.confirm(t("deleteConfirm", { name }))) e.preventDefault();
      }}
    >
      <SubmitButton variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger">
        {t("delete")}
      </SubmitButton>
    </form>
  );
}
