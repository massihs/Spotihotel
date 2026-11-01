import { Suspense } from "react";
import { BedDouble } from "lucide-react";
import { menuThemeOf } from "@/lib/menu-themes";
import { NowPlaying } from "@/components/guest/now-playing";
import { hasActiveMusic, restaurantNowPlaying } from "@/server/modules/music/service";
import { getGuest } from "@/server/modules/guest/current";
import { db } from "@/server/db/client";
import { getCartView } from "@/server/modules/cart/service";
import { listGuestOrders } from "@/server/modules/orders/service";
import { getPopularProductIds, getPublicMenu } from "@/server/modules/menu/public-cache";
import { getStorefront } from "@/server/modules/guest/storefront";
import { MenuApp } from "@/components/guest/menu-app";
import { WelcomeSplash } from "@/components/guest/welcome-splash";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { getTranslations } from "next-intl/server";
import { GuestHeader } from "@/components/guest/guest-header";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { LiveProvider, LiveRefresh } from "@/components/realtime/live";

/** The guest cookie is per request: the page streams behind its own boundary (instant navigations). */
export default function GuestMenuPage({ searchParams }: PageProps<"/[locale]/table">) {
  return (
    <>
      <Suspense fallback={null}>
        <Welcome searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<GuestSkeleton />}>
        <GuestMenu />
      </Suspense>
    </>
  );
}

/** Right after a QR scan (`?welcome=1`): the restaurant's logo for 3 s over the loading menu. */
async function Welcome({ searchParams }: Pick<PageProps<"/[locale]/table">, "searchParams">) {
  if ((await searchParams).welcome !== "1") return null;
  const guest = await getGuest();
  if (!guest) return null;
  const t = await getTranslations("guest");
  return (
    <WelcomeSplash
      name={guest.restaurant.name}
      logo={logoUrl(guest.restaurant.logoKey, "512")}
      brand={guest.restaurant.brandColor}
      table={t(guest.table.kind === "room" ? "tableBadgeRoom" : "tableBadge", { table: guest.table.label })}
      welcome={t("welcome")}
    />
  );
}

async function GuestMenu() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  // Menu comes from the tag-invalidated cache; the cart is always read live.
  const [menu, cart, orders, music, popularIds, store] = await Promise.all([
    getPublicMenu(guest.restaurant.id),
    getCartView(db, guest),
    listGuestOrders(db, guest),
    hasActiveMusic(db, guest.restaurant.id),
    getPopularProductIds(guest.restaurant.id),
    getStorefront(db, guest.restaurant.id),
  ]);
  const t = await getTranslations("guest");
  const waitingText = guest.session.confirmed ? "" : t("waitingConfirm");
  const byProduct: Record<string, number> = {};
  for (const l of cart.lines) byProduct[l.productId] = (byProduct[l.productId] ?? 0) + l.quantity;
  const playing = music ? await restaurantNowPlaying(db, guest.restaurant.id) : null;
  // Cover: the first featured dish with a photo, else any dish with a photo.
  const dishes = Object.values(menu.products);
  const cover =
    (dishes.find((p) => p.isFeatured && p.images[0]) ?? dishes.find((p) => p.images[0]))?.images[0] ?? null;
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <LiveRefresh
            types={guest.session.confirmed ? ["session.closed"] : ["session.closed", "session.opened"]}
          />
          <MenuApp
            menu={menu}
            currency={guest.restaurant.currency}
            initialCart={{ itemCount: cart.itemCount, totalCents: cart.totals.totalCents, byProduct }}
            popularIds={popularIds}
            restaurantName={guest.restaurant.name}
            tableLabel={guest.table.label}
            room={guest.table.kind === "room"}
            theme={menuThemeOf(guest.restaurant.menuTheme)}
            shortPrices={guest.restaurant.menuShortPrices}
            header={
              <>
                <GuestHeader guest={guest} orderCount={orders.length} cover={cover} store={store} />
                {guest.table.kind === "room" ? (
                  <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
                      <BedDouble className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-accent-text">{t("roomService")}</p>
                      <p className="text-sm text-fg-muted">{t("roomServiceHint")}</p>
                    </div>
                  </div>
                ) : null}
                {guest.session.confirmed ? null : (
                  <p
                    role="status"
                    className="mx-4 mt-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning"
                  >
                    {waitingText}
                  </p>
                )}
                {music ? <NowPlaying initial={playing} restaurantName={guest.restaurant.name} /> : null}
              </>
            }
          />
        </div>
      </div>
    </LiveProvider>
  );
}
