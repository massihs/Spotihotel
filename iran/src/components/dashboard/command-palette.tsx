"use client";

import { CornerDownLeft, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type SearchEntry = {
  href: string;
  label: string;
  /** Section or parent page, shown on the right and searched too. */
  hint?: string;
  icon?: ReactNode;
};

/** Folds Arabic/Persian letter variants, diacritics and case so "كافه" finds "کافه". */
function fold(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ̀-ͯ]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[أإآ]/g, "ا")
    .replace(/‌/g, " ");
}

/** Go-anywhere search for the dashboard: Ctrl/⌘ + K, or the search button in the top bar. */
export function CommandPalette({ entries }: { entries: SearchEntry[] }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const words = fold(q).split(/\s+/).filter(Boolean);
  const results = entries.filter((e) => {
    const hay = fold(`${e.label} ${e.hint ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  const close = () => {
    setOpen(false);
    setQ("");
    setCursor(0);
  };
  const go = (e: SearchEntry | undefined) => {
    if (!e) return;
    close();
    router.push(e.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(1, results.length);
      setCursor(next);
      list.current?.children[next]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search")}
        className="flex h-10 items-center gap-2 rounded-full bg-surface-2 px-3 text-sm text-fg-subtle ring-1 ring-border transition-colors hover:text-fg max-sm:w-10 max-sm:justify-center max-sm:px-0 sm:w-56 lg:w-72"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-start max-sm:hidden">{t("searchPlaceholder")}</span>
        <kbd
          className="rounded-md bg-surface px-1.5 py-0.5 font-sans text-[11px] text-fg-subtle ring-1 ring-border max-lg:hidden"
          dir="ltr"
        >
          Ctrl K
        </kbd>
      </button>
      <dialog
        ref={dialog}
        onClose={close}
        onClick={(e) => e.target === dialog.current && close()}
        aria-label={t("search")}
        className="m-0 mx-auto mt-[8vh] w-[calc(100%-1.5rem)] max-w-xl rounded-2xl bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
      >
        {open ? (
          <div className="animate-pop-in" onKeyDown={onKeyDown}>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-5 shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setCursor(0);
                }}
                placeholder={t("searchPlaceholder")}
                aria-label={t("search")}
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-results"
                aria-activedescendant={results[active] ? `pal-${active}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-fg-subtle focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="grid size-8 place-items-center rounded-full text-fg-subtle hover:bg-surface-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ul
              ref={list}
              id="palette-results"
              role="listbox"
              className="max-h-[60vh] [scrollbar-width:thin] overflow-y-auto p-2"
            >
              {results.map((e, i) => (
                <li
                  key={e.href}
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => go(e)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5",
                    i === active ? "bg-accent-soft text-accent-text" : "text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4",
                      i === active ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
                    )}
                    aria-hidden="true"
                  >
                    {e.icon ?? <CornerDownLeft />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{e.label}</span>
                  {e.hint ? <span className="shrink-0 truncate text-xs text-fg-subtle">{e.hint}</span> : null}
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-3 py-10 text-center text-sm text-fg-subtle">{t("noResults")}</li>
              ) : null}
            </ul>
            <p className="flex items-center gap-3 border-t border-border px-4 py-2 text-xs text-fg-subtle max-sm:hidden">
              <span dir="ltr">↑ ↓</span> {t("searchMove")}
              <span dir="ltr">Enter</span> {t("searchOpen")}
              <span dir="ltr">Esc</span> {t("close")}
            </p>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
