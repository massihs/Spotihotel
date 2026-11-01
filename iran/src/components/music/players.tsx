"use client";

import {
  Clock3,
  Loader2,
  Pause,
  Play,
  Radio,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { reportPlaybackAction } from "@/app/[locale]/dashboard/[restaurantId]/music/actions";
import { cn } from "@/lib/cn";
import { Cover, Equalizer, Mosaic } from "./cover";

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string | null;
  durationSec: number;
  url: string;
  cover?: string | null;
};

/** Spotify's green: the music surfaces keep it whatever the restaurant brand color is. */
export const SPOTIFY_GREEN = "#1ed760";

export const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Thin progress bar that turns green and shows a knob on hover (seekable when onSeek is set). */
export function Progress({
  value,
  max,
  onSeek,
  label,
}: {
  value: number;
  max: number;
  onSeek?: (v: number) => void;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="group relative flex h-3 flex-1 items-center" dir="ltr">
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
        <div
          className="h-full rounded-full bg-white transition-colors group-hover:bg-[#1ed760]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
        style={{ left: `${pct}%` }}
        aria-hidden="true"
      />
      {onSeek ? (
        <input
          type="range"
          min={0}
          max={max || 1}
          step={1}
          value={Math.min(value, max)}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label={label}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      ) : null}
    </div>
  );
}

