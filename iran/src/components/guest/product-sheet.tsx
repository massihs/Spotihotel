"use client";

import { Check, Flame, Plus, Scale, ShoppingBag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addToCartAction } from "@/app/[locale]/table/actions";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import type { PublicProduct } from "@/server/modules/menu/public";
import { priceLine, type PricedOptionGroup } from "@/server/modules/pricing";
import {
  discountPct,
  initialSelection,
  PopularBadge,
  ProductImage,
  QuantityStepper,
  splitDescription,
  TagChip,
  type CartSummary,
} from "./parts";

export { QuantityStepper };

/** Product details as a bottom sheet (native <dialog>: focus trap, Escape, inert page). */
export function ProductSheet({
  product: p,
  currency,
  onClose,
  onAdded,
  popular = false,
  inCart = 0,
  suggestions = [],
  onPick,
  addLocal,
}: {
  product: PublicProduct;
  /** Online ordering: the cart lives in the browser, nothing is sent to the server here. */
  addLocal?: (line: { optionValueIds: string[]; quantity: number; note: string }) => CartSummary;
  currency: string;
  popular?: boolean;
  /** Units of this dish already in the cart. */
  inCart?: number;
  /** Other dishes to suggest with this one (tapping one opens it). */
  suggestions?: PublicProduct[];
  onPick?: (id: string) => void;
  onClose: () => void;
  onAdded: (summary: CartSummary) => void;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(() => initialSelection(p.optionGroups));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const valueIds = useMemo(() => [...selected.values()].flatMap((s) => [...s]), [selected]);
  // Client-side preview only; the server re-prices everything from the database.
  const priced = priceLine(p, valueIds, quantity);
  const missing =
    !priced.ok && priced.error.code === "too_few_options"
      ? p.optionGroups.find((g) => g.id === (priced.error as { groupId: string }).groupId)
      : undefined;
  const pct = discountPct(p);
  const desc = splitDescription(p.description, p.name);

  const toggle = (g: PricedOptionGroup, valueId: string) =>
    setSelected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(g.id));
      if (g.maxSelect === 1) {
        if (set.has(valueId) && g.minSelect === 0) set.clear();
        else {
          set.clear();
          set.add(valueId);
        }
      } else if (set.has(valueId)) set.delete(valueId);
      else if (set.size < g.maxSelect) set.add(valueId);
      next.set(g.id, set);
      return next;
    });

  const rule = (g: PricedOptionGroup) => {
    if (g.minSelect === g.maxSelect)
      return g.minSelect === 1 ? t("guest.pickOne") : t("guest.pickExactly", { n: g.minSelect });
    if (g.minSelect === 0) return t("guest.pickUpTo", { max: g.maxSelect });
    return t("guest.pickBetween", { min: g.minSelect, max: g.maxSelect });
  };

  function add() {
    setError(null);
    if (addLocal) {
      onAdded(addLocal({ optionValueIds: valueIds, quantity, note }));
      return;
    }
    startTransition(async () => {
      const res = await addToCartAction({ productId: p.id, optionValueIds: valueIds, quantity, note });
      if (res?.ok && res.data) onAdded(res.data);
      else if (res && !res.ok)
        setError(t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"));
    });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="sheet-title"
      className="animate-sheet-up m-0 mt-auto max-h-[94dvh] w-full max-w-none overflow-hidden rounded-t-[1.75rem] bg-surface p-0 text-fg backdrop:bg-black/60 sm:m-auto sm:max-w-lg sm:rounded-[1.75rem]"
    >
      <div className="flex max-h-[94dvh] flex-col">
        <div className="relative overflow-y-auto overscroll-contain">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-2 z-10 mx-auto h-1.5 w-10 rounded-full bg-white/80 shadow sm:hidden"
          />
          {p.images[0] ? (
            <ProductImage product={p} size="lg" className="aspect-[4/3] w-full" eager />
          ) : (
            <div className="h-14" />
          )}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("guest.close")}
            className="absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-surface text-fg shadow-[var(--shadow-float)]"
          >
            <X className="size-5" aria-hidden="true" />
          </button>

          <div className="px-5 pt-5 pb-6">
            <header>
              {popular ? <PopularBadge className="mb-2" /> : null}
              <h2
                id="sheet-title"
                className="font-menu-display text-2xl leading-tight font-semibold tracking-tight atelier:text-[34px] atelier:font-medium"
              >
                {p.name}
              </h2>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-lg">
                <span className="font-bold tabular-nums">{money(p.priceCents)}</span>
                {pct ? (
                  <>
                    <s className="text-base text-fg-subtle tabular-nums">{money(p.compareAtPriceCents!)}</s>
                    <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-fg">
                      {t("guest.discount", { pct })}
                    </span>
                  </>
                ) : null}
              </p>
              {desc.latin ? (
                <p
                  className="mt-1 text-sm tracking-wide text-fg-subtle"
                  dir="ltr"
                  style={{ textAlign: "end" }}
                >
                  {desc.latin}
                </p>
              ) : null}
              {desc.text ? <p className="mt-2 leading-7 text-fg-muted">{desc.text}</p> : null}
              {inCart ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm font-medium">
                  <ShoppingBag className="size-4 text-accent-text" aria-hidden="true" />
                  {t("guest.inCart", { n: inCart })}
                </p>
              ) : null}
            </header>

            {p.tags.length || p.caloriesKcal || p.weightGrams ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {p.tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
                {p.caloriesKcal ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium">
                    <Flame className="size-3.5" aria-hidden="true" />
                    {t("guest.kcal", { n: p.caloriesKcal })}
                  </span>
                ) : null}
                {p.weightGrams ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium">
                    <Scale className="size-3.5" aria-hidden="true" />
                    {t("guest.grams", { n: p.weightGrams })}
                  </span>
                ) : null}
              </div>
            ) : null}

            {p.nutrition &&
            (p.nutrition.proteinG != null || p.nutrition.carbsG != null || p.nutrition.fatG != null) ? (
              <dl className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                {(["proteinG", "carbsG", "fatG", "fiberG"] as const).map((k) =>
                  p.nutrition?.[k] != null ? (
                    <div key={k} className="rounded-xl bg-surface-2 px-1 py-2">
                      <dt className="text-[11px] text-fg-muted">{t(`nutrition.short.${k}`)}</dt>
                      <dd className="text-sm font-bold">{t("nutrition.grams", { n: p.nutrition[k] })}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            ) : null}

            {p.ingredients || p.allergens.length ? (
              <div className="mt-4 space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
                {p.ingredients ? (
                  <p>
                    <span className="font-semibold">{t("guest.ingredients")}: </span>
                    <span className="text-fg-muted">{p.ingredients}</span>
                  </p>
                ) : null}
                {p.allergens.length ? (
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{t("guest.allergens")}:</span>
                    {p.allergens.map((a) => (
                      <span key={a} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium">
                        {t(`allergens.${a}`)}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {p.optionGroups.map((g) => {
            const set = selected.get(g.id) ?? new Set<string>();
            const radio = g.maxSelect === 1;
            const unmet = missing?.id === g.id;
            return (
              <fieldset key={g.id} className="border-t-8 border-surface-2">
                <legend className="sr-only">{g.name}</legend>
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
                  <div>
                    <p aria-hidden="true" className="text-lg font-bold">
                      {g.name}
                    </p>
                    <p className="text-sm text-fg-muted">{rule(g)}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      g.minSelect > 0
                        ? unmet
                          ? "bg-warning-soft text-fg"
                          : "bg-surface-2 text-fg"
                        : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {g.minSelect > 0 ? t("guest.required") : t("guest.optionalChoice")}
                  </span>
                </div>
                <div className="px-5 pb-3">
                  {g.values.map((v) => {
                    const checked = set.has(v.id);
                    const disabled = !v.isAvailable || (!radio && !checked && set.size >= g.maxSelect);
                    return (
                      <label
                        key={v.id}
                        className={cn(
                          "flex min-h-14 cursor-pointer items-center gap-3 border-b border-border last:border-0",
                          disabled && !checked && "cursor-not-allowed opacity-45",
                        )}
                      >
                        <input
                          type={radio ? "radio" : "checkbox"}
                          name={`g-${g.id}`}
                          checked={checked}
                          disabled={disabled && !checked}
                          onChange={() => toggle(g, v.id)}
                          onClick={(e) => {
                            // Allow un-selecting an optional radio.
                            if (radio && checked && g.minSelect === 0) {
                              e.preventDefault();
                              toggle(g, v.id);
                            }
                          }}
                          className="peer sr-only"
                        />
                        <span className="flex-1 py-3">
                          <span className="block font-medium">{v.name}</span>
                          {!v.isAvailable ? (
                            <span className="block text-xs text-fg-subtle">{t("guest.soldOut")}</span>
                          ) : v.priceDeltaCents ? (
                            <span className="block text-sm text-fg-muted tabular-nums">
                              +{money(v.priceDeltaCents)}
                            </span>
                          ) : null}
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-6 shrink-0 place-items-center border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]",
                            radio ? "rounded-full" : "rounded-md",
                            checked ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
                          )}
                        >
                          {checked ? (
                            radio ? (
                              <span className="size-2.5 rounded-full bg-white" />
                            ) : (
                              <Check className="size-4" strokeWidth={3} />
                            )
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <label className="block border-t-8 border-surface-2 px-5 pt-5 pb-6">
            <span className="text-lg font-bold">{t("guest.note")}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={280}
              rows={2}
              placeholder={t("guest.notePlaceholder")}
              className="mt-2 w-full resize-none rounded-2xl bg-surface-2 px-4 py-3 text-[16px] placeholder:text-fg-muted focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
            />
          </label>

          {suggestions.length && onPick ? (
            <section className="border-t-8 border-surface-2 pt-5 pb-6" aria-labelledby="sheet-more">
              <h3 id="sheet-more" className="px-5 text-lg font-bold">
                {t("guest.goesWith")}
              </h3>
              <ul className="no-scrollbar mt-3 flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5">
                {suggestions.map((x) => (
                  <li key={x.id} className="w-36 shrink-0 snap-start">
                    <button
                      type="button"
                      onClick={() => onPick(x.id)}
                      className="block w-full overflow-hidden rounded-2xl border border-border bg-surface text-start shadow-[var(--shadow-soft)] active:scale-[0.98]"
                    >
                      <span className="relative block">
                        <ProductImage product={x} size="sm" className="aspect-square w-full" />
                        <span className="absolute end-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-accent text-accent-fg shadow-accent">
                          <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
                        </span>
                      </span>
                      <span className="block p-2.5">
                        <span className="line-clamp-1 text-sm font-semibold">{x.name}</span>
                        <span className="mt-0.5 block text-xs font-bold text-fg-muted tabular-nums">
                          {money(x.priceCents)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="border-t border-border bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p role="alert" className="mb-2 text-sm font-medium text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={add}
              disabled={!priced.ok || pending}
              aria-busy={pending}
              className="flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-full bg-accent px-5 font-bold text-accent-fg transition-transform active:scale-[0.98] disabled:opacity-40"
            >
              {!p.isAvailable ? (
                <span className="mx-auto">{t("guest.soldOut")}</span>
              ) : missing ? (
                <span className="mx-auto truncate">{`${missing.name} · ${t("guest.required")}`}</span>
              ) : (
                <>
                  <span>{t("common.add")}</span>
                  <span className="truncate tabular-nums">
                    {money(priced.ok ? priced.line.lineTotalCents : p.priceCents * quantity)}
                  </span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
