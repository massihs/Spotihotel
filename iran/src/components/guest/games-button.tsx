"use client";

import { Dices } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { gamesBadgeAction } from "@/app/[locale]/table/games/actions";
import { useLiveEvent } from "@/components/realtime/live";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Next to the waiter bell: the games room. The number is how many guests are waiting for
 * an opponent; a green dot means the guest has a game going on.
 */
export function GamesButton({ className }: { className?: string }) {
  const t = useTranslations("games");
  const [badge, setBadge] = useState({ open: 0, playing: 0 });
  const load = useCallback(() => {
    gamesBadgeAction()
      .then(setBadge)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 30_000);
    return () => clearInterval(id);
  }, [load]);
  useLiveEvent((type) => {
    if (type === "game.updated") load();
  });
  const label = badge.open ? t("badgeLabel", { n: badge.open }) : t("room");
  return (
    <Link
      href="/table/games"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-grid size-11 shrink-0 place-items-center rounded-full bg-surface text-fg shadow-[var(--shadow-soft)] ring-1 ring-border",
        className,
      )}
    >
      <Dices className="size-5" aria-hidden="true" />
      {badge.open ? (
        <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] leading-5 font-bold text-white tabular-nums ring-2 ring-surface">
          {badge.open}
        </span>
      ) : badge.playing ? (
        <span
          className="absolute -end-0.5 -top-0.5 size-3 rounded-full bg-success ring-2 ring-surface"
          aria-hidden="true"
        />
      ) : null}
    </Link>
  );
}