export function VolumeControl({
  volume,
  onChange,
  label,
}: {
  volume: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const last = useRef(1);
  return (
    <div className="flex w-36 items-center gap-2 text-white/70" dir="ltr">
      <button
        type="button"
        onClick={() => {
          if (volume > 0) {
            last.current = volume;
            onChange(0);
          } else onChange(last.current || 1);
        }}
        aria-label={label}
        className="hover:text-white"
      >
        <Icon className="size-5" aria-hidden="true" />
      </button>
      <Progress value={volume * 100} max={100} onSeek={(v) => onChange(v / 100)} label={label} />
    </div>
  );
}

function PlayButton({
  playing,
  loading,
  onClick,
  label,
  size = "lg",
}: {
  playing: boolean;
  loading?: boolean;
  onClick: () => void;
  label: string;
  size?: "sm" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-transform hover:scale-105 active:scale-95",
        size === "lg" ? "size-14" : "size-9",
      )}
      style={{ background: size === "lg" ? SPOTIFY_GREEN : "white" }}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin", size === "lg" ? "size-6" : "size-4")} aria-hidden="true" />
      ) : playing ? (
        <Pause className={cn("fill-current", size === "lg" ? "size-6" : "size-4")} aria-hidden="true" />
      ) : (
        <Play
          className={cn("translate-x-[1px] fill-current", size === "lg" ? "size-6" : "size-4")}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

/**
 * The restaurant's playlist, Spotify style: playlist header with artwork, track table with
 * covers, and a player bar. Every track change / play / pause is reported so guests at the
 * tables see what is playing.
 */
export function PlaylistPlayer({
  restaurantId,
  tracks,
  color,
  title,
  subtitle,
}: {
  restaurantId: string;
  tracks: PlayerTrack[];
  color: string;
  title: string;
  subtitle: string;
}) {
  const t = useTranslations("music.player");
  const audio = useRef<HTMLAudioElement>(null);
  const [order, setOrder] = useState(() => tracks.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolume] = useState(1);
  const current = tracks[order[pos] ?? 0];

  const go = useCallback(
    (next: number) => setPos(((next % order.length) + order.length) % order.length),
    [order.length],
  );
  const report = useCallback(
    (playingNow: boolean) => {
      const a = audio.current;
      if (!current) return;
      void reportPlaybackAction(restaurantId, {
        trackId: current.id,
        positionSec: a ? a.currentTime : 0,
        playing: playingNow,
      }).catch(() => undefined);
    },
    [current, restaurantId],
  );

  useEffect(() => {
    const a = audio.current;
    if (!a || !current) return;
    a.src = current.url;
    setTime(0);
    if (playing) void a.play().catch(() => setPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  // Lock screen / Bluetooth controls, with the cover.
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? title,
      album: title,
      artwork: current.cover ? [{ src: current.cover, sizes: "600x600", type: "image/webp" }] : [],
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => go(pos + 1));
    navigator.mediaSession.setActionHandler("previoustrack", () => go(pos - 1));
  }, [current, go, pos, title]);

  if (!current) return null;
  const toggle = () => {
    const a = audio.current!;
    if (a.paused) void a.play().catch(() => setPlaying(false));
    else a.pause();
  };
  const totalMin = Math.round(tracks.reduce((s, x) => s + x.durationSec, 0) / 60);

  return (
    <div className="overflow-hidden rounded-2xl bg-[#121212] text-white shadow-[var(--shadow-float)]">
      {/* Playlist header */}
      <div
        className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:p-7"
        style={{ background: `linear-gradient(180deg, ${color} 0%, ${color}99 45%, #121212 100%)` }}
      >
        <Mosaic covers={tracks.map((x) => x.cover ?? null)} color={color} className="size-40 sm:size-48" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">{subtitle}</p>
          <p className="mt-1 text-3xl font-black tracking-tight sm:text-5xl" dir="auto">
            {title}
          </p>
          <p className="mt-3 text-sm text-white/80">
            Spotifood · {t("tracks", { count: tracks.length })} · {t("minutes", { count: totalMin })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-5 bg-gradient-to-b from-black/20 to-transparent px-5 py-4 sm:px-7">
        <PlayButton playing={playing} onClick={toggle} label={playing ? t("pause") : t("play")} />
        <button
          type="button"
          aria-pressed={shuffle}
          aria-label={t("shuffle")}
          onClick={() => {
            const next = !shuffle;
            setShuffle(next);
            const playingIdx = order[pos]!;
            const rest = tracks.map((_, i) => i).filter((i) => i !== playingIdx);
            if (next) rest.sort(() => Math.random() - 0.5);
            setOrder([playingIdx, ...rest]);
            setPos(0);
          }}
          className={cn("relative", shuffle ? "text-[#1ed760]" : "text-white/60 hover:text-white")}
        >
          <Shuffle className="size-7" aria-hidden="true" />
          {shuffle ? (
            <span className="absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-[#1ed760]" />
          ) : null}
        </button>
      </div>

      {/* Track table */}
      <div className="px-2 pb-2 sm:px-4">
        <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-white/10 px-3 pb-2 text-xs text-white/60">
          <span className="text-center">#</span>
          <span>{t("titleCol")}</span>
          <Clock3 className="size-4" aria-label={t("durationCol")} />
        </div>
        <ol className="max-h-[26rem] [scrollbar-width:thin] [scrollbar-color:#535353_transparent] overflow-y-auto py-2">
          {order.map((ti, i) => {
            const tr = tracks[ti]!;
            const on = i === pos;
            return (
              <li key={tr.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (on) return toggle();
                    setPos(i);
                    setPlaying(true);
                  }}
                  className="group grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md px-3 py-1.5 text-start hover:bg-white/10"
                >
                  <span
                    className={cn(
                      "text-center text-sm tabular-nums",
                      on ? "text-[#1ed760]" : "text-white/60",
                    )}
                  >
                    {on && playing ? (
                      <Equalizer on className="mx-auto" />
                    ) : (
                      <>
                        <span className="group-hover:hidden">{i + 1}</span>
                        <Play className="mx-auto hidden size-3.5 fill-current text-white group-hover:block" />
                      </>
                    )}
                  </span>
                  <span className="flex min-w-0 items-center gap-3">
                    <Cover src={tr.cover} color={color} className="size-10" rounded="rounded" />
                    <span className="min-w-0">
                      <span
                        className={cn("block truncate text-[15px]", on ? "text-[#1ed760]" : "text-white")}
                        dir="auto"
                      >
                        {tr.title}
                      </span>
                      <span className="block truncate text-sm text-white/60" dir="auto">
                        {tr.artist ?? t("unknownArtist")}
                      </span>
                    </span>
                  </span>
                  <span className="text-sm text-white/60 tabular-nums">{fmt(tr.durationSec)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Now playing bar */}
      <div className="grid grid-cols-1 items-center gap-3 border-t border-white/10 bg-black px-4 py-3 sm:grid-cols-[1fr_2fr_1fr]">
        <div className="flex min-w-0 items-center gap-3">
          <Cover src={current.cover} color={color} className="size-14" rounded="rounded" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" dir="auto">
              {current.title}
            </p>
            <p className="truncate text-xs text-white/60" dir="auto">
              {current.artist ?? t("unknownArtist")}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-5" dir="ltr">
            <button
              type="button"
              aria-label={t("previous")}
              onClick={() => go(pos - 1)}
              className="text-white/70 hover:text-white"
            >
              <SkipBack className="size-5 fill-current" aria-hidden="true" />
            </button>
            <PlayButton
              playing={playing}
              onClick={toggle}
              label={playing ? t("pause") : t("play")}
              size="sm"
            />
            <button
              type="button"
              aria-label={t("next")}
              onClick={() => go(pos + 1)}
              className="text-white/70 hover:text-white"
            >
              <SkipForward className="size-5 fill-current" aria-hidden="true" />
            </button>
            <span className="text-[#1ed760]" title={t("loop")}>
              <Repeat className="size-4" aria-hidden="true" />
            </span>
          </div>
          <div
            className="flex w-full max-w-md items-center gap-2 text-[11px] text-white/60 tabular-nums"
            dir="ltr"
          >
            <span className="w-9 text-end">{fmt(time)}</span>
            <Progress
              value={time}
              max={current.durationSec}
              label={t("seek")}
              onSeek={(v) => {
                if (audio.current) audio.current.currentTime = v;
              }}
            />
            <span className="w-9">{fmt(current.durationSec)}</span>
          </div>
        </div>
        <div className="hidden justify-end sm:flex">
          <VolumeControl volume={volume} onChange={setVolume} label={t("volume")} />
        </div>
      </div>
      <audio
        ref={audio}
        preload="auto"
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onEnded={() => go(pos + 1)}
        onPause={(e) => {
          // A track that ends also fires "pause": keep playing, onEnded moves to the next one.
          if (e.currentTarget.ended) return;
          setPlaying(false);
          report(false);
        }}
        onPlay={() => {
          setPlaying(true);
          report(true);
        }}
        onSeeked={() => report(!audio.current?.paused)}
      />
    </div>
  );
}

export type Live = {
  station: { slug: string; name: string; color: string; cover?: string | null };
  track: PlayerTrack;
  offsetSec: number;
  remainingSec?: number;
  upNext: PlayerTrack[];
  queue?: PlayerTrack[];
};

/** Tunes into a station: asks the clock what is on air and joins the song at the right second. */
export function useRadio(slug: string | null) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(1);

  const tune = useCallback(async () => {
    const a = audio.current;
    if (!a || !slug) return;
    setState("loading");
    try {
      const asked = performance.now();
      const res = await fetch(`/api/v1/music/radio/${slug}`, { cache: "no-store" });
      if (!res.ok) throw new Error("off_air");
      const data = (await res.json()) as Live;
      setLive(data);
      // Listen before setting src (cached files can fire immediately), and force loading.
      const ready = new Promise<void>((resolve, reject) => {
        a.onloadedmetadata = () => resolve();
        a.onerror = () => reject(new Error("load"));
      });
      a.preload = "auto";
      a.src = data.track.url;
      a.load();
      await ready;
      a.currentTime = data.offsetSec + (performance.now() - asked) / 1000;
      await a.play();
      setState("playing");
    } catch {
      setState("error");
    }
  }, [slug]);

  const stop = useCallback(() => {
    audio.current?.pause();
    setState("idle");
  }, []);

  // A station switch stops the old one; the listener presses play again (autoplay rules).
  useEffect(() => {
    const a = audio.current;
    return () => a?.pause();
  }, [slug]);

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    if (!live || !("mediaSession" in navigator)) return;
    const art = live.track.cover ?? live.station.cover;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: live.track.title,
      artist: live.track.artist ?? live.station.name,
      album: live.station.name,
      artwork: art ? [{ src: art, sizes: "600x600", type: "image/webp" }] : [],
    });
  }, [live]);

  const element = (
    <audio
      ref={audio}
      preload="none"
      onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
      // When a song ends, ask the clock again: the next song starts at second 0.
      onEnded={() => void tune()}
    />
  );
  return { live, state, time, volume, setVolume, tune, stop, element };
}

