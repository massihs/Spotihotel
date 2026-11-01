"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MENU_THEMES, type MenuTheme } from "@/lib/menu-themes";

/** A miniature of the guest menu in each theme, so the owner sees the look before choosing. */
function Preview({ theme }: { theme: MenuTheme }) {
  return (
    <div
      data-menu-theme={theme}
      className="pointer-events-none !min-h-0 overflow-hidden rounded-xl"
      dir="rtl"
    >
      <div className="space-y-2 p-3">
        {theme === "nuit" ? (
          <div className="-mx-3 -mt-3 mb-1 h-12 bg-gradient-to-b from-accent/40 to-transparent" />
        ) : null}
        <div className={cn("flex items-center gap-2", theme === "atelier" && "flex-col gap-1 text-center")}>
          <span className="size-5 shrink-0 rounded-full bg-surface-3" />
          <span className="font-menu-display text-[15px] leading-none font-semibold">Brielle</span>
        </div>
        <div
          className={cn("flex gap-1", theme === "atelier" && "justify-center border-b border-border pb-1")}
        >
          {[0, 1, 2].map((i) =>
            theme === "atelier" ? (
              <span key={i} className={cn("h-1 w-6 rounded-full", i === 0 ? "bg-fg" : "bg-surface-3")} />
            ) : (
              <span key={i} className={cn("h-3 w-8 rounded-full", i === 0 ? "bg-accent" : "bg-surface-2")} />
            ),
          )}
        </div>
        {[0, 1].map((i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2",
              theme === "doux" && "rounded-lg bg-surface p-1.5",
              theme === "atelier" && "border-b border-border pb-1.5 last:border-0",
            )}
          >
            <span
              className={cn(
                "size-7 shrink-0 bg-surface-3",
                theme === "atelier" ? "rounded-full" : "rounded-md",
              )}
            />
            <span className="flex-1 space-y-1">
              <span className="block h-1.5 w-3/4 rounded-full bg-fg/70" />
              <span className="block h-1.5 w-1/3 rounded-full bg-accent/80" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MenuThemePicker({
  name = "menuTheme",
  defaultValue,
  disabled,
  shortPrices,
  toman,
}: {
  name?: string;
  defaultValue: string;
  disabled?: boolean;
  /** Current "prices in thousand tomans" choice (shown for toman menus only). */
  shortPrices?: boolean;
  toman?: boolean;
}) {
  const t = useTranslations("menuThemes");
  const [value, setValue] = useState(defaultValue);
  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{t("label")}</legend>
      <p className="mb-2.5 text-xs text-fg-muted">{t("hint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {MENU_THEMES.map((k) => (
          <label
            key={k}
            className={cn(
              "relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-2 transition-colors",
              value === k
                ? "border-accent ring-2 ring-[var(--ring)]"
                : "border-border hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name={name}
              value={k}
              checked={value === k}
              onChange={() => setValue(k)}
              className="peer sr-only"
            />
            <Preview theme={k} />
            <span className="px-1 pb-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {t(`${k}.name`)}
                {value === k ? <Check className="size-4 text-accent-text" aria-hidden="true" /> : null}
              </span>
              <span className="mt-0.5 block text-xs text-fg-muted">{t(`${k}.desc`)}</span>
            </span>
            <span className="pointer-events-none absolute inset-0 rounded-2xl peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)]" />
          </label>
        ))}
      </div>
      {toman ? (
        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="menuShortPrices"
            defaultChecked={shortPrices}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            {t("shortPrices")}
            <span className="block text-xs text-fg-muted">{t("shortPricesHint")}</span>
          </span>
        </label>
      ) : null}
    </fieldset>
  );
}
