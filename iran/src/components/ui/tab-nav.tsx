import {
  BedDouble,
  Building2,
  ChartColumn,
  ClipboardList,
  ConciergeBell,
  Settings2,
  Sparkles,
  Tags,
  UsersRound,
  Wallet,
  Wrench,
  type LucideIcon,
} from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { LinkPending } from "@/components/ui/link-pending";
import type { TabGroupIcon } from "@/lib/tab-groups";

const ICONS: Record<TabGroupIcon, LucideIcon> = {
  desk: ConciergeBell,
  chart: ChartColumn,
  wallet: Wallet,
  settings: Settings2,
  users: UsersRound,
  bed: BedDouble,
  tag: Tags,
  sparkles: Sparkles,
  clipboard: ClipboardList,
  wrench: Wrench,
  building: Building2,
};

export type TabNavGroup = { key: string; label: string; icon: TabGroupIcon; tabs: readonly string[] };

/**
 * A page's tabs. With groups: the categories as a bar (icon, name, number of tabs), the open
 * category's tabs underneath; a single tab category opens its page directly.
 * Without: one row of pills that scrolls (fading edges, active tab brought into view).
 */
export function TabNav({
  label,
  tabs,
  current,
  href,
  tabLabel,
  groups,
  className,
}: {
  label: string;
  tabs: readonly string[];
  current: string;
  href: (tab: string) => string;
  tabLabel: (tab: string) => string;
  groups?: TabNavGroup[];
  className?: string;
}) {
  if (!groups?.length)
    return (
      <nav className={cn("seg mb-5 print:hidden", className)} aria-label={label}>
        {tabs.map((x) => (
          <Link key={x} href={href(x)} aria-current={x === current ? "page" : undefined} className="seg-item">
            {tabLabel(x)}
            <LinkPending />
          </Link>
        ))}
      </nav>
    );
  const open = groups.find((g) => g.tabs.includes(current)) ?? groups[0]!;
  return (
    <nav aria-label={label} className={cn("mb-5 print:hidden", className)}>
      <div className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="tab-groups flex w-max min-w-full gap-1.5 rounded-2xl bg-surface p-1.5 shadow-[var(--shadow-soft)] ring-1 ring-border">
          {groups.map((g) => {
            const Icon = ICONS[g.icon];
            const active = g.key === open.key;
            return (
              <li key={g.key} className="flex-1">
                <Link
                  href={href(active ? current : g.tabs[0]!)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "group k-cut flex h-11 items-center justify-center gap-2.5 px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow] duration-200",
                    active ? "shade-fill" : "text-fg-muted hover:bg-[var(--tab-hover)] hover:text-fg",
                  )}
                >
                  <span
                    className={cn(
                      "k-cut k-sm grid size-7 shrink-0 place-items-center transition-colors",
                      active ? "bg-white/18" : "shade-soft",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  {g.label}
                  {g.tabs.length > 1 ? (
                    <span
                      className={cn(
                        "k-cut k-sm grid h-5 min-w-5 place-items-center px-1.5 text-[11px] tabular-nums",
                        active ? "bg-white/20" : "bg-surface-2 text-fg-subtle",
                      )}
                    >
                      {g.tabs.length}
                    </span>
                  ) : null}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {open.tabs.length > 1 ? (
        <div className="tab-sub mt-2.5 flex flex-wrap gap-1.5 ps-1" key={open.key}>
          {open.tabs.map((x) => (
            <Link
              key={x}
              href={href(x)}
              aria-current={x === current ? "page" : undefined}
              className={cn(
                "k-cut k-sm inline-flex h-8 items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150",
                x === current
                  ? "shade-fill"
                  : "k-frame text-fg-muted [--k-fill-hover:var(--surface)] [--k-fill:var(--bg)] [--k-line:var(--border)] hover:text-fg",
              )}
            >
              {x === current ? <span className="size-1.5 rotate-45 bg-current" aria-hidden="true" /> : null}
              {tabLabel(x)}
              <LinkPending className="ms-0.5" />
            </Link>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
