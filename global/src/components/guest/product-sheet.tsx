"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { priceLine, type PricedOptionGroup } from "@/server/modules/pricing";
import type { PublicProduct } from "@/server/modules/menu/public";
import { addToCartAction } from "@/app/[locale]/table/actions";
import { ProductImage, useMoney, type CartSummary } from "./menu-app";

function initialSelection(groups: PricedOptionGroup[]) {
  const m = new Map<string, Set<string>>();
  for (const g of groups) {
    const defaults = g.values.filter((v) => v.isDefault && v.isAvailable).slice(0, g.maxSelect);
    m.set(g.id, new Set(defaults.map((v) => v.id)));
  }
  return m;
}

export function ProductSheet({
  product: p,
  currency,
  onClose,
  onAdded,
}: {
  product: PublicProduct;
  currency: string;
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
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl bg-surface p-0 text-fg backdrop:bg-black/50 sm:m-auto sm:max-w-lg sm:rounded-3xl"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="relative overflow-y-auto overscroll-contain">
          {p.images[0] ? <ProductImage product={p} size="lg" className="aspect-[4/3] w-full" eager /> : null}
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t("guest.close")}
            className="absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-surface/90 text-fg shadow"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>

          <div className="space-y-5 p-5">
            <header>
              <h2 id="sheet-title" className="text-xl font-semibold">
                {p.name}
              </h2>
              <p className="mt-1 flex items-center gap-2">
                <span className="font-semibold tabular-nums">{money(p.priceCents)}</span>
                {p.compareAtPriceCents ? (
                  <s className="text-fg-subtle tabular-nums">{money(p.compareAtPriceCents)}</s>
                ) : null}
              </p>
              {p.description ? <p className="mt-2 text-fg-muted">{p.description}</p> : null}
            </header>

            {p.ingredients || p.allergens.length || p.caloriesKcal || p.weightGrams || p.tags.length ? (
              <div className="space-y-2 text-sm">
                {p.ingredients ? (
                  <p>
                    <span className="font-medium">{t("guest.ingredients")} : </span>
                    <span className="text-fg-muted">{p.ingredients}</span>
                  </p>
                ) : null}
                {p.allergens.length ? (
                  <div>
                    <span className="font-medium">{t("guest.allergens")} : </span>
                    <span className="inline-flex flex-wrap gap-1 align-middle">
                      {p.allergens.map((a) => (
                        <span key={a} className="rounded-full bg-warning-soft px-2 py-0.5 text-xs">
                          {t(`allergens.${a}`)}
                        </span>
                      ))}
                    </span>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent"
                    >
                      {t.has(`tags.${tag}`) ? t(`tags.${tag}`) : tag.replace(/_/g, " ")}
                    </span>
                  ))}
                  {p.caloriesKcal ? (
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
                      {t("guest.kcal", { n: p.caloriesKcal })}
                    </span>
                  ) : null}
                  {p.weightGrams ? (
                    <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
                      {t("guest.grams", { n: p.weightGrams })}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {p.optionGroups.map((g) => {
              const set = selected.get(g.id) ?? new Set<string>();
              const radio = g.maxSelect === 1;
              const unmet = missing?.id === g.id;
              return (
                <fieldset key={g.id} className="space-y-2">
                  <legend className="flex w-full items-center justify-between gap-2">
                    <span className="font-semibold">{g.name}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        g.minSelect > 0
                          ? unmet
                            ? "bg-accent text-accent-fg"
                            : "bg-surface-2 text-fg"
                          : "text-fg-subtle",
                      )}
                    >
                      {g.minSelect > 0 ? t("guest.required") : t("guest.optionalChoice")}
                    </span>
                  </legend>
                  <p className="text-sm text-fg-muted">{rule(g)}</p>
                  <div className="divide-y divide-border rounded-2xl border border-border">
                    {g.values.map((v) => {
                      const checked = set.has(v.id);
                      const disabled = !v.isAvailable || (!radio && !checked && set.size >= g.maxSelect);
                      return (
                        <label
                          key={v.id}
                          className={cn(
                            "flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2",
                            disabled && !checked && "cursor-not-allowed opacity-50",
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
                            className="size-5 accent-[var(--accent)]"
                          />
                          <span className="flex-1">{v.name}</span>
                          {!v.isAvailable ? (
                            <span className="text-xs text-fg-subtle">{t("guest.soldOut")}</span>
                          ) : v.priceDeltaCents ? (
                            <span className="text-sm text-fg-muted tabular-nums">
                              +{money(v.priceDeltaCents)}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}

            <label className="block space-y-1.5">
              <span className="font-semibold">{t("guest.note")}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                rows={2}
                placeholder={t("guest.notePlaceholder")}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[16px] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
              />
            </label>
          </div>
        </div>

        <footer className="border-t border-border bg-surface px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error ? (
            <p role="alert" className="mb-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={add}
              disabled={!priced.ok || pending}
              className="h-12 flex-1 rounded-2xl bg-accent px-4 font-semibold text-accent-fg disabled:opacity-50"
            >
              {!p.isAvailable
                ? t("guest.soldOut")
                : missing
                  ? `${missing.name} · ${t("guest.required").toLowerCase()}`
                  : t("guest.add", {
                      price: money(priced.ok ? priced.line.lineTotalCents : p.priceCents * quantity),
                    })}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const t = useTranslations("guest");
  return (
    <div
      className="flex h-12 items-center rounded-2xl border border-border"
      role="group"
      aria-label={t("quantity")}
    >
      <button
        type="button"
        aria-label={t("decrease")}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-12 place-items-center text-xl disabled:opacity-30"
      >
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={t("increase")}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-12 place-items-center text-xl disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
