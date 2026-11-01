"use client";

import {
  Award,
  BadgeCheck,
  Flame,
  House,
  Leaf,
  Minus,
  Plus,
  Sparkles,
  Sprout,
  Trash2,
  TrendingUp,
  WheatOff,
  type LucideIcon,
} from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { useTranslations } from "next-intl";
import type { PricedOptionGroup } from "@/server/modules/pricing";
import type { PublicProduct } from "@/server/modules/menu/public";
import { cn } from "@/lib/cn";

export type CartSummary = {
  itemCount: number;
  totalCents: number;
  /** Units of each product already in the cart (badge on the menu cards). */
  byProduct: Record<string, number>;
};

/** Default selections: each group's defaults that are still available, within its maximum. */
export function initialSelection(groups: PricedOptionGroup[]) {
  const m = new Map<string, Set<string>>();
  for (const g of groups) {
    const defaults = g.values.filter((v) => v.isDefault && v.isAvailable).slice(0, g.maxSelect);
    m.set(g.id, new Set(defaults.map((v) => v.id)));
  }
  return m;
}

/** A product can be added with one tap when its default choices already satisfy every group. */
export function canQuickAdd(p: PublicProduct) {
  if (!p.isAvailable) return false;
  const sel = initialSelection(p.optionGroups);
  return p.optionGroups.every((g) => (sel.get(g.id)?.size ?? 0) >= g.minSelect);
}

/**
 * Splits a description that starts with the dish's Latin name ("Rock Shrimp · میگو، هویج…")
 * into that name (shown on its own small line) and the rest.
 */
export function splitDescription(
  desc: string | null,
  name: string,
): { latin: string | null; text: string | null } {
  // Only a Persian/Arabic dish name has a Latin translation worth its own line.
  if (!desc || !/[\u0600-\u06FF]/.test(name)) return { latin: null, text: desc };
  const m = /^([A-Za-z0-9&'’.,\-\s]+?)\s*(?:·\s*([\s\S]*))?$/.exec(desc.trim());
  if (m && /[A-Za-z]/.test(m[1]!) && !/[\u0600-\u06FF]/.test(m[1]!))
    return { latin: m[1]!.trim(), text: m[2]?.trim() || null };
  return { latin: null, text: desc };
}

export function discountPct(p: PublicProduct) {
  if (!p.compareAtPriceCents || p.compareAtPriceCents <= p.priceCents) return 0;
  return Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100);
}

/** Known menu tags: icon and tone. Unknown (custom) tags render as plain text chips. */
export const TAG_META: Record<string, { Icon: LucideIcon; tone: string }> = {
  vegetarian: { Icon: Leaf, tone: "bg-tone-emerald/12 text-tone-emerald" },
  vegan: { Icon: Sprout, tone: "bg-tone-lime/15 text-tone-lime" },
  spicy: { Icon: Flame, tone: "bg-tone-rose/12 text-tone-rose" },
  gluten_free: { Icon: WheatOff, tone: "bg-tone-amber/18 text-tone-amber" },
  new: { Icon: Sparkles, tone: "bg-tone-sky/12 text-tone-sky" },
  signature: { Icon: Award, tone: "bg-tone-violet/12 text-tone-violet" },
  halal: { Icon: BadgeCheck, tone: "bg-tone-teal/12 text-tone-teal" },
  homemade: { Icon: House, tone: "bg-tone-orange/12 text-tone-orange" },
};

export function tagLabel(t: (k: string) => string, has: (k: string) => boolean, tag: string) {
  return has(`tags.${tag}`) ? t(`tags.${tag}`) : tag.replace(/_/g, " ");
}

/** Small tag chip with its icon ("compact" = icon only, label kept for screen readers). */
export function TagChip({ tag, compact, className }: { tag: string; compact?: boolean; className?: string }) {
  const t = useTranslations();
  const meta = TAG_META[tag];
  const label = tagLabel(t, t.has, tag);
  if (compact && meta)
    return (
      <span title={label} className={cn("grid size-6 place-items-center rounded-full", meta.tone, className)}>
        <meta.Icon className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        meta?.tone ?? "bg-surface-2 text-fg-muted",
        className,
      )}
    >
      {meta ? <meta.Icon className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

export function PopularBadge({ className }: { className?: string }) {
  const t = useTranslations("guest");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-tone-orange px-2 py-0.5 text-[11px] font-bold text-white shadow-sm atelier:bg-fg atelier:text-bg atelier:shadow-none nuit:bg-accent nuit:text-accent-fg",
        className,
      )}
    >
      <TrendingUp className="size-3" aria-hidden="true" />
      {t("popular")}
    </span>
  );
}

