import { Suspense } from "react";
import { sectionFilterOf } from "@/server/modules/team/sections";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import {
  BookOpenCheck,
  ChartSpline,
  UsersRound,
  Building2,
  CalendarRange,
  Contact,
  Flower2,
  Hotel,
  KeyRound,
  NotebookTabs,
  Boxes,
  HeartHandshake,
  ChartColumn,
  Bike,
  CalendarClock,
  Network,
  BedDouble,
  Calculator,
  ConciergeBell,
  CreditCard,
  Headset,
  ChefHat,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  NotebookPen,
  Music,
  QrCode,
  ReceiptText,
  Settings,
  Star,
  Shield,
  UtensilsCrossed,
  Users,
  Wallet,
} from "lucide-react";
import { getDisabledModules, logoUrl } from "@/server/modules/restaurants/settings";
import type { ModuleKey } from "@/lib/modules";
import type { NavItem } from "@/components/dashboard/sidebar-nav";
import type { SearchEntry } from "@/components/dashboard/command-palette";
import { can } from "@/server/tenancy";
import { requireRestaurant } from "@/server/auth/current";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db/client";
import { listNotifications } from "@/server/modules/notifications/service";
import { LiveProvider } from "@/components/realtime/live";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { OrderAlerts } from "@/components/dashboard/order-alerts";
import { countNewOrders } from "@/server/modules/orders/service";
import { countLowStock } from "@/server/modules/inventory/service";
import { countToDispatch } from "@/server/modules/delivery/service";
import { getSubscriptionNotice } from "@/server/modules/billing/service";
import { sendDueFeedback } from "@/server/modules/feedback/service";
import { checkKpiAlerts } from "@/server/modules/kpi/service";
import { vapidPublicKey } from "@/server/modules/push/service";
import { after } from "next/server";
import { SubscriptionBanner } from "@/components/dashboard/subscription-banner";
import { countOpenRequests } from "@/server/modules/hotel/requests";

/** Where each page sits in a hotel's menu, in this order (the rest keeps its own group). */
const HOTEL_LAYOUT: [page: string, group: HotelGroup][] = [
  ["frontdesk", "reception"],
  ["planning", "reception"],
  ["stays", "reception"],
  ["blocks", "reception"],
  ["guests", "reception"],
  ["rooms", "rooms"],
  ["requests", "rooms"],
  ["orders", "rooms"],
  ["wellness", "rooms"],
  ["tables", "rooms"],
  ["forecast", "revenue"],
  ["chain", "revenue"],
  ["pos", "restaurant"],
  ["waiter", "restaurant"],
  ["kitchen", "restaurant"],
  ["floor", "restaurant"],
  ["reservations", "restaurant"],
  ["menu", "restaurant"],
  ["inventory", "restaurant"],
];
type HotelGroup = "reception" | "rooms" | "revenue" | "restaurant";
/** Restaurant-chain tools a hotel has no use for (the group console replaces branches). */
const HOTEL_HIDDEN = ["callcenter", "delivery", "branches", "music"];
/** Groups top to bottom: the front office first, the restaurant after the money. */
const HOTEL_ORDER = ["", "reception", "rooms", "revenue", "finance", "restaurant", "guests", "manage"];
/** On a phone's bottom bar: home, front desk, planning and the rooms' requests. */
const HOTEL_PRIMARY = ["", "frontdesk", "planning", "requests"];

/**
 * A hotel's menu: the front office and the rooms on top, revenue and finance next, what only
 * its restaurant uses in its own group further down.
 */
