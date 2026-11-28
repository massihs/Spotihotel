"use client";

import {
  BedDouble,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  ConciergeBell,
  HeartHandshake,
  Landmark,
  LayoutGrid,
  LoaderCircle,
  Search,
  Settings2,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "@/components/icons";
import { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { NAV_OPEN_COOKIE } from "./nav-cookie";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  /** Shown in the mobile bottom tab bar (keep it to 4 items). */
  primary?: boolean;
  /** Count shown on the item (e.g. new orders); hidden at 0. */
  badge?: number;
  /** Sidebar section label; a heading is drawn when it changes. */
  group?: string;
  /** Stable id of the section (collapse state is remembered per device). */
  groupKey?: string;
  /** Sub-pages (the tabs of the page, `?tab=`), unfolded under the item; `group` heads a category. */
  children?: { href: string; label: string; group?: string }[];
};

type Section = { key: string; label?: string; items: NavItem[] };
function sections(items: NavItem[]): Section[] {
  const out: Section[] = [];
  for (const item of items) {
    const key = item.groupKey ?? item.group ?? "";
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(item);
    else out.push({ key, label: item.group, items: [item] });
  }
  return out;
}

/**
 * Sections the person opened by hand (besides the one of the current page, always open), kept in
 * a cookie so the server draws the menu as it was left: no jump after loading.
 */
function saveOpen(keys: Set<string>) {
  document.cookie = `${NAV_OPEN_COOKIE}=${encodeURIComponent([...keys].join(","))}; path=/; max-age=31536000; samesite=lax`;
}

/** Plain text for matching: lower case, Arabic letters as Persian ones, no ZWNJ. */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/\u200c/g, " ")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .trim();
}

/** A section's icon, by its key. */
const SECTION_ICON: Record<string, ReactNode> = {
  reception: <ConciergeBell />,
  rooms: <BedDouble />,
  revenue: <TrendingUp />,
  finance: <Landmark />,
  restaurant: <UtensilsCrossed />,
  sales: <UtensilsCrossed />,
  catalog: <BookOpen />,
  guests: <HeartHandshake />,
  manage: <Settings2 />,
};

