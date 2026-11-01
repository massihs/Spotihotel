"use client";

import { useLocale, useTranslations } from "next-intl";
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
import { centsToInput, formatMoney, parseMoneyInput } from "@/lib/money";
import { MoneyField } from "@/components/ui/money-field";
import { ImageIcon, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Nutrition } from "@/lib/nutrition";
import { NutritionFields } from "./nutrition-fields";
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
  takeawayPriceCents: number | null;
  deliveryPriceCents: number | null;
  taxRateId: string | null;
  ingredients: string | null;
  allergens: string[];
  caloriesKcal: number | null;
  weightGrams: number | null;
  nutrition: Nutrition | null;
  nutritionSource: string | null;
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
  photo,
}: {
  /** First photo of the dish, for the guest preview. */
  photo?: string | null;
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
  const editing = Boolean(values.id);
  const form = useActionForm(
    editing
      ? updateProductAction.bind(null, restaurantId, values.id!)
      : createProductAction.bind(null, restaurantId),
  );
  const err = useFieldError(form.state);
  const customTags = values.tags.filter((tag) => !suggestedTags.includes(tag));
  const money = (c: number) => formatMoney(c, currency, locale);
  const [preview, setPreview] = useState<Preview>(() => ({
    name: values.name,
    description: values.description ?? "",
    priceCents: values.priceCents,
    compareAtCents: values.compareAtPriceCents,
    isAvailable: values.isAvailable,
    isFeatured: values.isFeatured,
    isActive: values.isActive,
    tags: values.tags.filter((tag) => suggestedTags.includes(tag)),
  }));
  // The preview follows what is typed, field by field (inputs bubble up to the form).
  const readForm = (formEl: HTMLFormElement) => {
    const fd = new FormData(formEl);
    setPreview({
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? ""),
      priceCents: parseMoneyInput(String(fd.get("price") ?? ""), currency),
      compareAtCents: parseMoneyInput(String(fd.get("compareAt") ?? ""), currency),
      isAvailable: fd.get("isAvailable") === "on",
      isFeatured: fd.get("isFeatured") === "on",
      isActive: fd.get("isActive") === "on",
      tags: fd.getAll("tags").map(String),
    });
  };
  const save = (
    <>
      <FormFeedback state={form.state} success={t("common.saved")} />
      <SubmitButton className="w-full">{editing ? t("common.save") : t("product.create")}</SubmitButton>
    </>
  );

  return (
    <ActionForm
      form={form}
      onInput={(e) => readForm(e.currentTarget)}
      onChange={(e) => readForm(e.currentTarget)}
      className="grid gap-6 pb-24 xl:grid-cols-[1fr_340px] xl:pb-0"
    >
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
            <MoneyField
              label={t("product.price")}
              name="price"
              currency={currency}
              required
              defaultValue={centsToInput(values.priceCents, locale, currency)}
              hint={t("product.priceHint")}
              error={err("price") ?? err("priceCents")}
            />
            <MoneyField
              label={t("product.compareAt")}
              name="compareAt"
              currency={currency}
              defaultValue={centsToInput(values.compareAtPriceCents, locale, currency)}
              hint={t("product.compareAtHint")}
              error={err("compareAt") ?? err("compareAtPriceCents")}
            />
            <MoneyField
              label={t("product.takeawayPrice")}
              name="takeawayPrice"
              currency={currency}
              defaultValue={centsToInput(values.takeawayPriceCents, locale, currency)}
              hint={t("product.channelPriceHint")}
              error={err("takeawayPrice") ?? err("takeawayPriceCents")}
            />
            <MoneyField
              label={t("product.deliveryPrice")}
              name="deliveryPrice"
              currency={currency}
              defaultValue={centsToInput(values.deliveryPriceCents, locale, currency)}
              hint={t("product.channelPriceHint")}
              error={err("deliveryPrice") ?? err("deliveryPriceCents")}
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
            <NutritionFields
              restaurantId={restaurantId}
              values={values}
              errors={{
                caloriesKcal: err("caloriesKcal"),
                weightGrams: err("weightGrams"),
                nutrition: err("nutrition"),
              }}
            />
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

      <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
        <Card className="max-xl:hidden">
          <CardHeader title={t("product.preview")} description={t("product.previewHint")} />
          <div className="space-y-4 p-4">
            <GuestPreview preview={preview} photo={photo} money={money} t={t} />
            <div className="space-y-3">{save}</div>
          </div>
        </Card>
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
                  <span className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent-text peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]">
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
      </div>
      {/* Phones and tablets: the save button stays at hand at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 space-y-2 border-t border-border bg-surface/95 p-3 backdrop-blur lg:start-[272px] lg:bottom-0 xl:hidden">
        {save}
      </div>
    </ActionForm>
  );
}

type Preview = {
  name: string;
  description: string;
  priceCents: number | null;
  compareAtCents: number | null;
  isAvailable: boolean;
  isFeatured: boolean;
  isActive: boolean;
  tags: string[];
};

/** The dish as a guest sees it in the menu list, updated while typing. */
function GuestPreview({
  preview: p,
  photo,
  money,
  t,
}: {
  preview: Preview;
  photo?: string | null;
  money: (c: number) => string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className={cn("rounded-2xl bg-bg p-3 ring-1 ring-border", !p.isActive && "opacity-50")}>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          {p.isFeatured ? (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-fg">
              <Star className="size-3 fill-current" aria-hidden="true" />
              {t("menu.featured")}
            </span>
          ) : null}
          <p className="leading-6 font-bold">{p.name || "—"}</p>
          {p.description ? (
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-fg-muted">{p.description}</p>
          ) : null}
          {p.tags.length ? (
            <p className="mt-1 flex flex-wrap gap-1">
              {p.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px]">
                  {t(`tags.${tag}`)}
                </span>
              ))}
            </p>
          ) : null}
          <p className="mt-2 flex items-baseline gap-2 text-sm tabular-nums">
            {p.isAvailable ? (
              <>
                <b>{p.priceCents != null ? money(p.priceCents) : "—"}</b>
                {p.compareAtCents ? (
                  <span className="text-xs text-fg-subtle line-through">{money(p.compareAtCents)}</span>
                ) : null}
              </>
            ) : (
              <span className="font-bold text-warning">{t("menu.soldOut")}</span>
            )}
          </p>
        </div>
        <span
          className={cn(
            "grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 text-fg-subtle",
            !p.isAvailable && "grayscale",
          )}
        >
          {photo ? (
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6" aria-hidden="true" />
          )}
        </span>
      </div>
    </div>
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
                    "grid aspect-[4/3] h-full w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed border-border text-center text-sm text-fg-muted focus-within:ring-4 focus-within:ring-[var(--ring)] hover:border-accent hover:text-accent-text",
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