function arrangeForHotel(
  nav: NavItem[],
  base: string,
  labels: Record<HotelGroup, string>,
  names: { roomService: string; roomsQr: string },
) {
  const page = (i: NavItem) => (i.href === base ? "" : i.href.slice(base.length + 1));
  const kept = nav.filter((i) => !HOTEL_HIDDEN.includes(page(i)));
  const slot = new Map(HOTEL_LAYOUT.map(([p, g], i) => [p, { g, i }]));
  for (const item of kept) {
    const p = page(item);
    const at = slot.get(p);
    if (at) Object.assign(item, { groupKey: at.g, group: labels[at.g] });
    if (p === "orders") item.label = names.roomService;
    if (p === "tables") item.label = names.roomsQr;
    item.primary = HOTEL_PRIMARY.includes(p);
  }
  const rank = (i: NavItem) => {
    const g = HOTEL_ORDER.indexOf(i.groupKey ?? "");
    return (g < 0 ? HOTEL_ORDER.length : g) * 100 + (slot.get(page(i))?.i ?? 50);
  };
  const sorted = kept
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i)
    .map((x) => x.item);
  nav.splice(0, nav.length, ...sorted);
}

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

  const hotel = ctx.restaurant.kind === "hotel";
  const [{ unread }, newOrders, lowStock, undeliveredCount, disabled, notice, openRequests] =
    await Promise.all([
      listNotifications(db, ctx, 1),
      countNewOrders(db, ctx),
      countLowStock(db, ctx),
      countToDispatch(db, ctx),
      getDisabledModules(db, ctx),
      can(ctx, "restaurant.manage") ? getSubscriptionNotice(db, ctx.restaurant.id) : null,
      hotel && can(ctx, "orders.view") ? countOpenRequests(db, ctx.restaurant.id) : 0,
    ]);
  // Satisfaction texts that are due go out after this page is sent (no cron needed).
  after(() => sendDueFeedback(db, ctx.restaurant.id).catch(() => 0));
  // Missed targets (kitchen time, rating, takings) become notifications.
  after(() => checkKpiAlerts(db, ctx.restaurant).catch(() => []));
  const off = new Set(disabled);
  const on = (m: ModuleKey) => !off.has(m);
  const g = {
    sales: t("nav.groups.sales"),
    catalog: t("nav.groups.catalog"),
    guests: t("nav.groups.guests"),
    finance: t("nav.groups.finance"),
    manage: t("nav.groups.manage"),
  };
  type Item = NavItem & { show: boolean };
  const nav: NavItem[] = (
    [
      {
        show: true,
        href: base,
        label: t("nav.overview"),
        icon: <LayoutDashboard />,
        exact: true,
        primary: true,
      },
      // Hotels: the front desk (PMS) and the guests' requests from their rooms come first.
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/frontdesk`,
        label: t("nav.frontdesk"),
        icon: <KeyRound />,
        primary: true,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && ctx.role !== "staff",
        href: `${base}/chain`,
        label: t("nav.chain"),
        icon: <Building2 />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/planning`,
        label: t("nav.planning"),
        icon: <CalendarRange />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/stays`,
        label: t("nav.stays"),
        icon: <NotebookTabs />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/blocks`,
        label: t("nav.blocks"),
        icon: <UsersRound />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/forecast`,
        label: t("nav.forecast"),
        icon: <ChartSpline />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/guests`,
        label: t("nav.hotelGuests"),
        icon: <Contact />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "frontdesk.view"),
        href: `${base}/wellness`,
        label: t("nav.wellness"),
        icon: <Flower2 />,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "orders.view"),
        href: `${base}/requests`,
        label: t("nav.requests"),
        icon: <ConciergeBell />,
        primary: true,
        badge: openRequests,
        groupKey: "reception",
        group: "",
      },
      {
        show: hotel && can(ctx, "tables.view"),
        href: `${base}/rooms`,
        label: t("nav.rooms"),
        icon: <BedDouble />,
        groupKey: "reception",
        group: "",
      },
      // Sales & service: everything that happens during a shift.
      {
        show: on("pos") && can(ctx, "orders.create"),
        href: `${base}/pos`,
        label: t("nav.pos"),
        icon: <Calculator />,
        primary: true,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("floor") && can(ctx, "orders.create") && can(ctx, "tables.view"),
        href: `${base}/waiter`,
        label: t("nav.waiter"),
        icon: <NotebookPen />,
        primary: true,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: can(ctx, "orders.view"),
        href: `${base}/orders`,
        label: t("nav.orders"),
        icon: <ReceiptText />,
        primary: true,
        badge: newOrders,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("kitchen") && can(ctx, "orders.view"),
        href: `${base}/kitchen`,
        label: t("nav.kitchen"),
        icon: <ChefHat />,
        primary: true,
        badge: newOrders,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("floor") && can(ctx, "tables.view"),
        href: `${base}/floor`,
        label: t("nav.floor"),
        icon: <LayoutGrid />,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("branches") && can(ctx, "orders.create") && can(ctx, "customers.view"),
        href: `${base}/callcenter`,
        label: t("nav.callcenter"),
        icon: <Headset />,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("delivery") && can(ctx, "orders.view"),
        href: `${base}/delivery`,
        label: t("nav.delivery"),
        icon: <Bike />,
        badge: undeliveredCount,
        groupKey: "sales",
        group: g.sales,
      },
      {
        show: on("reservations") && can(ctx, "orders.view"),
        href: `${base}/reservations`,
        label: t("nav.reservations"),
        icon: <CalendarClock />,
        groupKey: "sales",
        group: g.sales,
      },
      // Menu & stock: what the restaurant sells and where it is served.
      {
        show: can(ctx, "menu.view"),
        href: `${base}/menu`,
        label: t("nav.menu"),
        icon: <UtensilsCrossed />,
        primary: true,
        groupKey: "catalog",
        group: g.catalog,
      },
      {
        show: on("inventory") && can(ctx, "inventory.view"),
        href: `${base}/inventory`,
        label: t("nav.inventory"),
        icon: <Boxes />,
        badge: lowStock,
        groupKey: "catalog",
        group: g.catalog,
      },
      {
        show: can(ctx, "tables.view"),
        href: `${base}/tables`,
        label: ctx.restaurant.kind === "hotel" ? t("nav.tablesHotel") : t("nav.tables"),
        icon: <QrCode />,
        groupKey: "catalog",
        group: g.catalog,
      },
      // Guests & experience.
      {
        show: on("customers") && can(ctx, "customers.view"),
        href: `${base}/customers`,
        label: t("nav.customers"),
        icon: <HeartHandshake />,
        groupKey: "guests",
        group: g.guests,
      },
      {
        show: on("customers") && can(ctx, "customers.view"),
        href: `${base}/feedback`,
        label: t("nav.feedback"),
        icon: <Star />,
        groupKey: "guests",
        group: g.guests,
      },
      {
        show: on("music") && can(ctx, "restaurant.view"),
        href: `${base}/music`,
        label: t("nav.music"),
        icon: <Music />,
        groupKey: "guests",
        group: g.guests,
      },
      // Finance.
      {
        show: can(ctx, "accounting.manage"),
        href: `${base}/ledger`,
        label: t("nav.ledger"),
        icon: <BookOpenCheck />,
        groupKey: "finance",
        group: g.finance,
      },
      {
        show: can(ctx, "accounting.manage"),
        href: `${base}/reports`,
        label: t("nav.reports"),
        icon: <ChartColumn />,
        groupKey: "finance",
        group: g.finance,
      },
      {
        show: can(ctx, "payments.view"),
        href: `${base}/payments`,
        label: t("nav.payments"),
        icon: <Wallet />,
        groupKey: "finance",
        group: g.finance,
      },
      {
        show: on("invoices") && can(ctx, "invoices.view"),
        href: `${base}/invoices`,
        label: t("nav.invoices"),
        icon: <FileText />,
        groupKey: "finance",
        group: g.finance,
      },
      // Management.
      {
        show: hotel && can(ctx, "rates.manage"),
        href: `${base}/hotel`,
        label: t("nav.hotelSetup"),
        icon: <Hotel />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: on("branches") && ctx.role !== "staff",
        href: `${base}/branches`,
        label: t("nav.branches"),
        icon: <Network />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: can(ctx, "members.manage"),
        href: `${base}/team`,
        label: t("nav.team"),
        icon: <Users />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: can(ctx, "restaurant.manage"),
        href: `${base}/billing`,
        label: t("nav.billing"),
        icon: <CreditCard />,
        groupKey: "manage",
        group: g.manage,
      },
      {
        show: can(ctx, "restaurant.view"),
        href: `${base}/settings`,
        label: t("nav.settings"),
        icon: <Settings />,
        groupKey: "manage",
        group: g.manage,
      },
    ] satisfies Item[]
  )
    .filter((i) => i.show)
    .map(({ show: _show, ...i }) => i);
  if (hotel)
    arrangeForHotel(
      nav,
      base,
      {
        reception: t("nav.groups.frontOffice"),
        rooms: t("nav.groups.roomsServices"),
        revenue: t("nav.groups.revenue"),
        restaurant: t("nav.groups.hotelRestaurant"),
      },
      { roomService: t("nav.roomService"), roomsQr: t("nav.roomsQr") },
    );

  // Go-anywhere search also reaches the tabs inside pages and the settings sections.
  const visible = new Set(nav.map((n) => n.href));
  const sub = (page: string, ns: string, tabs: readonly string[], key = "tab") =>
    visible.has(`${base}/${page}`)
      ? tabs.map((k) => ({
          href: `${base}/${page}?${key}=${k}`,
          label: t(`${ns}.tabs.${k}`),
          hint: t(`nav.${page}`),
        }))
      : [];
  const search: SearchEntry[] = [
    ...sub("reports", "reports", ["sales", "products", "expenses", "security"]),
    ...sub("inventory", "inventory", ["purchases", "recipes", "suppliers", "movements"]),
    ...sub("customers", "customers", ["coupons", "campaigns", "loyalty"]),
    ...sub("delivery", "delivery", ["settlement", "settings"]),
    ...sub("reservations", "reservations", ["queue", "settings"]),
    ...(visible.has(`${base}/settings`)
      ? (["profile", "service", "payments", "taxes", "legal", "modules", "printers", "listing"] as const).map(
          (k) => ({
            href: `${base}/settings#${k}`,
            label: t(`settings.${k}`),
            hint: t("nav.settings"),
          }),
        )
      : []),
  ];

  return (
    <LiveProvider url={`/api/v1/realtime/restaurant/${ctx.restaurant.id}`}>
      <AppShell
        title={ctx.restaurant.name}
        subtitle={t(`roles.${ctx.role}`)}
        avatar={logoUrl(ctx.restaurant.logoKey)}
        brand={ctx.restaurant.brandColor}
        kind={ctx.restaurant.kind}
        nav={nav}
        search={search}
        user={ctx.user}
        headerExtra={
          <>
            {/* Super admins reach the platform admin from every page, not only the sidebar's end. */}
            {ctx.user.isSuperAdmin ? (
              <Link
                href="/admin"
                title={t("nav.admin")}
                aria-label={t("nav.admin")}
                className="grid size-10 place-items-center rounded-full bg-ink text-ink-fg hover:opacity-90"
              >
                <Shield className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
            <OrderAlerts
              restaurantId={ctx.restaurant.id}
              newOrders={newOrders}
              kitchen={ctx.job === "kitchen" || ctx.job === "bar"}
              sections={sectionFilterOf(ctx)}
            />
            <NotificationBell
              restaurantId={ctx.restaurant.id}
              timeZone={ctx.restaurant.timezone}
              initialUnread={unread}
              pushKey={vapidPublicKey()}
            />
          </>
        }
        footer={
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              {t("nav.switchRestaurant")}
            </Link>
            {ctx.user.isSuperAdmin ? (
              <Link
                href="/admin"
                className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <Shield className="size-4" aria-hidden="true" />
                {t("nav.admin")}
              </Link>
            ) : null}
          </div>
        }
      >
        {notice ? <SubscriptionBanner restaurantId={ctx.restaurant.id} notice={notice} /> : null}
        {children}
      </AppShell>
    </LiveProvider>
  );
}
