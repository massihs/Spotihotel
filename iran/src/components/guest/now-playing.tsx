"use client";

import { ChevronDown, Music2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { nowPlayingAction } from "@/app/[locale]/table/actions";
import { Cover, Equalizer } from "@/components/music/cover";
import { fmt, Progress } from "@/components/music/players";
import type { NowPlaying as Np } from "@/server/modules/music/service";

const POLL_MS = 20_000;

/**
 * "Now playing in the restaurant": the song the in-house player is on, with its cover and live
 * progress. Polls the server (and re-polls when a song should have ended); tap to expand.
 */
export function NowPlaying({ initial, restaurantName }: { initial: Np | null; restaurantName: string }) {
  const t = useTranslations("guest.music");
  const [np, setNp] = useState<(Np & { receivedAt: number }) | null>(() =>
    initial ? { ...initial, receivedAt: Date.now() } : null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      const res = await nowPlayingAction().catch(() => null);
      if (!alive) return;
      if (res?.ok) setNp(res.data ? { ...res.data, receivedAt: Date.now() } : null);
      timer.current = setTimeout(poll, document.hidden ? POLL_MS * 3 : POLL_MS);
    };
    timer.current = setTimeout(poll, POLL_MS);
    const onVisible = () => {
      if (document.hidden) return;
      clearTimeout(timer.current);
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearTimeout(timer.current);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!np) return null;
  const pos = Math.min(np.track.durationSec, np.positionSec + (now - np.receivedAt) / 1000);
  // Song over: show the next one optimistically until the next poll confirms.
  const ended = pos >= np.track.durationSec;
  const track = ended && np.upNext[0] ? { ...np.upNext[0], positionSec: 0 } : np.track;
  const position = ended
    ? Math.min((now - np.receivedAt) / 1000 - (np.track.durationSec - np.positionSec), track.durationSec)
    : pos;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 overflow-hidden rounded-2xl bg-[#181818] p-2 pe-3 text-start text-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
        style={{ backgroundImage: `linear-gradient(90deg, ${np.theme.color}55, transparent 70%)` }}
        aria-label={t("openPlayer")}
      >
        <Cover src={track.cover} color={np.theme.color} className="size-12" rounded="rounded-lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#1ed760]">
            <Equalizer on className="h-3" />
            {t("nowPlayingIn", { name: restaurantName })}
          </span>
          <span className="block truncate text-sm font-bold" dir="auto">
            {track.title}
          </span>
          <span className="block truncate text-xs text-white/65" dir="auto">
            {track.artist ?? np.theme.name}
          </span>
        </span>
        <Music2 className="size-5 shrink-0 text-white/50" aria-hidden="true" />
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/10" aria-hidden="true">
          <span
            className="block h-full bg-[#1ed760] transition-[width] duration-1000 ease-linear"
            style={{ width: `${(position / Math.max(1, track.durationSec)) * 100}%` }}
          />
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t("nowPlaying")}>
          <div
            className="animate-sheet-up absolute inset-0 overflow-y-auto px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-10 text-white"
            style={{ background: `linear-gradient(180deg, ${np.theme.color} 0%, #121212 70%)` }}
          >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-10 place-items-center rounded-full hover:bg-white/10"
                aria-label={t("close")}
              >
                <ChevronDown className="size-7" aria-hidden="true" />
              </button>
              <p className="text-center text-xs">
                <span className="block text-white/70">{t("playingIn")}</span>
                <span className="font-bold">{restaurantName}</span>
              </p>
              <span className="size-10" />
            </div>
            <Cover
              src={track.cover}
              color={np.theme.color}
              alt={track.title}
              className="mx-auto mt-8 w-full max-w-sm"
              rounded="rounded-xl"
            />
            <div className="mx-auto mt-8 max-w-sm">
              <p className="truncate text-2xl font-bold" dir="auto">
                {track.title}
              </p>
              <p className="truncate text-base text-white/70" dir="auto">
                {track.artist ?? t("unknownArtist")}
              </p>
              <div className="mt-5 flex items-center gap-2 text-[11px] text-white/60 tabular-nums" dir="ltr">
                <span className="w-9">{fmt(position)}</span>
                <Progress value={position} max={track.durationSec} label={t("nowPlaying")} />
                <span className="w-9 text-end">{fmt(track.durationSec)}</span>
              </div>
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
                <Equalizer on className="h-3 text-[#1ed760]" />
                {np.theme.name}
              </p>
              {np.upNext.length ? (
                <div className="mt-8">
                  <p className="mb-3 font-bold">{t("upNext")}</p>
                  <ul className="space-y-3">
                    {np.upNext.map((u) => (
                      <li key={u.id} className="flex items-center gap-3">
                        <Cover src={u.cover} color={np.theme.color} className="size-12" rounded="rounded" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium" dir="auto">
                            {u.title}
                          </span>
                          <span className="block truncate text-sm text-white/60" dir="auto">
                            {u.artist ?? t("unknownArtist")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="mt-8 text-center text-xs text-white/50">{t("hint")}</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
