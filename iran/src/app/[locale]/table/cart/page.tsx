import { Suspense } from "react";
import { menuThemeOf } from "@/lib/menu-themes";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { getCartView } from "@/server/modules/cart/service";
import { listGuestOrders } from "@/server/modules/orders/service";
import { CartView } from "@/components/guest/cart-view";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { LiveProvider, LiveRefresh } from "@/components/realtime/live";

/** The guest cookie is per request: the page streams behind its own boundary (instant navigations). */
export default function GuestCartPage() {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <GuestCart />
    </Suspense>
  );
}

async function GuestCart() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  const [t, cart, orders] = await Promise.all([
    getTranslations("guest"),
    getCartView(db, guest),
    listGuestOrders(db, guest),
  ]);
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <LiveRefresh types={["session.closed"]} />
          <CartView
            lines={cart.lines}
            totals={cart.totals}
            currency={guest.restaurant.currency}
            pricesIncludeTax={guest.restaurant.pricesIncludeTax}
            seatLabel={t(guest.table.kind === "room" ? "tableBadgeRoom" : "tableBadge", {
              table: guest.table.label,
            })}
            restaurantName={guest.restaurant.name}
            displayName={guest.participant.displayName}
            hasIssues={cart.hasIssues}
            orderCount={orders.length}
            requirePhone={guest.restaurant.kind === "food_court"}
          />
        </div>
      </div>
    </LiveProvider>
  );
}
