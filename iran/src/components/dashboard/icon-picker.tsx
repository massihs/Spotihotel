"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CATEGORY_ICON_COMPONENTS } from "@/components/category-icon";
import { cn } from "@/lib/cn";
import { CATEGORY_ICON_GROUPS, type CategoryIconGroup, type CategoryIconKey } from "@/lib/category-icons";

/** Grid of the 80 category icons, grouped; submits the chosen key as `name`. */
export function IconPicker({ name, defaultValue }: { name: string; defaultValue: CategoryIconKey }) {
  const t = useTranslations("menu.icons");
  const [value, setValue] = useState<CategoryIconKey>(defaultValue);
  const [group, setGroup] = useState<CategoryIconGroup>(
    () =>
      (Object.keys(CATEGORY_ICON_GROUPS) as CategoryIconGroup[]).find((g) =>
        (CATEGORY_ICON_GROUPS[g] as readonly string[]).includes(defaultValue),
      ) ?? "dishes",
  );
  const Current = CATEGORY_ICON_COMPONENTS[value];

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-fg">
          <Current className="size-[18px]" aria-hidden="true" />
        </span>
        {t("label")}
      </legend>
      <input type="hidden" name={name} value={value} />
      <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto" role="tablist">
        {(Object.keys(CATEGORY_ICON_GROUPS) as CategoryIconGroup[]).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={group === g}
            onClick={() => setGroup(g)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              group === g ? "bg-accent-soft text-accent-text" : "text-fg-muted hover:bg-surface-2",
            )}
          >
            {t(`groups.${g}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8" role="radiogroup" aria-label={t("label")}>
        {CATEGORY_ICON_GROUPS[group].map((key) => {
          const Icon = CATEGORY_ICON_COMPONENTS[key];
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={key}
              title={key}
              onClick={() => setValue(key)}
              className={cn(
                "grid aspect-square place-items-center rounded-xl border transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-text"
                  : "border-border text-fg-muted hover:border-border-strong hover:text-fg",
              )}
            >
              <Icon className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
