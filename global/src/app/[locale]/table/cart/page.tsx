import { Suspense } from "react";
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
      <LiveRefresh types={["session.closed"]} />
      <CartView
        lines={cart.lines}
        totals={cart.totals}
        currency={guest.restaurant.currency}
        pricesIncludeTax={guest.restaurant.pricesIncludeTax}
        seatLabel={t("you", { n: guest.participant.seq })}
        displayName={guest.participant.displayName}
        hasIssues={cart.hasIssues}
        orderCount={orders.length}
      />
    </LiveProvider>
  );
}