/** Compact live radio card (restaurant dashboard preview). */
export function RadioPlayer({ slug, name, color }: { slug: string; name: string; color: string }) {
  const t = useTranslations("music.radio");
  const r = useRadio(slug);
  const on = r.state === "playing";
  return (
    <div className="overflow-hidden rounded-2xl bg-[#121212] text-white shadow-[var(--shadow-float)]">
      <div
        className="flex items-end gap-4 p-5"
        style={{ background: `linear-gradient(180deg, ${color}, #121212)` }}
      >
        <Cover src={r.live?.track.cover ?? r.live?.station.cover} color={color} className="size-24" />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-bold">
            <span className={cn("size-1.5 rounded-full bg-red-500", on && "animate-pulse")} />
            {t("live")}
          </span>
          <p className="mt-2 truncate text-2xl font-black tracking-tight">{name}</p>
          <p className="truncate text-sm text-white/75" dir="auto">
            {r.live ? `${r.live.track.title} · ${r.live.track.artist ?? "—"}` : t("tapToListen")}
          </p>
        </div>
        <PlayButton
          playing={on}
          loading={r.state === "loading"}
          onClick={() => (on ? r.stop() : void r.tune())}
          label={on ? t("stop") : t("listen")}
        />
      </div>
      {r.state === "error" ? <p className="px-5 pb-3 text-sm text-red-300">{t("offAir")}</p> : null}
      {r.live ? (
        <div
          className="flex items-center gap-2 px-5 pt-2 pb-4 text-[11px] text-white/60 tabular-nums"
          dir="ltr"
        >
          <span>{fmt(r.time)}</span>
          <Progress value={r.time} max={r.live.track.durationSec} label={t("onAir")} />
          <span>{fmt(r.live.track.durationSec)}</span>
          <Radio className="size-4" aria-hidden="true" />
        </div>
      ) : null}
      {r.element}
    </div>
  );
}