/** Opens and closes smoothly (grid rows 0fr ↔ 1fr); closed content is out of the tab order. */
function Collapse({
  open,
  id,
  children,
  className,
}: {
  open: boolean;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/** Icon tile colors, by the item's last path segment (static class names for Tailwind). */
const TONES: Record<string, string> = {
  violet: "bg-tone-violet/15 text-tone-violet",
  sky: "bg-tone-sky/15 text-tone-sky",
  amber: "bg-tone-amber/20 text-tone-amber",
  rose: "bg-tone-rose/15 text-tone-rose",
  teal: "bg-tone-teal/15 text-tone-teal",
  orange: "bg-tone-orange/15 text-tone-orange",
  emerald: "bg-tone-emerald/15 text-tone-emerald",
  fuchsia: "bg-tone-fuchsia/15 text-tone-fuchsia",
  indigo: "bg-tone-indigo/20 text-tone-indigo",
  lime: "bg-tone-lime/15 text-tone-lime",
};
const BY_SEGMENT: Record<string, keyof typeof TONES> = {
  kitchen: "orange",
  frontdesk: "indigo",
  planning: "teal",
  stays: "sky",
  guests: "fuchsia",
  wellness: "emerald",
  ledger: "amber",
  hotel: "violet",
  chain: "indigo",
  blocks: "orange",
  forecast: "lime",
  delivery: "sky",
  reservations: "fuchsia",
  pos: "emerald",
  orders: "sky",
  floor: "teal",
  menu: "rose",
  inventory: "amber",
  customers: "fuchsia",
  reports: "indigo",
  branches: "lime",
  payments: "emerald",
  invoices: "sky",
  tables: "violet",
  music: "fuchsia",
  team: "teal",
  settings: "indigo",
  restaurants: "sky",
  users: "teal",
  plans: "amber",
  audit: "rose",
};
const ORDER = Object.keys(TONES);
/** Sidebar icons: a different blue for each item (sections start at different points). */
const SHADE_CYCLE = [
  "shade-sky",
  "shade-azure",
  "shade-cyan",
  "shade-periwinkle",
  "shade-royal",
  "shade-indigo",
];
const NAV_SHADES = Array.from({ length: 60 }, (_, i) => SHADE_CYCLE[i % SHADE_CYCLE.length]!);
const SECTION_OFFSET: Record<string, number> = {
  reception: 1,
  rooms: 2,
  revenue: 3,
  finance: 4,
  restaurant: 5,
  manage: 2,
};
export function toneOf(item: NavItem, index: number) {
  const seg = item.href.split("/").filter(Boolean).pop() ?? "";
  return TONES[BY_SEGMENT[seg] ?? ORDER[index % ORDER.length]!]!;
}

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "k-cut k-sm grid h-5 min-w-5 place-items-center bg-danger px-1.5 text-[11px] leading-none font-bold text-white tabular-nums",
        className,
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/**
 * Spinner on the link just clicked while its page loads: a slow page never looks like a dead
 * click (must sit inside the <Link>).
 */
function Pending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <LoaderCircle className={cn("size-4 shrink-0 animate-spin", className)} aria-hidden="true" />;
}

function useActive() {
  const pathname = usePathname();
  return (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Desktop sidebar navigation (dark sidebar). Categories open and close like an accordion (the
 * current page's always open, the others as the person left them); pages with sub-pages unfold
 * them as a tree, grouped when the page has categories of tabs; a search box filters it all.
 */
export function SidebarNav({
  items,
  label,
  initialOpen = [],
}: {
  items: NavItem[];
  label: string;
  /** Sections opened by hand (cookie), so the server draws the menu as it was left. */
  initialOpen?: string[];
}) {
  const t = useTranslations("nav");
  const isActive = useActive();
  const [opened, setOpened] = useState<Set<string>>(() => new Set(initialOpen));
  // Items whose sub-pages were folded or unfolded by hand: the active one is open by default.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const query = norm(q);
  const list = useRef<HTMLElement>(null);
  const flip = (href: string) =>
    setFlipped((f) => {
      const n = new Set(f);
      if (n.has(href)) n.delete(href);
      else n.add(href);
      return n;
    });
  const toggleSection = (key: string) =>
    setOpened((o) => {
      const n = new Set(o);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      saveOpen(n);
      return n;
    });
  const all = sections(items);
  const allOpen = all.every((sec) => !sec.label || opened.has(sec.key) || sec.items.some(isActive));
  const setAll = (open: boolean) => {
    const n = new Set(open ? all.filter((sec) => sec.label).map((sec) => sec.key) : []);
    saveOpen(n);
    setOpened(n);
  };

  // Bring the current page into view in a long menu (once, without moving the page itself).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = el?.closest<HTMLElement>("[data-nav-scroll]");
    if (!el || !box) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    if (top < 0 || top > box.clientHeight - 60) box.scrollTop += top - box.clientHeight / 3;
  }, []);

  // While searching: the items whose name, or one of whose sub-pages, matches.
  const match = (item: NavItem) =>
    !query || norm(item.label).includes(query) || !!item.children?.some((c) => norm(c.label).includes(query));
  const shown = all
    .map((sec) => ({ ...sec, items: sec.items.filter(match) }))
    .filter((sec) => sec.items.length > 0);

  return (
    <nav ref={list} aria-label={label}>
      <div className="sticky top-0 z-10 -mx-1 mb-1 bg-sidebar/90 px-1 pt-1 pb-2 backdrop-blur">
        <label className="flex h-9 items-center gap-2 rounded-xl bg-white/[0.06] px-3 ring-1 ring-white/[0.08] transition-[box-shadow,background-color] focus-within:bg-white/[0.09] focus-within:ring-[var(--brass)]/60">
          <Search className="size-4 shrink-0 text-sidebar-muted" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQ("");
              if (e.key === "Enter") {
                const first = list.current?.querySelector<HTMLAnchorElement>("[data-nav-item]");
                first?.click();
              }
            }}
            placeholder={t("filter")}
            aria-label={t("filter")}
            data-bare=""
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-sidebar-fg shadow-none outline-none placeholder:text-sidebar-muted/70 focus:ring-0"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              className="grid size-5 place-items-center rounded-full text-sidebar-muted hover:text-sidebar-fg"
              aria-label={t("close")}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAll(!allOpen)}
              className="grid size-6 place-items-center rounded-md text-sidebar-muted hover:bg-white/[0.08] hover:text-sidebar-fg"
              title={allOpen ? t("collapseAll") : t("expandAll")}
              aria-label={allOpen ? t("collapseAll") : t("expandAll")}
            >
              {allOpen ? (
                <ChevronsDownUp className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronsUpDown className="size-3.5" aria-hidden="true" />
              )}
            </button>
          )}
        </label>
      </div>
      {!shown.length ? (
        <p className="px-3 py-6 text-center text-[13px] text-sidebar-muted">{t("filterNone")}</p>
      ) : null}
      <div className="space-y-1">
        {shown.map((section) => {
          const hasActive = section.items.some(isActive);
          const open = !section.label || !!query || hasActive || opened.has(section.key);
          const badge = section.items.reduce((n, i) => n + (i.badge ?? 0), 0);
          const id = `nav-${section.key}`;
          return (
            <div key={section.key || "top"} className={cn(section.label && "pt-1")}>
              {section.label ? (
                <button
                  type="button"
                  onClick={() => !hasActive && toggleSection(section.key)}
                  aria-expanded={open}
                  aria-controls={id}
                  className={cn(
                    "group/h k-cut flex w-full items-center gap-2.5 px-2 py-1.5 text-start transition-colors duration-200",
                    hasActive ? "cursor-default" : "hover:bg-white/[0.045]",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md ring-1 transition-colors [&_svg]:size-[15px]",
                      hasActive
                        ? "bg-[var(--brass)]/15 text-[var(--brass)] ring-[var(--brass)]/30"
                        : "bg-white/[0.05] text-sidebar-muted ring-white/[0.08] group-hover/h:text-sidebar-fg",
                    )}
                    aria-hidden="true"
                  >
                    {SECTION_ICON[section.key] ?? <LayoutGrid />}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[15px] font-bold tracking-wide transition-colors",
                      hasActive ? "text-sidebar-fg" : "text-sidebar-muted group-hover/h:text-sidebar-fg",
                    )}
                  >
                    {section.label}
                  </span>
                  {!open && badge ? (
                    <Badge n={badge} />
                  ) : (
                    <span
                      className="k-cut k-sm bg-white/[0.06] px-1.5 py-0.5 text-[12px] text-sidebar-muted tabular-nums"
                      title={t("sectionCount", { n: section.items.length })}
                    >
                      {section.items.length}
                    </span>
                  )}
                  {hasActive ? null : (
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-sidebar-muted transition-transform duration-300",
                        !open && "-rotate-90 rtl:rotate-90",
                      )}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ) : null}
              <Collapse open={open} id={id}>
                <div
                  className={cn(
                    "space-y-0.5 pt-0.5",
                    section.label && "ms-[1.05rem] border-s border-white/[0.07] ps-2",
                  )}
                >
                  {section.items.map((item, index) => {
                    const active = isActive(item);
                    const hasSub = !!item.children?.length;
                    const childMatch = !!query && !!item.children?.some((c) => norm(c.label).includes(query));
                    const subOpen = hasSub && (childMatch || active !== flipped.has(item.href));
                    return (
                      <div key={item.href}>
                        <Link
                          href={item.href}
                          data-nav-item=""
                          aria-current={active ? "page" : undefined}
                          aria-expanded={hasSub ? subOpen : undefined}
                          onClick={(e) => {
                            if (!hasSub) return;
                            if (active) {
                              // Already on this page: the click folds or unfolds its sub-menu.
                              e.preventDefault();
                              flip(item.href);
                            } else if (flipped.has(item.href)) {
                              flip(item.href);
                            }
                          }}
                          className={cn(
                            "group k-cut k-sm relative flex h-10 items-center gap-3 px-2.5 text-[15px] font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.985]",
                            active
                              ? "bg-white/[0.09] text-sidebar-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),0_6px_16px_-10px_rgb(0_0_0/0.5)]"
                              : "text-sidebar-muted hover:bg-white/[0.05] hover:text-sidebar-fg",
                          )}
                        >
                          {active ? (
                            <span
                              className="absolute inset-y-2 -start-[0.6rem] w-[3px] bg-[var(--brass)] shadow-[0_0_10px_var(--brass)]"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span
                            className={cn(
                              "grid size-5 shrink-0 place-items-center transition-colors [&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
                              active
                                ? "text-[var(--brass)]"
                                : cn(
                                    "shade-ink-dark",
                                    NAV_SHADES[(SECTION_OFFSET[section.key] ?? 0) + index] ?? "shade-sky",
                                  ),
                            )}
                            aria-hidden="true"
                          >
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <Highlight text={item.label} query={query} />
                          </span>
                          <Pending className="text-sidebar-fg" />
                          <Badge n={item.badge} className="animate-pop-in" />
                          {hasSub ? (
                            <span
                              role="button"
                              tabIndex={-1}
                              className="-me-1 grid size-6 shrink-0 place-items-center rounded-md hover:bg-white/[0.08]"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                flip(item.href);
                              }}
                            >
                              <ChevronDown
                                className={cn(
                                  "size-3.5 opacity-70 transition-transform duration-300",
                                  !subOpen && "-rotate-90 rtl:rotate-90",
                                )}
                                aria-hidden="true"
                              />
                            </span>
                          ) : null}
                        </Link>
                        {hasSub ? (
                          <Collapse open={subOpen}>
                            <Suspense fallback={null}>
                              <SubNav item={item} query={query} />
                            </Suspense>
                          </Collapse>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

/** The matched part of a label, lit while searching. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = norm(text).indexOf(query);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-[var(--brass)]/30 text-sidebar-fg">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

/** The sub-pages of an item as a tree (under their category headings when the page has some). */
function SubNav({ item, query }: { item: NavItem; query: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const first = item.children?.[0]?.href;
  const children = item.children!.filter(
    (c) => !query || norm(c.label).includes(query) || norm(item.label).includes(query),
  );
  return (
    <div className="relative ms-[1.2rem] border-s border-white/[0.09] py-1 ps-2.5">
      {children.map((c, i) => {
        const [path, q] = c.href.split("?");
        const tab = new URLSearchParams(q ?? "").get("tab");
        const current = sp.get("tab");
        const active = pathname === path && (current ? current === tab : c.href === first);
        const heading = c.group && c.group !== children[i - 1]?.group ? c.group : null;
        return (
          <Fragment key={c.href}>
            {heading ? (
              <p className="px-2 pt-2 pb-1 text-[13px] font-bold tracking-wide text-[var(--brass)]/80 first:pt-0.5">
                {heading}
              </p>
            ) : null}
            <Link
              href={c.href}
              data-nav-item=""
              aria-current={active ? "page" : undefined}
              className={cn(
                "group/s relative flex h-9 items-center gap-2.5 rounded-md px-2 text-[14px] transition-colors duration-150",
                active
                  ? "bg-white/[0.08] font-semibold text-sidebar-fg"
                  : "text-sidebar-muted hover:bg-white/[0.045] hover:text-sidebar-fg",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rotate-45 transition-colors",
                  active
                    ? "bg-[var(--brass)] shadow-[0_0_8px_var(--brass)]"
                    : "bg-sidebar-muted/40 group-hover/s:bg-sidebar-fg/70",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">
                <Highlight text={c.label} query={query} />
              </span>
              <Pending className="size-3.5 text-sidebar-fg" />
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}

/** "Section › Page" trail for the top bar, from the active navigation item. */
export function NavTrail({ items }: { items: NavItem[] }) {
  const isActive = useActive();
  const pathname = usePathname();
  const item = items.filter(isActive).sort((a, b) => b.href.length - a.href.length)[0];
  if (!item) return null;
  const deeper = pathname !== item.href;
  return (
    <nav aria-label="breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm lg:flex">
      {item.group ? (
        <>
          <span className="truncate text-fg-subtle">{item.group}</span>
          <ChevronLeft className="size-3.5 shrink-0 text-fg-subtle ltr:rotate-180" aria-hidden="true" />
        </>
      ) : null}
      {deeper ? (
        <Link href={item.href} className="truncate font-medium text-fg-muted hover:text-fg">
          {item.label}
        </Link>
      ) : (
        <span className="truncate font-semibold">{item.label}</span>
      )}
    </nav>
  );
}

/** Mobile: bottom tab bar (primary items) + a "More" sheet with everything else. */
export function MobileTabBar({ items, sheet }: { items: NavItem[]; sheet: ReactNode }) {
  const t = useTranslations("nav");
  const isActive = useActive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = norm(q);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
    setQ("");
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const moreActive = !primary.some(isActive);

  return (
    <>
      <nav
        aria-label={t("mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium",
                  active ? "text-accent-text" : "text-fg-subtle",
                )}
              >
                <span
                  className={cn(
                    "k-cut k-sm relative grid h-7 w-12 place-items-center transition-colors [&_svg]:size-5",
                    active && "bg-accent-soft",
                  )}
                  aria-hidden="true"
                >
                  {item.icon}
                  <Badge n={item.badge} className="absolute -end-0.5 -top-1.5 ring-2 ring-surface" />
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
                <Pending className="absolute end-1 top-1 size-3 text-accent-text" />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            className={cn(
              "flex h-16 flex-col items-center justify-center gap-1 text-[12px] font-medium",
              open || moreActive ? "text-accent-text" : "text-fg-subtle",
            )}
          >
            <span
              className={cn(
                "k-cut k-sm grid h-7 w-12 place-items-center [&_svg]:size-5",
                (open || moreActive) && "bg-accent-soft",
              )}
              aria-hidden="true"
            >
              <LayoutGrid />
            </span>
            {t("more")}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("more")}>
          <button
            type="button"
            aria-label={t("close")}
            className="animate-fade-in absolute inset-0 bg-black/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="animate-sheet-up absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-surface px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-float)]">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-3" aria-hidden="true" />
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="grid size-9 place-items-center rounded-full bg-surface-2 text-fg-muted"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <label className="mb-4 flex h-11 items-center gap-2 rounded-2xl bg-surface-2 px-3.5 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent">
              <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("filter")}
                aria-label={t("filter")}
                data-bare=""
                className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none outline-none focus:ring-0"
              />
            </label>
            <div className="space-y-4">
              {sections(
                items.filter(
                  (i) =>
                    !query ||
                    norm(i.label).includes(query) ||
                    !!i.children?.some((c) => norm(c.label).includes(query)),
                ),
              ).map((section) => (
                <div key={section.key || "top"}>
                  {section.label ? (
                    <p className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-fg-muted">
                      <span
                        className="shade-soft grid size-6 place-items-center rounded-md [&_svg]:size-3.5"
                        aria-hidden="true"
                      >
                        {SECTION_ICON[section.key] ?? <LayoutGrid />}
                      </span>
                      {section.label}
                      <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-fg-subtle tabular-nums">
                        {section.items.length}
                      </span>
                    </p>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2">
                    {section.items.map((item) => {
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "k-cut flex flex-col items-center gap-2 px-2 py-3.5 text-center text-[13px] font-medium",
                            active ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "k-cut relative grid size-11 place-items-center [&_svg]:size-5",
                              active
                                ? "bg-accent text-accent-fg"
                                : "bg-surface text-fg-muted ring-1 ring-border",
                            )}
                            aria-hidden="true"
                          >
                            {item.icon}
                            <Badge n={item.badge} className="absolute -end-3 -top-2" />
                            <Pending className="absolute -start-2 -top-2 rounded-full bg-surface text-accent-text" />
                          </span>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">{sheet}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
