"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  Checkbox,
  FormFeedback,
  SubmitButton,
  TextareaField,
  useActionForm,
  useCloseOnSuccess,
  useFieldError,
} from "@/components/ui/form";
import { SortableList } from "@/components/ui/sortable-list";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  addTemplateCategoriesAction,
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  reorderProductsAction,
  setProductFlagAction,
  updateCategoryAction,
} from "./actions";

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  templateKey: string | null;
  productCount: number;
};

export type ProductRow = {
  id: string;
  name: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  isAvailable: boolean;
  isActive: boolean;
  isFeatured: boolean;
  optionGroupCount: number;
  image: { sm: string } | null;
};

function useErrorMessage() {
  const t = useTranslations("errorCodes");
  return (code: string) => (t.has(code) ? t(code) : t("internal"));
}

// ─── Categories ──────────────────────────────────────────────────────────────

function CategoryForm({
  restaurantId,
  category,
  onDeleted,
}: {
  restaurantId: string;
  category?: CategoryRow;
  onDeleted?: () => void;
}) {
  const t = useTranslations();
  const message = useErrorMessage();
  const form = useActionForm(
    category
      ? updateCategoryAction.bind(null, restaurantId, category.id)
      : createCategoryAction.bind(null, restaurantId),
  );
  useCloseOnSuccess(form.state);
  const err = useFieldError(form.state);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <ActionForm form={form} className="space-y-4">
        <FormFeedback state={form.state} />
        <Field
          label={t("menu.categoryName")}
          name="name"
          required
          maxLength={80}
          defaultValue={category?.name}
          error={err("name")}
          autoFocus
        />
        <TextareaField
          label={t("menu.categoryDescription")}
          name="description"
          maxLength={500}
          defaultValue={category?.description ?? ""}
        />
        <Checkbox
          name="isActive"
          label={t("menu.categoryActive")}
          defaultChecked={category?.isActive ?? true}
        />
        <div className="flex justify-end">
          <SubmitButton>{category ? t("common.save") : t("common.add")}</SubmitButton>
        </div>
      </ActionForm>
      {category ? (
        <form
          className="border-t border-border pt-4"
          action={async () => {
            const res = await deleteCategoryAction(restaurantId, category.id);
            if (res && !res.ok) setDeleteError(message(res.error));
            else onDeleted?.();
          }}
          onSubmit={(e) => {
            if (!window.confirm(t("menu.deleteCategoryConfirm", { name: category.name }))) e.preventDefault();
          }}
        >
          {deleteError ? (
            <p role="alert" className="mb-2 text-sm text-danger">
              {deleteError}
            </p>
          ) : null}
          <SubmitButton variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger">
            {t("common.delete")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function TemplatesForm({
  restaurantId,
  templates,
  used,
  onDone,
}: {
  restaurantId: string;
  templates: string[];
  used: Set<string>;
  onDone: (count: number) => void;
}) {
  const t = useTranslations();
  const form = useActionForm(async (prev, fd) => {
    const res = await addTemplateCategoriesAction(restaurantId, prev, fd);
    if (res?.ok) onDone((res.data as { created: number } | undefined)?.created ?? 0);
    return res;
  });
  useCloseOnSuccess(form.state);
  return (
    <ActionForm form={form} className="space-y-4">
      <p className="text-sm text-fg-muted">{t("menu.templatesHint")}</p>
      <FormFeedback state={form.state} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {templates.map((key) => (
          <Checkbox
            key={key}
            name="templates"
            value={key}
            label={t(`categoryTemplates.${key}`)}
            disabled={used.has(key)}
            defaultChecked={used.has(key)}
            className={cn("rounded-lg border border-border px-3 py-2", used.has(key) && "opacity-50")}
          />
        ))}
      </div>
      <div className="flex justify-end">
        <SubmitButton>{t("menu.addSelected")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

// ─── Board ───────────────────────────────────────────────────────────────────

export function MenuBoard({
  restaurantId,
  categories,
  selected,
  products,
  currency,
  canManage,
  templates,
}: {
  restaurantId: string;
  categories: CategoryRow[];
  selected: CategoryRow | null;
  products: ProductRow[];
  currency: string;
  canManage: boolean;
  templates: string[];
}) {
  const t = useTranslations();
  const message = useErrorMessage();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const used = new Set(categories.map((c) => c.templateKey).filter((k): k is string => !!k));
  const base = `/dashboard/${restaurantId}/menu`;

  const handleReorder = async (res: Awaited<ReturnType<typeof reorderCategoriesAction>>) => {
    if (res?.ok) {
      setToast(t("menu.orderSaved"));
      return true;
    }
    setToast(message(res?.error ?? "internal"));
    if (res?.error === "reorder_mismatch") router.refresh();
    return false;
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] [&>*]:min-w-0">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t("menu.categories")}</h2>
          {canManage ? (
            <div className="flex gap-1">
              <Dialog
                size="lg"
                title={t("menu.fromTemplates")}
                trigger={(open) => (
                  <Button variant="ghost" size="sm" onClick={open}>
                    {t("menu.fromTemplates")}
                  </Button>
                )}
              >
                <TemplatesForm
                  restaurantId={restaurantId}
                  templates={templates}
                  used={used}
                  onDone={(count) => setToast(t("menu.templatesAdded", { count }))}
                />
              </Dialog>
              <Dialog
                title={t("menu.addCategory")}
                trigger={(open) => (
                  <Button size="sm" onClick={open} aria-label={t("menu.addCategory")}>
                    +
                  </Button>
                )}
              >
                <CategoryForm restaurantId={restaurantId} />
              </Dialog>
            </div>
          ) : null}
        </div>
        {categories.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-medium">{t("menu.noCategories")}</p>
            <p className="mt-1 text-sm text-fg-muted">{t("menu.noCategoriesBody")}</p>
          </div>
        ) : (
          <SortableList
            className="divide-y divide-border p-1"
            items={categories}
            getId={(c) => c.id}
            disabled={!canManage}
            handleLabel={(c) => t("menu.dragHandle", { name: c.name })}
            onReorder={async (ids) => handleReorder(await reorderCategoriesAction(restaurantId, ids))}
            renderItem={(c, handle) => (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-lg bg-surface px-1",
                  selected?.id === c.id && "bg-surface-2",
                )}
              >
                {handle}
                <Link
                  href={`${base}?category=${c.id}`}
                  aria-current={selected?.id === c.id ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2.5"
                  scroll={false}
                >
                  <span className={cn("truncate text-sm font-medium", !c.isActive && "text-fg-subtle")}>
                    {c.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {!c.isActive ? <Badge>{t("menu.hidden")}</Badge> : null}
                    <span className="text-xs text-fg-subtle tabular-nums">
                      {t("menu.productCount", { count: c.productCount })}
                    </span>
                  </span>
                </Link>
                {canManage ? (
                  <Dialog
                    title={t("menu.editCategory")}
                    trigger={(open) => (
                      <button
                        type="button"
                        onClick={open}
                        aria-label={`${t("menu.editCategory")} — ${c.name}`}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-fg-subtle hover:bg-surface hover:text-fg"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden="true"
                        >
                          <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
                        </svg>
                      </button>
                    )}
                  >
                    <CategoryForm
                      restaurantId={restaurantId}
                      category={c}
                      onDeleted={() => router.replace(base)}
                    />
                  </Dialog>
                ) : null}
              </div>
            )}
          />
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="font-semibold">{selected?.name ?? t("menu.products")}</h2>
          {selected && canManage ? (
            <Link
              href={`${base}/products/new?category=${selected.id}`}
              className={buttonClasses("primary", "sm")}
            >
              + {t("menu.addProduct")}
            </Link>
          ) : null}
        </div>
        {!selected ? (
          <p className="px-5 py-10 text-center text-sm text-fg-muted">{t("menu.selectCategory")}</p>
        ) : products.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="font-medium">{t("menu.noProducts")}</p>
            <p className="mt-1 text-sm text-fg-muted">{t("menu.noProductsBody")}</p>
          </div>
        ) : (
          <SortableList
            className="divide-y divide-border p-1"
            items={products}
            getId={(p) => p.id}
            disabled={!canManage}
            handleLabel={(p) => t("menu.dragHandle", { name: p.name })}
            onReorder={async (ids) =>
              handleReorder(await reorderProductsAction(restaurantId, selected.id, ids))
            }
            renderItem={(p, handle) => (
              <ProductItem
                restaurantId={restaurantId}
                product={p}
                handle={handle}
                currency={currency}
                canManage={canManage}
                onError={(c) => setToast(message(c))}
              />
            )}
          />
        )}
      </Card>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

function ProductItem({
  restaurantId,
  product: p,
  handle,
  currency,
  canManage,
  onError,
}: {
  restaurantId: string;
  product: ProductRow;
  handle: React.ReactNode;
  currency: string;
  canManage: boolean;
  onError: (code: string) => void;
}) {
  const t = useTranslations("menu");
  const format = useFormatter();
  const price = (c: number) => format.number(c / 100, { style: "currency", currency });
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface px-1 py-2">
      {handle}
      <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {p.image ? <img src={p.image.sm} alt="" loading="lazy" className="size-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/dashboard/${restaurantId}/menu/products/${p.id}`}
          className={cn("block truncate font-medium hover:underline", !p.isActive && "text-fg-subtle")}
        >
          {p.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="tabular-nums">{price(p.priceCents)}</span>
          {p.compareAtPriceCents ? (
            <span className="text-fg-subtle tabular-nums line-through">{price(p.compareAtPriceCents)}</span>
          ) : null}
          {p.isFeatured ? <Badge tone="accent">{t("featured")}</Badge> : null}
          {!p.isAvailable ? <Badge tone="warning">{t("soldOut")}</Badge> : null}
          {!p.isActive ? <Badge>{t("hidden")}</Badge> : null}
          {p.optionGroupCount > 0 ? (
            <span className="text-xs text-fg-subtle">{t("options", { count: p.optionGroupCount })}</span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <FlagSwitch
          restaurantId={restaurantId}
          productId={p.id}
          flag="isAvailable"
          value={p.isAvailable}
          label={t("available")}
          onError={onError}
        />
        {canManage ? (
          <FlagSwitch
            restaurantId={restaurantId}
            productId={p.id}
            flag="isActive"
            value={p.isActive}
            label={t("visible")}
            onError={onError}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Optimistic on/off switch persisted through a server action. */
function FlagSwitch({
  restaurantId,
  productId,
  flag,
  value,
  label,
  onError,
}: {
  restaurantId: string;
  productId: string;
  flag: "isAvailable" | "isActive";
  value: boolean;
  label: string;
  onError: (code: string) => void;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted select-none">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={optimistic}
        aria-label={label}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setOptimistic(!optimistic);
            const res = await setProductFlagAction(restaurantId, productId, flag, !optimistic);
            if (res && !res.ok) onError(res.error);
          })
        }
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60",
          optimistic ? "bg-success" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start]",
            optimistic ? "start-[18px]" : "start-0.5",
          )}
        />
      </button>
    </label>
  );
}
