"use client";

import { ChevronDown, ChevronLeft, LayoutGrid, LoaderCircle, X } from "lucide-react";
import { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment, Suspense, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

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
  /** Sub-pages (the tabs of the page, `?tab=`), unfolded under the item. */
  children?: { href: string; label: string }[];
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

/** Collapsed sidebar sections, remembered on this device. */
const COLLAPSE_KEY = "sf-nav-collapsed";
const COLLAPSE_EVENT = "sf-nav-collapsed-change";
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) ?? "";
  } catch {
    return "";
  }
}
function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function toggleCollapsed(key: string) {
  const set = new Set(readCollapsed().split(",").filter(Boolean));
  if (set.has(key)) set.delete(key);
  else set.add(key);
  try {
    localStorage.setItem(COLLAPSE_KEY, [...set].join(","));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
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
export function toneOf(item: NavItem, index: number) {
  const seg = item.href.split("/").filter(Boolean).pop() ?? "";
  return TONES[BY_SEGMENT[seg] ?? ORDER[index % ORDER.length]!]!;
}

function Badge({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] leading-none font-bold text-white tabular-nums",
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

/** Desktop sidebar navigation (dark sidebar): colored icon tiles, collapsible sections. */
export function SidebarNav({ items, label }: { items: NavItem[]; label: string }) {
  const isActive = useActive();
  // Items whose sub-pages were folded or unfolded by hand: the active one is open by default,
  // the others closed; a click on the chevron (or on the active item again) flips it.
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const flip = (href: string) =>
    setFlipped((f) => {
      const n = new Set(f);
      if (n.has(href)) n.delete(href);
      else n.add(href);
      return n;
    });
  const collapsed = new Set(
    useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "")
      .split(",")
      .filter(Boolean),
  );
  return (
    <nav aria-label={label} className="space-y-0.5">
      {sections(items).map((section) => {
        const hasActive = section.items.some(isActive);
        const open = !section.label || hasActive || !collapsed.has(section.key);
        const badge = section.items.reduce((n, i) => n + (i.badge ?? 0), 0);
        const id = `nav-${section.key}`;
        return (
          <Fragment key={section.key || "top"}>
            {section.label ? (
              <button
                type="button"
                onClick={() => !hasActive && toggleCollapsed(section.key)}
                aria-expanded={open}
                aria-controls={id}
                className="group/h flex w-full items-center gap-2 rounded-lg px-2.5 pt-5 pb-1.5 text-start text-[11px] font-semibold tracking-wider text-sidebar-muted/60 uppercase transition-colors hover:text-sidebar-fg"
              >
                <span className="flex flex-1 items-center gap-2 before:size-1 before:rotate-45 before:rounded-[1px] before:bg-[var(--brass)] before:opacity-70">
                  {section.label}
                </span>
                {!open && badge ? <Badge n={badge} /> : null}
                <ChevronDown
                  className={cn(
                    "size-3.5 opacity-0 transition-[transform,opacity] group-hover/h:opacity-100",
                    !open && "-rotate-90 opacity-100 rtl:rotate-90",
                    hasActive && "hidden",
                  )}
                  aria-hidden="true"
                />
              </button>
            ) : null}
            <div id={id} hidden={!open} className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                const hasSub = !!item.children?.length;
                const open = hasSub && active !== flipped.has(item.href);
                const link = (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-expanded={hasSub ? open : undefined}
                    onClick={(e) => {
                      if (!hasSub) return;
                      if (active) {
                        // Already on this page: the click folds or unfolds its sub-menu.
                        e.preventDefault();
                        flip(item.href);
                      } else if (flipped.has(item.href)) {
                        // Opening another page: its sub-menu starts open.
                        flip(item.href);
                      }
                    }}
                    className={cn(
                      "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-[background-color,color] duration-150",
                      active
                        ? "bg-white/[0.08] text-sidebar-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07),0_6px_16px_-10px_rgb(0_0_0/0.5)]"
                        : "text-sidebar-muted hover:bg-white/[0.05] hover:text-sidebar-fg",
                    )}
                  >
                    {active ? (
                      <span
                        className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-[var(--brass)] shadow-[0_0_10px_var(--brass)]"
                        aria-hidden="true"
                      />
                    ) : null}
                    {/* One quiet icon colour: the active page alone stands out. */}
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center transition-colors [&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
                        active ? "text-[var(--brass)]" : "text-sidebar-muted group-hover:text-sidebar-fg",
                      )}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <Pending className="text-sidebar-fg" />
                    <Badge n={item.badge} className="animate-pop-in" />
                    {item.children?.length ? (
                      <ChevronDown
                        className={cn(
                          "size-3.5 shrink-0 opacity-60 transition-transform",
                          !open && "-rotate-90 rtl:rotate-90",
                        )}
                        aria-hidden="true"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          flip(item.href);
                        }}
                      />
                    ) : null}
                  </Link>
                );
                return open ? (
                  <Fragment key={item.href}>
                    {link}
                    <Suspense fallback={null}>
                      <SubNav item={item} />
                    </Suspense>
                  </Fragment>
                ) : (
                  link
                );
              })}
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** The sub-pages of an item, the current tab marked. */
function SubNav({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const first = item.children?.[0]?.href;
  return (
    <div className="relative ms-[1.35rem] space-y-px border-s border-sidebar-border ps-2 pb-1">
      {item.children!.map((c) => {
        const [path, query] = c.href.split("?");
        const tab = new URLSearchParams(query ?? "").get("tab");
        const current = sp.get("tab");
        const active = pathname === path && (current ? current === tab : c.href === first);
        return (
          <Link
            key={c.href}
            href={c.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2.5 text-[12.5px] transition-colors",
              active
                ? "bg-sidebar-2 font-semibold text-sidebar-fg"
                : "text-sidebar-muted hover:bg-sidebar-2/55 hover:text-sidebar-fg",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{c.label}</span>
            <Pending className="size-3.5 text-sidebar-fg" />
          </Link>
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
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
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
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-accent-text" : "text-fg-subtle",
                )}
              >
                <span
                  className={cn(
                    "relative grid h-7 w-12 place-items-center rounded-full transition-colors [&_svg]:size-5",
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
              "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
              open || moreActive ? "text-accent-text" : "text-fg-subtle",
            )}
          >
            <span
              className={cn(
                "grid h-7 w-12 place-items-center rounded-full [&_svg]:size-5",
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
            <div className="space-y-4">
              {sections(items).map((section) => (
                <div key={section.key || "top"}>
                  {section.label ? (
                    <p className="mb-2 px-1 text-xs font-semibold text-fg-subtle">{section.label}</p>
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
                            "flex flex-col items-center gap-2 rounded-xl px-2 py-3.5 text-center text-xs font-medium",
                            active ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-fg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "relative grid size-11 place-items-center rounded-2xl [&_svg]:size-5",
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
