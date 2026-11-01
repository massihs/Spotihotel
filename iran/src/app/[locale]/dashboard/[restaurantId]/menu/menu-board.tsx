"use client";

import { centsToInput, formatMoney, isToman, parseMoneyInput } from "@/lib/money";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useMemo, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  CircleOff,
  Eye,
  EyeOff,
  ImageIcon,
  ImageOff,
  LayoutGrid,
  List,
  Pencil,
  Percent,
  Plus,
  Search,
  Sparkles,
  Star,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, useDialog } from "@/components/ui/dialog";
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
import { CategoryIcon } from "@/components/category-icon";
import { IconPicker } from "@/components/dashboard/icon-picker";
import { resolveCategoryIcon } from "@/lib/category-icons";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { MoneyField } from "@/components/ui/money-field";
import { usePref, writePref } from "@/components/ui/use-pref";
import { adjustedPrice, ROUND_STEPS } from "@/lib/price-adjust";
import {
  addTemplateCategoriesAction,
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoriesAction,
  adjustPricesAction,
  reorderProductsAction,
  setProductFlagAction,
  setProductPriceAction,
  updateCategoryAction,
} from "./actions";

export type CategoryRow = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  isActive: boolean;
  templateKey: string | null;
  productCount: number;
};

export type ProductRow = {
  id: string;
  categoryId: string;
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
        <IconPicker name="icon" defaultValue={resolveCategoryIcon(category?.icon, category?.templateKey)} />
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

type Filter = "all" | "soldOut" | "hidden" | "noPhoto" | "featured";
const FILTERS: { key: Filter; test: (p: ProductRow) => boolean }[] = [
  { key: "all", test: () => true },
  { key: "soldOut", test: (p) => !p.isAvailable },
  { key: "hidden", test: (p) => !p.isActive },
  { key: "noPhoto", test: (p) => !p.image },
  { key: "featured", test: (p) => p.isFeatured },
];
const FILTER_ICON: Record<Filter, ReactNode> = {
  all: <UtensilsCrossed className="size-4" aria-hidden="true" />,
  soldOut: <CircleOff className="size-4" aria-hidden="true" />,
  hidden: <EyeOff className="size-4" aria-hidden="true" />,
  noPhoto: <ImageOff className="size-4" aria-hidden="true" />,
  featured: <Star className="size-4" aria-hidden="true" />,
};

/**
 * The restaurateur's menu: health at a glance (sold out, hidden, without photo…), a search over
 * every dish, list or card view, prices edited in place, sold out / hidden / featured in one tap,
 * and a bulk price change for a category or the whole menu.
 */
export function MenuBoard({
  restaurantId,
  categories,
  selected,
  products: allProducts,
  currency,
  canManage,
  canFlag,
  templates,
}: {
  restaurantId: string;
  categories: CategoryRow[];
  selected: CategoryRow | null;
  /** Every dish of the menu; the board narrows them down. */
  products: ProductRow[];
  currency: string;
  canManage: boolean;
  /** Sold out can be flagged by service staff too. */
  canFlag: boolean;
  templates: string[];
}) {
  const t = useTranslations();
  const message = useErrorMessage();
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const view = usePref("sf-menu-view", "list") === "grid" ? "grid" : "list";
  const used = new Set(categories.map((c) => c.templateKey).filter((k): k is string => !!k));
  const base = `/dashboard/${restaurantId}/menu`;
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const q = query.trim().toLowerCase();
  // Searching or filtering looks across the whole menu; otherwise the selected category, sortable.
  const wide = q !== "" || filter !== "all";
  const test = FILTERS.find((f) => f.key === filter)!.test;
  const shown = wide
    ? allProducts.filter((p) => test(p) && (!q || p.name.toLowerCase().includes(q)))
    : allProducts.filter((p) => p.categoryId === selected?.id);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, allProducts.filter(f.test).length])) as Record<
    Filter,
    number
  >;

  const handleReorder = async (res: Awaited<ReturnType<typeof reorderCategoriesAction>>) => {
    if (res?.ok) {
      setToast(t("menu.orderSaved"));
      return true;
    }
    setToast(message(res?.error ?? "internal"));
    if (res?.error === "reorder_mismatch") router.refresh();
    return false;
  };

  const item = (p: ProductRow, handle: ReactNode) => (
    <ProductItem
      key={p.id}
      restaurantId={restaurantId}
      product={p}
      handle={handle}
      currency={currency}
      canManage={canManage}
      canFlag={canFlag}
      category={wide ? catName.get(p.categoryId) : undefined}
      onError={(c) => setToast(message(c))}
      onSaved={() => setToast(t("menu.priceSaved"))}
    />
  );

  return (
    <div className="space-y-5">
      {/* Menu health: each tile is a filter. */}
      <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(filter === f.key && f.key !== "all" ? "all" : f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "flex min-w-36 shrink-0 items-center gap-3 rounded-2xl p-3 text-start transition-all sm:min-w-0",
              filter === f.key
                ? "bg-fg text-bg shadow-[var(--shadow-float)]"
                : "bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border hover:ring-border-strong",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                filter === f.key
                  ? "bg-bg/15"
                  : f.key === "soldOut" && counts.soldOut
                    ? "bg-warning-soft text-warning"
                    : f.key === "noPhoto" && counts.noPhoto
                      ? "bg-info-soft text-info"
                      : f.key === "featured"
                        ? "bg-accent-soft text-accent-text"
                        : "bg-surface-2 text-fg-muted",
              )}
            >
              {FILTER_ICON[f.key]}
            </span>
            <span className="min-w-0">
              <span className="block text-xl leading-none font-black tabular-nums">{counts[f.key]}</span>
              <span
                className={cn(
                  "mt-1 block truncate text-xs",
                  filter === f.key ? "opacity-80" : "text-fg-muted",
                )}
              >
                {t(`menu.stats.${f.key}`)}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] [&>*]:min-w-0">
        {categories.length > 0 ? (
          <nav
            aria-label={t("menu.categories")}
            className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 lg:hidden"
          >
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`${base}?category=${c.id}`}
                scroll={false}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                aria-current={!wide && selected?.id === c.id ? "true" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap",
                  !wide && selected?.id === c.id
                    ? "bg-accent text-accent-fg"
                    : "bg-surface text-fg-muted shadow-[var(--shadow-soft)]",
                )}
              >
                <CategoryIcon icon={c.icon} templateKey={c.templateKey} className="size-4" />
                {c.name}
                <span className="text-xs tabular-nums opacity-60">{c.productCount}</span>
              </Link>
            ))}
          </nav>
        ) : null}

        <Card className="max-lg:order-last lg:sticky lg:top-20">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="font-semibold">{t("menu.categories")}</h2>
            {canManage ? (
              <div className="flex gap-1">
                <Dialog
                  size="lg"
                  title={t("menu.fromTemplates")}
                  trigger={(open) => (
                    <Button variant="ghost" size="sm" onClick={open}>
                      <Sparkles className="size-4" aria-hidden="true" />
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
                  size="lg"
                  title={t("menu.addCategory")}
                  trigger={(open) => (
                    <Button size="sm" onClick={open} aria-label={t("menu.addCategory")} className="px-2.5">
                      <Plus className="size-4" aria-hidden="true" />
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
              className="space-y-0.5 p-2"
              items={categories}
              getId={(c) => c.id}
              disabled={!canManage}
              handleLabel={(c) => t("menu.dragHandle", { name: c.name })}
              onReorder={async (ids) => handleReorder(await reorderCategoriesAction(restaurantId, ids))}
              renderItem={(c, handle) => {
                const active = !wide && selected?.id === c.id;
                const soldOut = allProducts.filter((p) => p.categoryId === c.id && !p.isAvailable).length;
                return (
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-2xl bg-surface px-1 transition-colors",
                      active ? "bg-accent-soft text-accent-text [&_*]:text-inherit" : "hover:bg-surface-2",
                    )}
                  >
                    {handle}
                    <Link
                      href={`${base}?category=${c.id}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setQuery("");
                        setFilter("all");
                      }}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2 py-2.5"
                      scroll={false}
                    >
                      <span
                        className={cn(
                          "flex min-w-0 items-center gap-2.5 text-sm font-medium",
                          !c.isActive && "opacity-50",
                        )}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-accent-text ring-1 ring-border">
                          <CategoryIcon icon={c.icon} templateKey={c.templateKey} className="size-4" />
                        </span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {!c.isActive ? <Badge>{t("menu.hidden")}</Badge> : null}
                        {soldOut ? (
                          <span
                            className="rounded-full bg-warning-soft px-1.5 text-[11px] font-bold text-warning tabular-nums"
                            title={t("menu.stats.soldOut")}
                          >
                            {soldOut}
                          </span>
                        ) : null}
                        <span className="text-xs tabular-nums opacity-60">{c.productCount}</span>
                      </span>
                    </Link>
                    {canManage ? (
                      <Dialog
                        size="lg"
                        title={t("menu.editCategory")}
                        trigger={(open) => (
                          <button
                            type="button"
                            onClick={open}
                            aria-label={`${t("menu.editCategory")} — ${c.name}`}
                            className="grid size-8 shrink-0 place-items-center rounded-full opacity-60 hover:bg-surface hover:opacity-100"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
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
                );
              }}
            />
          )}
        </Card>

        <Card className="overflow-visible">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">
                  {wide ? t(`menu.stats.${filter}`) : (selected?.name ?? t("menu.products"))}
                </h2>
                <p className="text-xs text-fg-muted">{t("menu.results", { count: shown.length })}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManage && allProducts.length ? (
                  <BulkPriceDialog
                    restaurantId={restaurantId}
                    currency={currency}
                    category={wide ? null : selected}
                    products={allProducts}
                    onDone={(n) => setToast(t("menu.bulk.done", { count: n }))}
                  />
                ) : null}
                {selected && canManage ? (
                  <Link
                    href={`${base}/products/new?category=${selected.id}`}
                    className={buttonClasses("accent", "sm")}
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    {t("menu.addProduct")}
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 focus-within:ring-2 focus-within:ring-[var(--ring)]">
                <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("menu.search")}
                  aria-label={t("menu.search")}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
                  style={{ outline: "none" }}
                />
                {query ? (
                  <button type="button" onClick={() => setQuery("")} aria-label={t("menu.clearFilters")}>
                    <X className="size-4 text-fg-muted" aria-hidden="true" />
                  </button>
                ) : null}
              </label>
              <div className="flex shrink-0 rounded-xl bg-surface-2 p-1" role="group">
                {(["list", "grid"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => writePref("sf-menu-view", v)}
                    aria-pressed={view === v}
                    aria-label={t(v === "list" ? "menu.viewList" : "menu.viewGrid")}
                    title={t(v === "list" ? "menu.viewList" : "menu.viewGrid")}
                    className={cn(
                      "grid size-8 place-items-center rounded-lg transition-colors",
                      view === v ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {v === "list" ? (
                      <List className="size-4" aria-hidden="true" />
                    ) : (
                      <LayoutGrid className="size-4" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            </div>
            {wide ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                {t("menu.reorderHint")}
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="font-semibold text-accent-text hover:underline"
                >
                  {t("menu.clearFilters")}
                </button>
              </p>
            ) : null}
          </div>

          {!wide && !selected ? (
            <p className="px-5 py-10 text-center text-sm text-fg-muted">{t("menu.selectCategory")}</p>
          ) : shown.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-2 text-fg-subtle">
                <UtensilsCrossed className="size-6" aria-hidden="true" />
              </span>
              <p className="mt-3 font-semibold">{wide ? t("menu.noResults") : t("menu.noProducts")}</p>
              {!wide ? <p className="mt-1 text-sm text-fg-muted">{t("menu.noProductsBody")}</p> : null}
              {!wide && selected && canManage ? (
                <Link
                  href={`${base}/products/new?category=${selected.id}`}
                  className={cn(buttonClasses("accent", "sm"), "mt-4")}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {t("menu.addProduct")}
                </Link>
              ) : null}
            </div>
          ) : view === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((p) => (
                <li key={p.id}>
                  <ProductCard
                    restaurantId={restaurantId}
                    product={p}
                    currency={currency}
                    canManage={canManage}
                    canFlag={canFlag}
                    category={wide ? catName.get(p.categoryId) : undefined}
                    onError={(c) => setToast(message(c))}
                    onSaved={() => setToast(t("menu.priceSaved"))}
                  />
                </li>
              ))}
            </ul>
          ) : wide ? (
            <ul className="divide-y divide-border px-2 py-1">
              {shown.map((p) => (
                <li key={p.id}>{item(p, null)}</li>
              ))}
            </ul>
          ) : (
            <SortableList
              className="divide-y divide-border px-2 py-1"
              items={shown}
              getId={(p) => p.id}
              disabled={!canManage}
              handleLabel={(p) => t("menu.dragHandle", { name: p.name })}
              onReorder={async (ids) =>
                handleReorder(await reorderProductsAction(restaurantId, selected!.id, ids))
              }
              renderItem={(p, handle) => item(p, handle)}
            />
          )}
        </Card>
      </div>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}

type ItemProps = {
  restaurantId: string;
  product: ProductRow;
  currency: string;
  canManage: boolean;
  canFlag: boolean;
  category?: string;
  onError: (code: string) => void;
  onSaved: () => void;
};

function Thumb({ p, className }: { p: ProductRow; className?: string }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-surface-2 text-fg-subtle",
        !p.isAvailable && "grayscale",
        !p.isActive && "opacity-50",
        className,
      )}
    >
      {p.image ? (
        <img src={p.image.sm} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageIcon className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

function ProductItem({
  handle,
  ...props
}: ItemProps & {
  handle: ReactNode;
}) {
  const { restaurantId, product: p, category } = props;
  const t = useTranslations("menu");
  const href = `/dashboard/${restaurantId}/menu/products/${p.id}`;
  return (
    <div className="group flex flex-wrap items-center gap-x-3 gap-y-2 bg-surface px-1 py-2.5 sm:flex-nowrap">
      {handle ?? <span className="w-1" />}
      <Link href={href} className="shrink-0">
        <Thumb p={p} className="size-14 rounded-xl" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className={cn("block truncate font-bold hover:underline", !p.isActive && "text-fg-subtle")}
        >
          {p.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {category ? <span className="text-fg-muted">{t("inCategory", { name: category })}</span> : null}
          {!p.isAvailable ? <Badge tone="warning">{t("soldOut")}</Badge> : null}
          {!p.isActive ? <Badge>{t("hidden")}</Badge> : null}
          {p.isFeatured ? <Badge tone="accent">{t("featured")}</Badge> : null}
          {p.optionGroupCount > 0 ? (
            <span className="text-fg-subtle">{t("options", { count: p.optionGroupCount })}</span>
          ) : null}
        </div>
      </div>
      {/* Phones: price and quick actions share the second line, so the name keeps the width. */}
      <div className="flex w-full items-center justify-between gap-1 ps-6 sm:w-auto sm:justify-end sm:gap-3 sm:ps-0">
        <PriceEdit {...props} />
        <div className="flex items-center gap-1">
          <QuickToggles {...props} />
          <Link
            href={href}
            aria-label={`${t("edit")} — ${p.name}`}
            title={t("edit")}
            className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProductCard(props: ItemProps) {
  const { restaurantId, product: p, category } = props;
  const t = useTranslations("menu");
  const href = `/dashboard/${restaurantId}/menu/products/${p.id}`;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-border transition-shadow hover:shadow-[var(--shadow-float)]">
      <Link href={href} className="relative block">
        <Thumb p={p} className="aspect-[4/3] w-full" />
        <span className="absolute start-2 top-2 flex flex-wrap gap-1">
          {!p.isAvailable ? <Badge tone="warning">{t("soldOut")}</Badge> : null}
          {!p.isActive ? <Badge>{t("hidden")}</Badge> : null}
        </span>
        {p.isFeatured ? (
          <span className="absolute end-2 top-2 grid size-7 place-items-center rounded-full bg-accent text-accent-fg shadow">
            <Star className="size-4 fill-current" aria-hidden="true" />
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          href={href}
          className={cn("line-clamp-2 leading-6 font-bold hover:underline", !p.isActive && "text-fg-subtle")}
        >
          {p.name}
        </Link>
        {category ? (
          <span className="text-xs text-fg-muted">{t("inCategory", { name: category })}</span>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <PriceEdit {...props} compact />
        </div>
        <div className="-mx-1 flex items-center justify-between border-t border-border pt-2">
          <QuickToggles {...props} />
        </div>
      </div>
    </div>
  );
}

/** Price shown as text; a tap turns it into a field (Enter saves, Escape cancels). */
function PriceEdit({
  restaurantId,
  product: p,
  currency,
  canManage,
  onError,
  onSaved,
  compact,
}: ItemProps & { compact?: boolean }) {
  const t = useTranslations("menu");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [optimistic, setOptimistic] = useOptimistic(p.priceCents);
  const [pending, start] = useTransition();
  const price = (c: number) => formatMoney(c, currency, locale);
  const text = (
    <span className="flex flex-col items-end">
      <span className="font-bold text-accent-text tabular-nums">{price(optimistic)}</span>
      {p.compareAtPriceCents ? (
        <span className="text-xs text-fg-subtle tabular-nums line-through">
          {price(p.compareAtPriceCents)}
        </span>
      ) : null}
    </span>
  );
  if (!canManage) return <div className={cn("shrink-0", compact ? "" : "sm:min-w-32")}>{text}</div>;
  if (editing)
    return (
      <form
        className={cn("flex shrink-0 items-center gap-1", compact ? "w-full" : "w-44")}
        onSubmit={(e) => {
          e.preventDefault();
          const value = String(new FormData(e.currentTarget).get("price") ?? "");
          setEditing(false);
          const cents = parseMoneyInput(value, currency);
          if (cents === null || cents === optimistic) return;
          start(async () => {
            setOptimistic(cents);
            const res = await setProductPriceAction(restaurantId, p.id, value);
            if (res && !res.ok) onError(res.error);
            else onSaved();
          });
        }}
      >
        <MoneyField
          name="price"
          currency={currency}
          defaultValue={centsToInput(optimistic, locale, currency)}
          aria-label={t("editPrice")}
          autoFocus
          onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-9"
        />
      </form>
    );
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      title={t("editPrice")}
      aria-label={`${t("editPrice")} — ${p.name}`}
      className={cn(
        "shrink-0 rounded-lg px-2 py-1 text-end transition-colors hover:bg-surface-2 disabled:opacity-60",
        compact ? "-mx-2" : "sm:min-w-32",
      )}
    >
      {text}
    </button>
  );
}

function QuickToggles({ restaurantId, product: p, canManage, canFlag, onError }: ItemProps) {
  const t = useTranslations("menu");
  return (
    <div className="flex items-center gap-1">
      {canFlag ? (
        <Flag
          restaurantId={restaurantId}
          productId={p.id}
          flag="isAvailable"
          value={p.isAvailable}
          onError={onError}
          render={(on) => (
            <span
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap",
                on ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
              )}
            >
              <span className={cn("size-1.5 rounded-full", on ? "bg-success" : "bg-warning")} />
              {on ? t("available") : t("soldOut")}
            </span>
          )}
          label={(on) => (on ? t("markSoldOut") : t("markAvailable"))}
        />
      ) : null}
      {canManage ? (
        <>
          <Flag
            restaurantId={restaurantId}
            productId={p.id}
            flag="isActive"
            value={p.isActive}
            onError={onError}
            render={(on) => (
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  on ? "text-fg-muted hover:bg-surface-2" : "bg-surface-2 text-fg",
                )}
              >
                {on ? (
                  <Eye className="size-4" aria-hidden="true" />
                ) : (
                  <EyeOff className="size-4" aria-hidden="true" />
                )}
              </span>
            )}
            label={(on) => (on ? t("hide") : t("show"))}
          />
          <Flag
            restaurantId={restaurantId}
            productId={p.id}
            flag="isFeatured"
            value={p.isFeatured}
            onError={onError}
            render={(on) => (
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  on ? "text-accent-text" : "text-fg-subtle hover:bg-surface-2",
                )}
              >
                <Star className={cn("size-4", on && "fill-current")} aria-hidden="true" />
              </span>
            )}
            label={(on) => (on ? t("unfeature") : t("feature"))}
          />
        </>
      ) : null}
    </div>
  );
}

/** Optimistic flag button persisted through a server action. */
function Flag({
  restaurantId,
  productId,
  flag,
  value,
  onError,
  render,
  label,
}: {
  restaurantId: string;
  productId: string;
  flag: "isAvailable" | "isActive" | "isFeatured";
  value: boolean;
  onError: (code: string) => void;
  render: (on: boolean) => ReactNode;
  label: (on: boolean) => string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={flag === "isActive" ? !optimistic : optimistic}
      aria-label={label(optimistic)}
      title={label(optimistic)}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          const res = await setProductFlagAction(restaurantId, productId, flag, !optimistic);
          if (res && !res.ok) onError(res.error);
        })
      }
      className="rounded-full transition-transform active:scale-95 disabled:opacity-60"
    >
      {render(optimistic)}
    </button>
  );
}

type BulkProps = {
  restaurantId: string;
  currency: string;
  category: CategoryRow | null;
  products: ProductRow[];
  onDone: (changed: number) => void;
};

/** +x % on a category or the whole menu, rounded, with a preview of the first dishes. */
function BulkPriceDialog(props: BulkProps) {
  const t = useTranslations("menu.bulk");
  return (
    <Dialog
      size="lg"
      title={t("title")}
      trigger={(open) => (
        <Button variant="secondary" size="sm" onClick={open}>
          <Percent className="size-4" aria-hidden="true" />
          {t("button")}
        </Button>
      )}
    >
      <BulkPriceBody {...props} />
    </Dialog>
  );
}

function BulkPriceBody({ restaurantId, currency, category, products, onDone }: BulkProps) {
  const t = useTranslations("menu.bulk");
  const tErr = useErrorMessage();
  const locale = useLocale();
  const dialog = useDialog();
  const toman = isToman(currency);
  const steps = ROUND_STEPS[toman ? "toman" : "other"];
  const factor = toman ? 1000 : 100;
  const [scope, setScope] = useState<"category" | "all">(category ? "category" : "all");
  const [percent, setPercent] = useState("10");
  const [round, setRound] = useState(toman ? steps[1]! : 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pct = Number(percent.replace(",", ".").replace("−", "-"));
  const valid = Number.isFinite(pct) && pct !== 0 && pct >= -50 && pct <= 200;
  const target =
    scope === "category" && category ? products.filter((p) => p.categoryId === category.id) : products;
  const priced = target.filter((p) => p.priceCents > 0);
  const price = (c: number) => formatMoney(c, currency, locale);
  return (
    <div className="space-y-4">
      {category ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("scope")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["category", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                aria-pressed={scope === k}
                className={cn(
                  "h-11 rounded-xl px-3 text-sm font-semibold ring-1",
                  scope === k ? "bg-accent-soft text-accent-text ring-accent" : "ring-border",
                )}
              >
                {k === "category" ? t("scopeCategory", { name: category.name }) : t("scopeAll")}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <Field
        label={t("percent")}
        hint={t("percentHint")}
        inputMode="decimal"
        dir="ltr"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("round")}</legend>
        <div className="flex flex-wrap gap-2">
          {steps.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRound(s)}
              aria-pressed={round === s}
              className={cn(
                "h-9 rounded-full px-3 text-sm ring-1",
                round === s ? "bg-fg font-semibold text-bg ring-fg" : "ring-border",
              )}
            >
              {s === 0 ? t("roundNone") : t("roundTo", { amount: price(Math.round(s * factor)) })}
            </button>
          ))}
        </div>
      </fieldset>
      {valid && priced.length ? (
        <div className="rounded-2xl bg-surface-2 p-3">
          <p className="mb-2 text-sm font-semibold">{t("preview")}</p>
          <ul className="space-y-1 text-sm">
            {priced.slice(0, 5).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-fg-subtle line-through">{price(p.priceCents)}</span>{" "}
                  <b>{price(adjustedPrice(p.priceCents, pct, Math.round(round * factor)))}</b>
                </span>
              </li>
            ))}
          </ul>
          {priced.length > 5 ? (
            <p className="mt-1 text-xs text-fg-muted">{t("more", { count: priced.length - 5 })}</p>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={!valid || pending || !priced.length}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await adjustPricesAction(
                restaurantId,
                scope === "category" && category ? category.id : null,
                pct,
                round,
              );
              if (res && !res.ok) setError(tErr(res.error));
              else {
                onDone((res?.ok && res.data?.changed) || 0);
                dialog?.close();
              }
            })
          }
        >
          <Percent className="size-4" aria-hidden="true" />
          {t("apply", { count: priced.length })}
        </Button>
      </div>
    </div>
  );
}
