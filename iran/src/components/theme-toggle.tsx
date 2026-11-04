"use client";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { THEME_KEY } from "@/lib/theme";

const THEME_EVENT = "sh-theme-change";

function subscribe(cb: () => void) {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
const isDark = () => document.documentElement.dataset.theme === "dark";

/** Day / night switch: day by default, the choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common.theme");
  const dark = useSyncExternalStore(subscribe, isDark, () => false);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private mode: applies to this page only */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  const label = dark ? t("toLight") : t("toDark");
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className={cn(
        "inline-grid size-9 shrink-0 place-items-center rounded-full text-fg-muted ring-1 ring-border hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {dark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
    </button>
  );
}
