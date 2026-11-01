import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo, LogoMark } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { CommandPalette, type SearchEntry } from "./command-palette";
import { MobileTabBar, NavTrail, SidebarNav, type NavItem } from "./sidebar-nav";

/** Shared chrome for the restaurant dashboard and the super-admin console. */
export async function AppShell({
  title,
  subtitle,
  avatar,
  nav,
  footer,
  user,
  headerExtra,
  brand,
  kind,
  search,
  children,
}: {
  /** Extra go-anywhere entries (tabs, settings sections) on top of the navigation. */
  search?: SearchEntry[];
  /** Restaurant brand color key: scopes the accent (data-brand). */
  brand?: string;
  /** Establishment kind: hotels get their own, quieter navy theme (data-kind). */
  kind?: string;
  title: string;
  subtitle?: string;
  /** Restaurant logo URL, shown in the sidebar identity card. */
  avatar?: string | null;
  nav: NavItem[];
  footer?: ReactNode;
  /** Shown in the top bar on every breakpoint (notifications, live status). */
  headerExtra?: ReactNode;
  user: { fullName: string; email: string };
  children: ReactNode;
}) {
  const t = await getTranslations();
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-base font-bold text-accent-text ring-2 ring-accent/60">
        {avatar ? (
          <img src={avatar} alt="" className="size-full object-contain p-0.5" />
        ) : (
          ([...title.trim()][0] ?? "S")
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-fg-muted">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
  const initials = user.fullName
    .split(/\s+/)
    .map((w) => [...w][0] ?? "")
    .slice(0, 2)
    .join("");
  const account = (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: "var(--brand-gradient)" }}
          aria-hidden="true"
        >
          {initials || "•"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{user.fullName}</p>
          <p className="truncate text-xs text-fg-muted">{user.email}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LanguageSwitcher />
        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-fg-muted ring-1 ring-border hover:bg-surface-2 hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t("common.logout")}
          </button>
        </form>
      </div>
    </div>
  );

  // Desktop sidebar: one compact row so the navigation keeps the height.
  const accountRow = (
    <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface/70 p-2.5">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
        style={{ background: "var(--brand-gradient)" }}
        aria-hidden="true"
      >
        {initials || "•"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.fullName}</p>
        <p className="truncate text-xs text-fg-muted">{user.email}</p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          title={t("common.logout")}
          aria-label={t("common.logout")}
          className="grid size-9 place-items-center rounded-full text-fg-muted ring-1 ring-border hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  );

  return (
    <div
      data-brand={brand}
      data-kind={kind}
      className="min-h-dvh bg-bg lg:grid lg:grid-cols-[272px_1fr] print:block print:bg-white"
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <div className="on-dark relative hidden overflow-hidden bg-sidebar lg:block print:hidden">
        {/* Brand glow behind the logo. */}
        <div
          className="brand-glow pointer-events-none absolute -start-20 -top-24 size-72 rounded-full opacity-35 blur-3xl"
          style={{ background: "var(--brand-gradient)" }}
          aria-hidden="true"
        />
        <aside className="relative flex flex-col lg:sticky lg:top-0 lg:h-dvh">
          <div className="px-5 pt-6 pb-5">
            <Link href="/dashboard" aria-label="Spotifood" className="inline-flex">
              <Logo />
            </Link>
          </div>
          <div className="mx-3 rounded-2xl border border-border bg-surface/70 p-2.5 backdrop-blur">
            {identity}
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="h-full [scrollbar-width:thin] overflow-y-auto px-3 pt-2 pb-8">
              <SidebarNav items={nav} label={title} />
              {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
            </div>
            {/* Fades the list out above the account row instead of cutting a label in half. */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sidebar to-transparent"
              aria-hidden="true"
            />
          </div>
          <div className="p-3">{accountRow}</div>
        </aside>
      </div>

      <div className="relative min-w-0">
        {/* Soft brand wash at the top of every page. */}
        <div
          className="brand-wash pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-accent-soft/80 to-transparent print:hidden"
          aria-hidden="true"
        />
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border/70 bg-surface/75 backdrop-blur-xl print:hidden">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
            <Link href="/dashboard" aria-label="Spotifood" className="lg:hidden">
              <LogoMark className="size-8" />
            </Link>
            <div className="min-w-0 flex-1 lg:hidden">
              <p className="truncate text-sm font-semibold">{title}</p>
              {subtitle ? <p className="truncate text-xs text-fg-muted">{subtitle}</p> : null}
            </div>
            <NavTrail items={nav} />
            <div className="ms-auto flex items-center gap-1.5">
              <LanguageSwitcher className="hidden lg:inline-flex" />
              <CommandPalette
                entries={[
                  ...nav.map((n) => ({ href: n.href, label: n.label, hint: n.group, icon: n.icon })),
                  ...(search ?? []),
                ]}
              />
              {headerExtra}
            </div>
          </div>
        </header>
        <main
          id="main"
          className="relative mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-8 lg:pt-8 lg:pb-12 print:max-w-none print:p-0"
        >
          {children}
        </main>
      </div>

      <MobileTabBar
        items={nav}
        sheet={
          <div className="space-y-3">
            {footer ? <div className="rounded-xl border border-border p-2">{footer}</div> : null}
            {account}
          </div>
        }
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:gap-4 lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-[23px] leading-tight font-extrabold tracking-tight sm:text-[30px]">{title}</h1>
        {description ? (
          <p className="mt-1 line-clamp-2 max-w-3xl text-[13px] leading-5 text-fg-muted sm:mt-1.5 sm:line-clamp-none sm:text-sm sm:leading-6">
            {description}
          </p>
        ) : null}
      </div>
      {/* Phones: one row of actions that scrolls, instead of a stack of pills above the content. */}
      {actions ? (
        <div className="flex items-center gap-2 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:[scrollbar-width:none] max-sm:overflow-x-auto max-sm:px-4 sm:flex-wrap max-sm:[&>*]:shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[272px_1fr]" aria-busy="true">
      <aside className="hidden bg-sidebar lg:block" />
      <div className="px-4 py-8 sm:px-8">
        <div className="h-8 w-56 animate-pulse rounded-full bg-surface-3" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
