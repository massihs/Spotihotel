import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { GuestTopBar } from "@/components/guest/cart-view";
import { GamesLobby } from "@/components/guest/games/lobby";
import { GuestSkeleton, SessionExpired } from "@/components/guest/states";
import { LiveProvider, LiveRefresh } from "@/components/realtime/live";
import { menuThemeOf } from "@/lib/menu-themes";
import { db } from "@/server/db/client";
import { gamesLobby } from "@/server/modules/games/service";
import { getGuest } from "@/server/modules/guest/current";

export default function GamesPage() {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <Games />
    </Suspense>
  );
}

async function Games() {
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  const [t, lobby] = await Promise.all([getTranslations("games"), gamesLobby(db, guest)]);
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <div data-brand={guest.restaurant.brandColor} className="contents">
        <div data-menu-theme={menuThemeOf(guest.restaurant.menuTheme)}>
          <LiveRefresh types={["game.updated", "session.closed"]} />
          <GuestTopBar title={t("room")} subtitle={guest.restaurant.name} />
          <main className="mx-auto max-w-2xl px-4 pt-4 pb-16">
            <GamesLobby
              lobby={JSON.parse(JSON.stringify(lobby))}
              me={guest.participant.displayName?.trim() || null}
            />
          </main>
        </div>
      </div>
    </LiveProvider>
  );
}
