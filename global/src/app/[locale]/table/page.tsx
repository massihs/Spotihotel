import { Suspense } from "react";
import { getGuest } from "@/server/modules/guest/current";
import { db } from "@/server/db/client";
import { getCartView } from "@/server/modules/cart/service";
import { listGuestOrders } from "@/server/modules/orders/service";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { MenuApp } from "@/components/guest/menu-app";
import { GuestHeader } from "@/components/guest/guest-header";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { LiveProvider, LiveRefresh } from "@/components/realtime/live";

/** The guest cookie is per request: the page streams behind its own boundary (instant navigations). */
export default function GuestMenuPage() {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <GuestMenu />
    </Suspense>
  );
}

async function GuestMenu() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  // Menu comes from the tag-invalidated cache; the cart is always read live.
  const [menu, cart, orders] = await Promise.all([
    getPublicMenu(guest.restaurant.id),
    getCartView(db, guest),
    listGuestOrders(db, guest),
  ]);
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <LiveRefresh types={["session.closed"]} />
      <MenuApp
        menu={menu}
        currency={guest.restaurant.currency}
        initialCart={{ itemCount: cart.itemCount, totalCents: cart.totals.totalCents }}
        header={<GuestHeader guest={guest} orderCount={orders.length} />}
      />
    </LiveProvider>
  );
}
