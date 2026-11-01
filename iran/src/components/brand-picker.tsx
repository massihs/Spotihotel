"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { BRAND_COLORS, brandSwatch, type BrandColor } from "@/lib/brand-colors";

/**
 * Brand color radio swatches. The choice previews live: the closest `[data-brand]` scope
 * (dashboard shell) switches immediately; saving the form makes it permanent.
 */
export function BrandPicker({
  name = "brandColor",
  defaultValue,
  disabled,
}: {
  name?: string;
  defaultValue: string;
  disabled?: boolean;
}) {
  const t = useTranslations("brandColors");
  const [value, setValue] = useState(defaultValue);
  const pick = (k: BrandColor, el: HTMLElement) => {
    setValue(k);
    const scope = el.closest<HTMLElement>("[data-brand]");
    if (scope) scope.dataset.brand = k;
  };
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{t("label")}</legend>
      <p className="mb-2.5 text-xs text-fg-muted">{t("hint")}</p>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
        {BRAND_COLORS.map((b) => (
          <label key={b.key} className="group relative flex flex-col items-center gap-1" title={t(b.key)}>
            <input
              type="radio"
              name={name}
              value={b.key}
              checked={value === b.key}
              onChange={(e) => pick(b.key, e.currentTarget)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "grid size-10 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-surface transition-transform group-hover:scale-110",
                "peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]",
                value === b.key && "ring-2 ring-fg",
              )}
              style={{ background: brandSwatch(b.key) }}
            >
              {value === b.key ? (
                <Check
                  className="size-5"
                  style={{ color: "dark" in b && b.dark ? "#3a2a00" : "white" }}
                  aria-hidden="true"
                />
              ) : null}
            </span>
            <span className="text-[10px] text-fg-muted">{t(b.key)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
