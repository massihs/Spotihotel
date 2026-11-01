import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { GameBoard } from "@/components/guest/games/board";
import { GuestSkeleton, SessionExpired } from "@/components/guest/states";
import { LiveProvider } from "@/components/realtime/live";
import { isUuid } from "@/lib/ids";
import { db } from "@/server/db/client";
import { isAppError } from "@/server/errors";
import { gameHeartbeat } from "@/server/modules/games/service";
import { getGuest } from "@/server/modules/guest/current";

type Props = PageProps<"/[locale]/table/games/[gameId]">;

export default function GamePage({ params }: Props) {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <Game params={params} />
    </Suspense>
  );
}

async function Game({ params }: Pick<Props, "params">) {
  const { gameId } = await params;
  const guest = await getGuest();
  if (!guest) return <SessionExpired />;
  if (!isUuid(gameId)) notFound();
  const view = await gameHeartbeat(db, guest, gameId).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const t = await getTranslations("games");
  return (
    <LiveProvider url="/api/v1/realtime/guest">
      <GameBoard
        initial={JSON.parse(JSON.stringify(view))}
        title={`${t("backgammon")} · ${guest.restaurant.name}`}
      />
    </LiveProvider>
  );
}
