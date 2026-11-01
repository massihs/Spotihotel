"use client";

import { BedDouble, Coffee, Store, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { RESTAURANT_KINDS, type RestaurantKind } from "@/lib/restaurant-kind";

const ICONS: Record<RestaurantKind, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  food_court: Store,
  hotel: BedDouble,
};

/** Radio cards: restaurant, café, food court, hotel. */
export function KindPicker({
  name = "kind",
  defaultValue = "restaurant",
  disabled,
}: {
  name?: string;
  defaultValue?: RestaurantKind;
  disabled?: boolean;
}) {
  const t = useTranslations("kinds");
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{t("label")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RESTAURANT_KINDS.map((k) => {
          const Icon = ICONS[k];
          return (
            <label
              key={k}
              className={cn(
                "relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border-strong bg-surface px-2 py-3 text-center text-sm font-medium transition-colors",
                "hover:border-fg-subtle has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-text",
                "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={k}
                defaultChecked={k === defaultValue}
                className="sr-only"
              />
              <Icon className="size-5" aria-hidden="true" />
              {t(k)}
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-fg-muted">{t("foodCourtHint")}</p>
      <p className="mt-1 text-xs text-fg-muted">{t("hotelHint")}</p>
    </fieldset>
  );
}
