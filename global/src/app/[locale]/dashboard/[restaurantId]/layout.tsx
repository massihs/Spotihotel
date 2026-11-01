import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import {
  IconChart,
  IconFlame,
  IconFloor,
  IconHome,
  IconMenu,
  IconReceipt,
  IconSettings,
  IconTable,
  IconUsers,
  IconWallet,
} from "@/components/ui/icons";
import { can } from "@/server/tenancy";
import { requireRestaurant } from "@/server/auth/current";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { listNotifications } from "@/server/modules/notifications/service";
import { LiveProvider } from "@/components/realtime/live";
import { NotificationBell } from "@/components/dashboard/notification-bell";

export default function RestaurantLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard/[restaurantId]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <RestaurantShell params={params}>{children}</RestaurantShell>
    </Suspense>
  );
}

async function RestaurantShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: LayoutProps<"/[locale]/dashboard/[restaurantId]">["params"];
}) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId);
  const t = await getTranslations();
  const base = `/dashboard/${ctx.restaurant.id}`;

  const { unread } = await listNotifications(db, ctx, 1);
  const nav = [
    { href: base, label: t("nav.overview"), icon: <IconHome />, exact: true },
    can(ctx, "tables.view") && { href: `${base}/floor`, label: t("nav.floor"), icon: <IconFloor /> },
    can(ctx, "orders.view") && { href: `${base}/kitchen`, label: t("nav.kitchen"), icon: <IconFlame /> },
    can(ctx, "orders.view") && { href: `${base}/orders`, label: t("nav.orders"), icon: <IconReceipt /> },
    can(ctx, "payments.view") && { href: `${base}/payments`, label: t("nav.payments"), icon: <IconWallet /> },
    can(ctx, "menu.view") && { href: `${base}/menu`, label: t("nav.menu"), icon: <IconMenu /> },
    can(ctx, "tables.view") && { href: `${base}/tables`, label: t("nav.tables"), icon: <IconTable /> },
    can(ctx, "members.manage") && { href: `${base}/team`, label: t("nav.team"), icon: <IconUsers /> },
    can(ctx, "restaurant.view") && {
      href: `${base}/settings`,
      label: t("nav.settings"),
      icon: <IconSettings />,
    },
  ].filter((x) => !!x);

  return (
    <LiveProvider url={`/api/v1/realtime/restaurant/${ctx.restaurant.id}`}>
      <AppShell
        title={ctx.restaurant.name}
        subtitle={t(`roles.${ctx.role}`)}
        nav={nav}
        user={ctx.user}
        headerExtra={
          <>
            <NotificationBell
              restaurantId={ctx.restaurant.id}
              timeZone={ctx.restaurant.timezone}
              initialUnread={unread}
            />
          </>
        }
        footer={
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="block rounded-lg px-2.5 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {t("nav.switchRestaurant")}
            </Link>
            {ctx.user.isSuperAdmin ? (
              <Link
                href="/admin"
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <span className="size-4" aria-hidden="true">
                  <IconChart />
                </span>
                {t("nav.admin")}
              </Link>
            ) : null}
          </div>
        }
      >
        {children}
      </AppShell>
    </LiveProvider>
  );
}
