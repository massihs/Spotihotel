"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** Collapses the sidebar body behind a menu button below the `lg` breakpoint. */
export function CollapsibleNav({ header, children }: { header: ReactNode; children: ReactNode }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    // Close the menu after navigating.
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:py-4">
        {header}
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 lg:hidden"
          aria-expanded={open}
          aria-controls="app-sidebar-body"
          aria-label={t("toggleNav")}
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <div
        id="app-sidebar-body"
        className={cn("flex-col lg:flex lg:flex-1 lg:overflow-hidden", open ? "flex" : "hidden")}
      >
        {children}
      </div>
    </>
  );
}
