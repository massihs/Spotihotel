"use client";

import { BedDouble, CornerDownLeft, LoaderCircle, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { searchStaysAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { useDay } from "@/components/pms/kit";
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

type StayHit = {
  id: string;
  number: number;
  status: string;
  arrival: string;
  departure: string;
  firstName: string;
  lastName: string;
  room: string | null;
  typeCode: string | null;
};

/**
 * Go-anywhere search for the dashboard: Ctrl/⌘ + K, or the search button in the top bar. In a
 * hotel it also finds bookings (guest, booking or room number, phone, national code).
 */
export function CommandPalette({ entries, staysOf }: { entries: SearchEntry[]; staysOf?: string }) {
  const t = useTranslations("nav");
  const tStatus = useTranslations("pms.status");
  const day = useDay();
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

  // Bookings, asked to the server as the desk types (a short pause first).
  const [hits, setHits] = useState<{ q: string; list: StayHit[] }>({ q: "", list: [] });
  const term = q.trim();
  const wantStays = !!staysOf && open && term.length >= 2;
  useEffect(() => {
    if (!wantStays || !staysOf) return;
    let live = true;
    const id = setTimeout(async () => {
      const res = await searchStaysAction(staysOf, term);
      if (live && res?.ok) setHits({ q: term, list: (res.data ?? []) as StayHit[] });
    }, 180);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [wantStays, staysOf, term]);
  const searching = wantStays && hits.q !== term;
  const stayEntries: SearchEntry[] =
    wantStays && hits.q === term
      ? hits.list.map((h) => ({
          href: `/dashboard/${staysOf}/stays/${h.id}`,
          label: `${h.firstName} ${h.lastName} · #${h.number}`,
          hint: [
            tStatus.has(h.status as "confirmed") ? tStatus(h.status as "confirmed") : h.status,
            h.room ?? h.typeCode,
            `${day(h.arrival)} → ${day(h.departure)}`,
          ]
            .filter(Boolean)
            .join(" | "),
          icon: <BedDouble />,
        }))
      : [];

  const words = fold(q).split(/\s+/).filter(Boolean);
  const results = [
    ...stayEntries,
    ...entries.filter((e) => {
      const hay = fold(`${e.label} ${e.hint ?? ""}`);
      return words.every((w) => hay.includes(w));
    }),
  ];
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
        className="flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm text-fg-subtle ring-1 ring-border transition-colors duration-150 ring-inset hover:bg-surface hover:text-fg hover:ring-border-strong max-sm:w-9 max-sm:justify-center max-sm:bg-transparent max-sm:px-0 max-sm:ring-0 sm:w-56 lg:w-72"
      >
        <Search className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-start max-sm:hidden">
          {staysOf ? t("searchPlaceholderHotel") : t("searchPlaceholder")}
        </span>
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
                placeholder={staysOf ? t("searchPlaceholderHotel") : t("searchPlaceholder")}
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
              {searching ? (
                <li className="flex items-center justify-center gap-2 px-3 py-3 text-sm text-fg-subtle">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                  {t("searchingStays")}
                </li>
              ) : null}
              {results.length === 0 && !searching ? (
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