/** "2×" on a card: how many of this dish are already in the cart. */
export function InCartBadge({ n, className }: { n: number; className?: string }) {
  const t = useTranslations("guest");
  if (!n) return null;
  return (
    <span
      className={cn(
        "animate-pop-in grid h-6 min-w-6 place-items-center rounded-full bg-fg px-1.5 text-xs font-bold text-bg tabular-nums shadow",
        className,
      )}
      aria-label={t("inCart", { n })}
      dir="ltr"
    >
      {n}×
    </span>
  );
}

/** Photo-less dishes get a soft tile with their category icon, so every card keeps its rhythm. */
export function DishPlaceholder({ icon, className }: { icon: string; className?: string }) {
  return (
    <div className={cn("grid place-items-center bg-accent-soft text-accent-text/70", className)}>
      <CategoryIcon icon={icon} className="size-1/3 min-h-6 min-w-6" />
    </div>
  );
}

export function ProductImage({
  product,
  size,
  className,
  eager,
}: {
  product: PublicProduct;
  size: "sm" | "md" | "lg";
  className?: string;
  eager?: boolean;
}) {
  const img = product.images[0];
  if (!img) return <div className={cn("bg-surface-2", className)} />;
  return (
    <img
      src={img[size]}
      srcSet={`${img.sm} 320w, ${img.md} 640w, ${img.lg} 1280w`}
      sizes={size === "sm" ? "112px" : size === "md" ? "256px" : "100vw"}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("bg-surface-2 bg-cover object-cover", className)}
      style={img.placeholder ? { backgroundImage: `url(${img.placeholder})` } : undefined}
    />
  );
}

export function Price({
  product: p,
  money,
  className,
}: {
  product: PublicProduct;
  money: (c: number) => string;
  className?: string;
}) {
  const t = useTranslations("guest");
  const pct = discountPct(p);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px]", className)}>
      <span className="font-bold text-fg tabular-nums atelier:font-medium nuit:text-accent-text">
        {money(p.priceCents)}
      </span>
      {pct ? (
        <>
          <s className="text-sm text-fg-subtle tabular-nums">{money(p.compareAtPriceCents!)}</s>
          <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-fg">
            {t("discount", { pct })}
          </span>
        </>
      ) : null}
      {!p.isAvailable ? (
        <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-fg-muted">
          {t("soldOut")}
        </span>
      ) : null}
    </span>
  );
}

/** Round "+" button laid over a product photo (or inline when there is none). */
export function AddButton({
  label,
  onClick,
  busy,
  className,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-busy={busy}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg shadow-accent",
        "atelier:bg-transparent atelier:text-fg atelier:shadow-none atelier:ring-1 atelier:ring-fg nuit:shadow-none",
        "transition-transform active:scale-90 disabled:opacity-60",
        className,
      )}
    >
      <Plus className={cn("size-5", busy && "animate-spin")} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

export function QuantityStepper({
  value,
  onChange,
  onRemove,
  min = 1,
  max = 99,
  disabled,
  size = "lg",
}: {
  value: number;
  onChange: (n: number) => void;
  /** When set, the "−" button becomes a bin at the minimum and removes the line. */
  onRemove?: () => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const t = useTranslations("guest");
  const removing = onRemove && value <= min;
  const btn = cn(
    "grid place-items-center rounded-full transition-colors active:bg-surface-3 disabled:opacity-30",
    size === "lg" ? "size-12" : "size-9",
  );
  return (
    <div
      className={cn("flex shrink-0 items-center rounded-full bg-surface-2", size === "lg" ? "h-12" : "h-9")}
      role="group"
      aria-label={t("quantity")}
    >
      <button
        type="button"
        aria-label={removing ? t("remove") : t("decrease")}
        disabled={disabled || (!removing && value <= min)}
        onClick={() => (removing ? onRemove() : onChange(value - 1))}
        className={btn}
      >
        {removing ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : (
          <Minus className="size-4" strokeWidth={2.5} aria-hidden="true" />
        )}
      </button>
      <span
        className={cn("text-center font-bold tabular-nums", size === "lg" ? "w-7 text-base" : "w-5 text-sm")}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={t("increase")}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className={btn}
      >
        <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
