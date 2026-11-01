import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { IconLogout } from "@/components/ui/icons";
import { LanguageSwitcher } from "@/components/language-switcher";
import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { SidebarNav, type NavItem } from "./sidebar-nav";
import { CollapsibleNav } from "./mobile-nav";

/** Shared chrome for the restaurant dashboard and the super-admin console. */
export async function AppShell({
  title,
  subtitle,
  nav,
  footer,
  user,
  headerExtra,
  children,
}: {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  footer?: ReactNode;
  /** Shown next to the logo on every breakpoint (notifications, live status). */
  headerExtra?: ReactNode;
  user: { fullName: string; email: string };
  children: ReactNode;
}) {
  const t = await getTranslations();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr] print:block">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        {t("common.skipToContent")}
      </a>
      <aside className="flex flex-col border-b border-border bg-surface lg:sticky lg:top-0 lg:h-dvh lg:border-e lg:border-b-0 print:hidden">
        <CollapsibleNav
          header={
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/dashboard" aria-label="Spotifood" className="shrink-0">
                <Logo withText={false} className="lg:hidden" />
                <Logo className="hidden lg:inline-flex" />
              </Link>
              {headerExtra ? (
                <div className="order-last flex items-center gap-1 lg:order-none lg:ms-auto">
                  {headerExtra}
                </div>
              ) : null}
              <div className="min-w-0 lg:hidden">
                <p className="truncate text-sm font-semibold text-fg">{title}</p>
                {subtitle ? <p className="truncate text-xs text-fg-muted">{subtitle}</p> : null}
              </div>
            </div>
          }
        >
          <div className="hidden px-4 pb-3 lg:block">
            <p className="truncate text-sm font-semibold text-fg">{title}</p>
            {subtitle ? <p className="truncate text-xs text-fg-muted">{subtitle}</p> : null}
          </div>
          <div className="px-2 pb-3 lg:flex-1 lg:overflow-y-auto">
            <SidebarNav items={nav} label={title} />
            {footer ? <div className="mt-4 border-t border-border pt-4">{footer}</div> : null}
          </div>
          <div className="border-t border-border p-3">
            <p className="truncate px-1 text-sm font-medium">{user.fullName}</p>
            <p className="truncate px-1 text-xs text-fg-muted">{user.email}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LanguageSwitcher />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm whitespace-nowrap text-fg-muted hover:bg-surface-2 hover:text-fg"
                >
                  <span className="size-4" aria-hidden="true">
                    <IconLogout />
                  </span>
                  {t("common.logout")}
                </button>
              </form>
            </div>
          </div>
        </CollapsibleNav>
      </aside>
      <main id="main" className="min-w-0 px-5 py-6 sm:px-8 lg:py-10 print:p-0">
        {children}
      </main>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-fg-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]" aria-busy="true">
      <aside className="hidden border-e border-border bg-surface lg:block" />
      <div className="px-8 py-10">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-2" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      </div>
    </div>
  );
}
