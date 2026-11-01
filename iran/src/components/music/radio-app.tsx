"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Home,
  Library,
  ListMusic,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Search,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  SquarePlay,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LogoMark } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Cover, Equalizer, Mosaic } from "./cover";
import {
  fmt,
  Progress,
  SPOTIFY_GREEN,
  useRadio,
  VolumeControl,
  type Live,
  type PlayerTrack,
} from "./players";
import { useDominantColor, useGreeting, useLibrary, useOnAir, type LikedTrack } from "./radio-hooks";

export type StationTrack = {
  id: string;
  title: string;
  artist: string | null;
  durationSec: number;
  cover: string | null;
};

export type Station = {
  slug: string;
  name: string;
  description: string | null;
  color: string;
  cover: string | null;
  mosaic: string[];
  trackCount: number;
  minutes: number;
  tracks: StationTrack[];
};

type View =
  | { kind: "home" }
  | { kind: "search" }
  | { kind: "library" }
  | { kind: "liked" }
  | { kind: "station"; slug: string };

type Row = (StationTrack | PlayerTrack) & { cover?: string | null };

const LIKED_GRADIENT = "linear-gradient(135deg, #450af5, #c4efd9)";
const LIKED_COLOR = "#5038a0";

/**
 * The live radio as a Spotify web player: library, home, search and station pages, a "now
 * playing" panel, the player bar and, on phones, the mini player and the full-screen player.
 * It stays a radio: every listener hears the same second of the same song, so "skip" moves
 * between stations instead of songs.
 */
export function RadioApp({
  stations,
  initialSlug,
  initialView,
}: {
  stations: Station[];
  initialSlug: string;
  initialView: "home" | "station" | "search" | "liked";
}) {
  const t = useTranslations("music.radio");
  const lib = useLibrary();
  const [tuned, setTuned] = useState(initialSlug);
  const r = useRadio(tuned);
  const wantPlay = useRef(false);
  const on = r.state === "playing";
  const onAir = useOnAir(useMemo(() => stations.map((s) => s.slug), [stations]));

  // ── Navigation with back / forward, like the web player ──
  const first: View =
    initialView === "station" ? { kind: "station", slug: initialSlug } : { kind: initialView };
  const [nav, setNav] = useState<{ stack: View[]; at: number }>({ stack: [first], at: 0 });
  const view = nav.stack[nav.at]!;
  const mainRef = useRef<HTMLElement>(null);
  const go = useCallback((v: View) => {
    setNav((n) => {
      const cur = n.stack[n.at]!;
      if (JSON.stringify(cur) === JSON.stringify(v)) return n;
      return { stack: [...n.stack.slice(0, n.at + 1), v], at: n.at + 1 };
    });
  }, []);
  const back = () => setNav((n) => ({ ...n, at: Math.max(0, n.at - 1) }));
  const forward = () => setNav((n) => ({ ...n, at: Math.min(n.stack.length - 1, n.at + 1) }));
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
    const url = new URL(window.location.href);
    url.searchParams.delete("s");
    url.searchParams.delete("v");
    if (view.kind === "station") url.searchParams.set("s", view.slug);
    else if (view.kind !== "home") url.searchParams.set("v", view.kind);
    window.history.replaceState(null, "", url);
  }, [view]);

  // ── Playback ──
  useEffect(() => {
    if (wantPlay.current) void r.tune();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tuned]);
  useEffect(() => {
    if (on) lib.played(tuned);
  }, [on, tuned, lib]);
  const play = useCallback(
    (slug: string) => {
      wantPlay.current = true;
      if (slug === tuned) {
        if (on) r.stop();
        else void r.tune();
      } else setTuned(slug);
    },
    [tuned, on, r],
  );
  const toggle = () => play(tuned);
  const step = (dir: 1 | -1) => {
    const i = stations.findIndex((s) => s.slug === tuned);
    play(stations[(i + dir + stations.length) % stations.length]!.slug);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.code !== "Space" || /input|textarea|select|button/i.test(el.tagName)) return;
      e.preventDefault();
      play(tuned);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play, tuned]);

  const station = (slug: string) => stations.find((s) => s.slug === slug) ?? stations[0]!;
  const tunedStation = station(tuned);
  const liveOf = (slug: string): Live | null =>
    slug === tuned && r.live?.station.slug === slug ? r.live : (onAir[slug] ?? null);
  const live = liveOf(tuned);
  const art = live?.track.cover ?? tunedStation.cover;
  const playerColor = useDominantColor(art, tunedStation.color);
  const isOn = (slug: string) => on && slug === tuned;

  // ── Panels ──
  const [panel, setPanel] = useState<"now" | "queue" | null>("now");
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState("");
  const togglePanel = (p: "now" | "queue") => setPanel((cur) => (cur === p ? null : p));

  const like = (tr: Row, slug: string) =>
    lib.toggleLike({
      id: tr.id,
      title: tr.title,
      artist: tr.artist,
      cover: tr.cover ?? null,
      durationSec: tr.durationSec,
      station: slug,
    });
  const liked = (id: string) => lib.liked.some((l) => l.id === id);

  const ctx: Ctx = {
    t,
    stations,
    station,
    liveOf,
    play,
    isOn,
    loading: r.state === "loading",
    tuned,
    time: r.time,
    go,
    like,
    liked,
    lib,
  };

  return (
    <div
      className="flex min-h-dvh flex-col bg-[#121212] text-white lg:h-dvh lg:overflow-hidden lg:bg-black"
      data-brand="emerald"
    >
      <TopBar
        ctx={ctx}
        canBack={nav.at > 0}
        canForward={nav.at < nav.stack.length - 1}
        back={back}
        forward={forward}
        view={view}
        query={query}
        setQuery={setQuery}
      />

      <div
        className={cn(
          "flex min-h-0 flex-1 gap-2 lg:grid lg:px-2",
          panel
            ? "lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_320px]"
            : "lg:grid-cols-[280px_minmax(0,1fr)]",
        )}
      >
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-lg bg-[#121212] lg:flex">
          <LibraryPanel ctx={ctx} view={view} />
        </aside>

        <main
          ref={mainRef}
          className="relative min-w-0 flex-1 pb-[calc(8.5rem+env(safe-area-inset-bottom))] lg:overflow-y-auto lg:rounded-lg lg:bg-[#121212] lg:pb-0"
        >
          {view.kind === "home" ? <HomeView ctx={ctx} /> : null}
          {view.kind === "search" ? <SearchView ctx={ctx} query={query} setQuery={setQuery} /> : null}
          {view.kind === "library" ? (
            <div className="lg:hidden">
              <LibraryPanel ctx={ctx} view={view} mobile />
            </div>
          ) : null}
          {view.kind === "liked" ? <LikedView ctx={ctx} /> : null}
          {view.kind === "station" ? (
            <StationView ctx={ctx} s={station(view.slug)} scroller={mainRef} />
          ) : null}
        </main>

        {panel ? (
          <aside className="hidden min-h-0 overflow-y-auto rounded-lg bg-[#121212] xl:block">
            {panel === "now" ? (
              <NowPanel ctx={ctx} s={tunedStation} live={live} close={() => setPanel(null)} />
            ) : (
              <QueuePanel ctx={ctx} s={tunedStation} live={live} close={() => setPanel(null)} />
            )}
          </aside>
        ) : null}
      </div>

      <PlayerBar
        ctx={ctx}
        s={tunedStation}
        live={live}
        art={art}
        on={on}
        toggle={toggle}
        step={step}
        volume={r.volume}
        setVolume={r.setVolume}
        panel={panel}
        togglePanel={togglePanel}
        openFull={() => setFull(true)}
      />
      <MiniPlayer
        ctx={ctx}
        s={tunedStation}
        live={live}
        art={art}
        color={playerColor}
        on={on}
        toggle={toggle}
        open={() => setFull(true)}
      />
      <BottomNav ctx={ctx} view={view} />

      {full ? (
        <FullPlayer
          ctx={ctx}
          s={tunedStation}
          live={live}
          art={art}
          color={playerColor}
          on={on}
          toggle={toggle}
          step={step}
          close={() => setFull(false)}
        />
      ) : null}
      {r.state === "error" ? (
        <p
          role="alert"
          className="fixed inset-x-0 bottom-36 z-50 mx-auto w-fit rounded-md bg-[#2e77d0] px-4 py-2 text-sm font-semibold lg:bottom-24"
        >
          {t("offAir")}
        </p>
      ) : null}
      {r.element}
    </div>
  );
}

type Ctx = {
  t: ReturnType<typeof useTranslations<"music.radio">>;
  stations: Station[];
  station: (slug: string) => Station;
  liveOf: (slug: string) => Live | null;
  play: (slug: string) => void;
  isOn: (slug: string) => boolean;
  loading: boolean;
  tuned: string;
  time: number;
  go: (v: View) => void;
  like: (tr: Row, slug: string) => void;
  liked: (id: string) => boolean;
  lib: ReturnType<typeof useLibrary>;
};

// ─── Shared pieces ───────────────────────────────────────────────────────────

function GreenPlay({
  on,
  loading,
  onClick,
  label,
  size = "lg",
  className,
}: {
  on: boolean;
  loading?: boolean;
  onClick: () => void;
  label: string;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-black shadow-[0_8px_8px_rgba(0,0,0,0.3)] transition-transform hover:scale-105 hover:brightness-110 active:scale-95",
        size === "lg" ? "size-14" : "size-12",
        className,
      )}
      style={{ background: SPOTIFY_GREEN }}
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
      ) : on ? (
        <Pause className="size-6 fill-current" strokeWidth={0} aria-hidden="true" />
      ) : (
        <Play className="size-6 translate-x-[1px] fill-current" strokeWidth={0} aria-hidden="true" />
      )}
    </button>
  );
}

function LikeButton({ ctx, tr, slug, className }: { ctx: Ctx; tr: Row; slug: string; className?: string }) {
  const on = ctx.liked(tr.id);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        ctx.like(tr, slug);
      }}
      aria-pressed={on}
      aria-label={on ? ctx.t("unlike") : ctx.t("like")}
      title={on ? ctx.t("unlike") : ctx.t("like")}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full transition-transform hover:scale-105",
        on ? "text-[#1ed760]" : "text-white/70 hover:text-white",
        className,
      )}
    >
      <Heart className={cn("size-[18px]", on && "fill-current")} aria-hidden="true" />
    </button>
  );
}

function LikedArt({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid aspect-square shrink-0 place-items-center shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
        className,
      )}
      style={{ background: LIKED_GRADIENT }}
    >
      <Heart className="size-[42%] fill-white text-white" aria-hidden="true" />
    </span>
  );
}

function StationArt({
  s,
  className,
  rounded = "rounded-md",
}: {
  s: Station;
  className?: string;
  rounded?: string;
}) {
  return (
    <Mosaic covers={s.cover ? [s.cover] : s.mosaic} color={s.color} className={className} rounded={rounded} />
  );
}

/** Spotify card: artwork, bold title, two grey lines, a green play that rises on hover. */
function Card({
  art,
  title,
  sub,
  onOpen,
  onPlay,
  playing,
  label,
}: {
  art: ReactNode;
  title: string;
  sub: string;
  onOpen: () => void;
  onPlay: () => void;
  playing: boolean;
  label: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="group w-[42vw] max-w-44 shrink-0 cursor-pointer rounded-md p-0 transition-colors sm:w-auto sm:max-w-none sm:p-3 sm:hover:bg-[#1f1f1f] lg:w-auto"
    >
      <div className="relative">
        {art}
        <span
          className={cn(
            "absolute end-2 bottom-2 hidden transition-all duration-300 sm:block",
            playing
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
          )}
        >
          <GreenPlay on={playing} onClick={onPlay} label={label} size="md" />
        </span>
      </div>
      <p className="mt-2 truncate font-bold sm:mt-3" dir="auto">
        {title}
      </p>
      <p className="mt-1 line-clamp-2 text-sm text-[#b3b3b3]" dir="auto">
        {sub}
      </p>
    </div>
  );
}

function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-xl font-bold tracking-tight hover:underline sm:text-2xl">{title}</h2>
      <div className="-mx-4 flex [scrollbar-width:none] gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-0 sm:overflow-visible sm:px-0 sm:[&>*:nth-child(n+7)]:hidden xl:[&>*:nth-child(n+7)]:block">
        {children}
      </div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "h-8 shrink-0 rounded-full px-3 text-sm font-medium transition-colors",
        on ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}

// ─── Top bar (desktop) ───────────────────────────────────────────────────────

function TopBar({
  ctx,
  canBack,
  canForward,
  back,
  forward,
  view,
  query,
  setQuery,
}: {
  ctx: Ctx;
  canBack: boolean;
  canForward: boolean;
  back: () => void;
  forward: () => void;
  view: View;
  query: string;
  setQuery: (q: string) => void;
}) {
  const { t } = ctx;
  return (
    <header className="hidden h-16 shrink-0 items-center gap-2 px-4 lg:flex">
      <Link href="/" aria-label="Spotifood" className="grid size-10 place-items-center rounded-full">
        <LogoMark className="size-8" />
      </Link>
      <div className="flex gap-1">
        <NavArrow disabled={!canBack} onClick={back} label={t("back")} dir="back" />
        <NavArrow disabled={!canForward} onClick={forward} label={t("forward")} dir="forward" />
      </div>
      <div className="mx-auto flex w-full max-w-[34rem] items-center gap-2">
        <button
          type="button"
          onClick={() => ctx.go({ kind: "home" })}
          aria-label={t("home")}
          title={t("home")}
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full bg-[#1f1f1f] transition-transform hover:scale-105",
            view.kind === "home" ? "text-white" : "text-[#b3b3b3] hover:text-white",
          )}
        >
          <Home className={cn("size-6", view.kind === "home" && "fill-current")} aria-hidden="true" />
        </button>
        <label className="group flex h-12 flex-1 items-center gap-3 rounded-full bg-[#1f1f1f] px-3 ring-white/80 transition-colors focus-within:ring-2 hover:bg-[#2a2a2a] hover:ring-1 hover:ring-white/20">
          <Search
            className="size-6 shrink-0 text-[#b3b3b3] group-focus-within:text-white"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (view.kind !== "search") ctx.go({ kind: "search" });
            }}
            onFocus={() => view.kind !== "search" && ctx.go({ kind: "search" })}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="h-full min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-[#b3b3b3] [&::-webkit-search-cancel-button]:hidden"
            style={{ outline: "none" }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("close")}
              className="text-[#b3b3b3] hover:text-white"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="hidden h-8 items-center rounded-full px-3 text-sm font-bold text-[#b3b3b3] hover:scale-105 hover:text-white xl:inline-flex"
        >
          {t("forRestaurants")}
        </Link>
        <LanguageSwitcher tone="inverted" />
      </div>
    </header>
  );
}

function NavArrow({
  disabled,
  onClick,
  label,
  dir,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  dir: "back" | "forward";
}) {
  // "Back" points toward the reading start: right in RTL, left in LTR.
  const Icon = dir === "back" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-full bg-black/70 text-white disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="size-5 rtl:rotate-180" aria-hidden="true" />
    </button>
  );
}

// ─── Library ─────────────────────────────────────────────────────────────────

function LibraryPanel({ ctx, view, mobile }: { ctx: Ctx; view: View; mobile?: boolean }) {
  const { t, lib } = ctx;
  const [filter, setFilter] = useState<"all" | "stations" | "liked">("all");
  // Recently played first, then followed, then the rest.
  const ordered = [...ctx.stations].sort((a, b) => {
    const rank = (s: Station) => {
      const r = lib.recent.indexOf(s.slug);
      return r >= 0 ? r : lib.followed.includes(s.slug) ? 50 : 100;
    };
    return rank(a) - rank(b);
  });
  const active = (v: View) => JSON.stringify(v) === JSON.stringify(view);
  const item = (key: string, v: View, art: ReactNode, title: string, sub: string, playing: boolean) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => ctx.go(v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md p-2 text-start transition-colors",
          active(v) ? "bg-white/10 hover:bg-white/15" : "hover:bg-white/5",
        )}
      >
        {art}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", playing ? "text-[#1ed760]" : "text-white")} dir="auto">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[#b3b3b3]">{sub}</span>
        </span>
        {playing ? <Equalizer on className="text-[#1ed760]" /> : null}
      </button>
    </li>
  );
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", mobile && "px-2 pt-4")}>
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <h2 className={cn("flex items-center gap-3 font-bold", mobile ? "text-2xl" : "text-[#b3b3b3]")}>
          {mobile ? (
            <span className="grid size-8 place-items-center rounded-full bg-[#1ed760] text-black">
              <Radio className="size-4" aria-hidden="true" />
            </span>
          ) : (
            <Library className="size-6" aria-hidden="true" />
          )}
          {t("yourLibrary")}
        </h2>
        <button
          type="button"
          onClick={() => ctx.go({ kind: "search" })}
          aria-label={t("search")}
          className="grid size-8 place-items-center rounded-full text-[#b3b3b3] hover:bg-white/10 hover:text-white"
        >
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex gap-2 px-3 pb-2">
        <Chip
          on={filter === "stations"}
          onClick={() => setFilter(filter === "stations" ? "all" : "stations")}
        >
          {t("filterStations")}
        </Chip>
        <Chip on={filter === "liked"} onClick={() => setFilter(filter === "liked" ? "all" : "liked")}>
          {t("filterLiked")}
        </Chip>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 lg:px-2">
        {filter !== "stations"
          ? item(
              "liked",
              { kind: "liked" },
              <LikedArt className="size-12 rounded" />,
              t("likedSongs"),
              `${t("radioType")} · ${t("likedCount", { count: lib.liked.length })}`,
              false,
            )
          : null}
        {filter !== "liked"
          ? ordered.map((s) =>
              item(
                s.slug,
                { kind: "station", slug: s.slug },
                <StationArt s={s} className="size-12" rounded="rounded" />,
                s.name,
                `${t("radioType")} · Spotifood`,
                ctx.isOn(s.slug),
              ),
            )
          : null}
      </ul>
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function HomeView({ ctx }: { ctx: Ctx }) {
  const { t, stations } = ctx;
  const greeting = useGreeting();
  const [hover, setHover] = useState<string | null>(null);
  const [chip, setChip] = useState<"all" | "stations">("all");
  const tint = useDominantColor(
    hover ? (ctx.station(hover).cover ?? ctx.station(hover).mosaic[0]) : stations[0]!.cover,
    hover ? ctx.station(hover).color : stations[0]!.color,
  );
  const recents = ctx.lib.recent
    .map((s) => stations.find((x) => x.slug === s))
    .filter((s): s is Station => !!s);
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 transition-[background] duration-700"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${tint} 70%, transparent) 0%, #121212 100%)`,
        }}
      />
      <div className="relative px-4 pt-4 sm:px-6 lg:pt-4">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            aria-label="Spotifood"
            className="grid size-8 place-items-center rounded-full bg-[#1ed760] lg:hidden"
          >
            <LogoMark className="size-5" />
          </Link>
          <Chip on={chip === "all"} onClick={() => setChip("all")}>
            {t("filterAll")}
          </Chip>
          <Chip on={chip === "stations"} onClick={() => setChip("stations")}>
            {t("filterStations")}
          </Chip>
          <div className="ms-auto lg:hidden">
            <LanguageSwitcher tone="inverted" />
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{t(greeting)}</h1>

        <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <Shortcut
            art={<LikedArt className="size-12 sm:size-16" />}
            title={t("likedSongs")}
            onOpen={() => ctx.go({ kind: "liked" })}
            onHover={() => setHover(null)}
          />
          {stations.slice(0, 7).map((s) => (
            <Shortcut
              key={s.slug}
              art={<StationArt s={s} className="size-12 sm:size-16" rounded="rounded-none" />}
              title={s.name}
              playing={ctx.isOn(s.slug)}
              onOpen={() => ctx.go({ kind: "station", slug: s.slug })}
              onPlay={() => ctx.play(s.slug)}
              onHover={() => setHover(s.slug)}
              label={ctx.isOn(s.slug) ? t("stop") : t("listen")}
            />
          ))}
        </div>

        {chip === "all" ? (
          <Shelf title={t("onAirNow")}>
            {stations.map((s) => {
              const l = ctx.liveOf(s.slug);
              return (
                <Card
                  key={s.slug}
                  art={
                    <Cover
                      src={l?.track.cover ?? s.cover}
                      color={s.color}
                      className="w-full"
                      rounded="rounded-md"
                    />
                  }
                  title={l?.track.title ?? s.name}
                  sub={l ? `${l.track.artist ?? "—"} · ${s.name}` : s.name}
                  onOpen={() => ctx.go({ kind: "station", slug: s.slug })}
                  onPlay={() => ctx.play(s.slug)}
                  playing={ctx.isOn(s.slug)}
                  label={ctx.isOn(s.slug) ? t("stop") : t("listen")}
                />
              );
            })}
          </Shelf>
        ) : null}

        <Shelf title={t("madeForYou")}>
          {stations.map((s) => (
            <Card
              key={s.slug}
              art={<StationArt s={s} className="w-full" />}
              title={s.name}
              sub={s.description ?? `${t("radioType")} · ${t("tracksOnStation", { count: s.trackCount })}`}
              onOpen={() => ctx.go({ kind: "station", slug: s.slug })}
              onPlay={() => ctx.play(s.slug)}
              playing={ctx.isOn(s.slug)}
              label={ctx.isOn(s.slug) ? t("stop") : t("listen")}
            />
          ))}
        </Shelf>

        {recents.length && chip === "all" ? (
          <Shelf title={t("recents")}>
            {recents.map((s) => (
              <Card
                key={s.slug}
                art={<StationArt s={s} className="w-full" />}
                title={s.name}
                sub={`${t("radioType")} · Spotifood`}
                onOpen={() => ctx.go({ kind: "station", slug: s.slug })}
                onPlay={() => ctx.play(s.slug)}
                playing={ctx.isOn(s.slug)}
                label={ctx.isOn(s.slug) ? t("stop") : t("listen")}
              />
            ))}
          </Shelf>
        ) : null}
        <div className="h-10" />
      </div>
    </div>
  );
}

function Shortcut({
  art,
  title,
  onOpen,
  onPlay,
  onHover,
  playing,
  label,
}: {
  art: ReactNode;
  title: string;
  onOpen: () => void;
  onPlay?: () => void;
  onHover: () => void;
  playing?: boolean;
  label?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      onMouseEnter={onHover}
      className="group relative flex h-12 cursor-pointer items-center gap-3 overflow-hidden rounded bg-white/10 pe-2 transition-colors hover:bg-white/20 sm:h-16"
    >
      <span className="overflow-hidden rounded-s">{art}</span>
      <span
        className={cn("min-w-0 flex-1 truncate text-sm font-bold sm:text-base", playing && "text-[#1ed760]")}
        dir="auto"
      >
        {title}
      </span>
      {onPlay ? (
        <span
          className={cn(
            "absolute end-2 hidden transition-opacity sm:block",
            playing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          <GreenPlay
            on={!!playing}
            onClick={onPlay}
            label={label ?? ""}
            size="md"
            className="size-10 [&_svg]:size-5"
          />
        </span>
      ) : null}
      {playing ? <Equalizer on className="text-[#1ed760] sm:hidden" /> : null}
    </div>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

function SearchView({ ctx, query, setQuery }: { ctx: Ctx; query: string; setQuery: (q: string) => void }) {
  const { t, stations } = ctx;
  const q = query.trim().toLowerCase();
  const matchStations = stations.filter((s) =>
    [s.name, s.description].some((x) => x?.toLowerCase().includes(q)),
  );
  const songs = stations.flatMap((s) =>
    s.tracks
      .filter((tr) => [tr.title, tr.artist].some((x) => x?.toLowerCase().includes(q)))
      .map((tr) => ({ tr, s })),
  );
  const top = matchStations[0] ?? (songs[0] ? songs[0].s : null);
  return (
    <div className="px-4 pt-4 sm:px-6">
      {/* Phones: Spotify's white search field. */}
      <div className="lg:hidden">
        <h1 className="text-2xl font-bold">{t("search")}</h1>
        <label className="mt-4 flex h-12 items-center gap-3 rounded-md bg-white px-3 text-black">
          <Search className="size-6 shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-black/60"
            style={{ outline: "none" }}
          />
        </label>
      </div>

      {!q ? (
        <>
          <h2 className="mt-6 mb-4 text-xl font-bold lg:mt-2 lg:text-2xl">{t("browseAll")}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {stations.map((s) => (
              <BrowseTile key={s.slug} s={s} onClick={() => ctx.go({ kind: "station", slug: s.slug })} />
            ))}
          </div>
        </>
      ) : matchStations.length === 0 && songs.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-2xl font-bold">{t("noResults", { q: query.trim() })}</p>
          <p className="mt-3 text-[#b3b3b3]">{t("noResultsBody")}</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:mt-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {top ? (
              <section>
                <h2 className="mb-3 text-2xl font-bold">{t("topResult")}</h2>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => ctx.go({ kind: "station", slug: top.slug })}
                  onKeyDown={(e) => e.key === "Enter" && ctx.go({ kind: "station", slug: top.slug })}
                  className="group relative cursor-pointer rounded-lg bg-[#181818] p-5 transition-colors hover:bg-[#282828]"
                >
                  <StationArt s={top} className="size-24" />
                  <p className="mt-5 truncate text-3xl font-bold" dir="auto">
                    {top.name}
                  </p>
                  <p className="mt-1 text-sm text-[#b3b3b3]">
                    <span className="me-2 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">
                      {t("radioType")}
                    </span>
                    Spotifood
                  </p>
                  <span className="absolute end-5 bottom-5 translate-y-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    <GreenPlay
                      on={ctx.isOn(top.slug)}
                      onClick={() => ctx.play(top.slug)}
                      label={t("listen")}
                      size="md"
                    />
                  </span>
                </div>
              </section>
            ) : null}
            {songs.length ? (
              <section className="min-w-0">
                <h2 className="mb-3 text-2xl font-bold">{t("songs")}</h2>
                <ul>
                  {songs.slice(0, 4).map(({ tr, s }) => (
                    <TrackRow key={`${s.slug}-${tr.id}`} ctx={ctx} tr={tr} s={s} compact />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          {matchStations.length ? (
            <Shelf title={t("filterStations")}>
              {matchStations.map((s) => (
                <Card
                  key={s.slug}
                  art={<StationArt s={s} className="w-full" />}
                  title={s.name}
                  sub={`${t("radioType")} · Spotifood`}
                  onOpen={() => ctx.go({ kind: "station", slug: s.slug })}
                  onPlay={() => ctx.play(s.slug)}
                  playing={ctx.isOn(s.slug)}
                  label={t("listen")}
                />
              ))}
            </Shelf>
          ) : null}
        </>
      )}
      <div className="h-10" />
    </div>
  );
}

/** "Browse all" genre tile: color block, title, artwork tilted in the corner. */
function BrowseTile({ s, onClick }: { s: Station; onClick: () => void }) {
  const color = useDominantColor(s.cover ?? s.mosaic[0], s.color);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-[16/10] overflow-hidden rounded-lg p-4 text-start transition-transform hover:scale-[1.02] sm:aspect-square lg:aspect-[16/10]"
      style={{ background: color }}
    >
      <span
        className="relative z-10 block text-lg leading-tight font-bold break-words sm:text-2xl"
        dir="auto"
      >
        {s.name}
      </span>
      <span className="absolute -end-4 -bottom-2 w-[45%] rotate-[25deg] rtl:-rotate-[25deg]">
        <StationArt s={s} className="w-full" rounded="rounded" />
      </span>
    </button>
  );
}

// ─── Station page ────────────────────────────────────────────────────────────

function StationView({
  ctx,
  s,
  scroller,
}: {
  ctx: Ctx;
  s: Station;
  scroller: React.RefObject<HTMLElement | null>;
}) {
  const { t, lib } = ctx;
  const color = useDominantColor(s.cover ?? s.mosaic[0], s.color);
  const l = ctx.liveOf(s.slug);
  const rows: Row[] = l ? [l.track, ...(l.queue ?? l.upNext)] : s.tracks;
  const on = ctx.isOn(s.slug);
  const followed = lib.followed.includes(s.slug);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    const onScroll = () => setStuck((el?.scrollTop || window.scrollY) > 300);
    el?.addEventListener("scroll", onScroll);
    window.addEventListener("scroll", onScroll);
    return () => {
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [scroller]);

  return (
    <div>
      {/* Compact bar once the header scrolled away. */}
      <div
        inert={!stuck}
        className={cn(
          "sticky top-0 z-20 flex h-16 items-center gap-3 px-4 transition-opacity duration-300 sm:px-6",
          stuck ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        style={{ background: `color-mix(in srgb, ${color} 60%, #121212)` }}
      >
        <GreenPlay
          on={on}
          loading={ctx.loading && ctx.tuned === s.slug}
          onClick={() => ctx.play(s.slug)}
          label={on ? t("stop") : t("listen")}
          size="md"
          className="size-10"
        />
        <p className="truncate text-xl font-bold" dir="auto">
          {s.name}
        </p>
      </div>

      <header
        className="-mt-16 flex flex-col items-center gap-5 px-4 pt-20 pb-6 sm:flex-row sm:items-end sm:px-6"
        style={{ background: `linear-gradient(transparent 0, rgba(0,0,0,0.5) 100%), ${color}` }}
      >
        <button
          type="button"
          onClick={() => ctx.go({ kind: "home" })}
          aria-label={t("back")}
          className="self-start rounded-full bg-black/40 p-1.5 lg:hidden"
        >
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden="true" />
        </button>
        <StationArt
          s={s}
          className="size-56 shadow-[0_4px_60px_rgba(0,0,0,0.5)] lg:size-[232px]"
          rounded="rounded"
        />
        <div className="w-full min-w-0">
          <p className="hidden text-sm font-semibold sm:block">{t("liveStation")}</p>
          <h1
            className="mt-1 text-3xl leading-none font-black tracking-tight break-words sm:mt-2 sm:text-6xl xl:text-8xl"
            dir="auto"
          >
            {s.name}
          </h1>
          {s.description ? (
            <p className="mt-3 text-sm text-white/70 sm:mt-6" dir="auto">
              {s.description}
            </p>
          ) : null}
          <p className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <span className="grid size-6 place-items-center rounded-full bg-black">
                <LogoMark className="size-4" />
              </span>
              Spotifood
            </span>
            <span className="text-white/70">
              · {t("tracksOnStation", { count: s.trackCount })}, {t("minutes", { count: s.minutes })}
            </span>
          </p>
        </div>
      </header>

      <div
        className="px-4 pt-4 pb-10 sm:px-6"
        style={{ background: `linear-gradient(color-mix(in srgb, ${color} 45%, #121212) 0, #121212 232px)` }}
      >
        <div className="flex items-center gap-6 py-2">
          <GreenPlay
            on={on}
            loading={ctx.loading && ctx.tuned === s.slug}
            onClick={() => ctx.play(s.slug)}
            label={on ? t("stop") : t("listen")}
            className="order-last ms-auto sm:order-none sm:ms-0"
          />
          <button
            type="button"
            onClick={() => lib.toggleFollow(s.slug)}
            aria-pressed={followed}
            className={cn(
              "h-8 rounded-full border px-4 text-sm font-bold transition-transform hover:scale-105",
              followed ? "border-white text-white" : "border-white/50 text-white hover:border-white",
            )}
          >
            {followed ? t("following") : t("follow")}
          </button>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs font-bold">
            <span className={cn("size-2 rounded-full bg-red-500", on && "animate-pulse")} />
            {t("live")}
          </span>
        </div>

        <div className="mt-4 hidden grid-cols-[2rem_minmax(0,1fr)_6rem] gap-4 border-b border-white/10 px-4 pb-2 text-sm text-[#b3b3b3] sm:grid md:grid-cols-[2rem_minmax(0,4fr)_minmax(0,2fr)_6rem]">
          <span className="text-center">#</span>
          <span>{t("titleCol")}</span>
          <span className="hidden md:block">{t("albumCol")}</span>
          <span className="flex justify-end pe-1">
            <Clock3 className="size-4" aria-label={t("durationCol")} />
          </span>
        </div>
        <ol className="mt-2">
          {rows.map((tr, i) => (
            <TrackRow key={`${tr.id}-${i}`} ctx={ctx} tr={tr} s={s} index={i} live={!!l && i === 0} />
          ))}
        </ol>
        <p className="mt-6 text-xs text-[#b3b3b3]">{t("listeningTogether")}</p>
      </div>
    </div>
  );
}

function TrackRow({
  ctx,
  tr,
  s,
  index,
  live,
  compact,
}: {
  ctx: Ctx;
  tr: Row;
  s: Station;
  index?: number;
  live?: boolean;
  compact?: boolean;
}) {
  const { t } = ctx;
  const playing = live && ctx.isOn(s.slug);
  return (
    <li
      onDoubleClick={() => ctx.play(s.slug)}
      onClick={() => window.matchMedia("(max-width: 639px)").matches && ctx.play(s.slug)}
      className={cn(
        "group grid cursor-default items-center gap-4 rounded-md px-2 py-2 hover:bg-white/10 sm:px-4",
        compact
          ? "grid-cols-[minmax(0,1fr)_auto]"
          : "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[2rem_minmax(0,1fr)_6rem] md:grid-cols-[2rem_minmax(0,4fr)_minmax(0,2fr)_6rem]",
        live && "bg-white/5",
      )}
    >
      {!compact ? (
        <span className="hidden w-8 justify-center text-[#b3b3b3] tabular-nums sm:flex">
          {playing ? (
            <Equalizer on className="text-[#1ed760] group-hover:hidden" />
          ) : (
            <span className={cn("group-hover:hidden", live && "text-[#1ed760]")}>{(index ?? 0) + 1}</span>
          )}
          <button
            type="button"
            onClick={() => ctx.play(s.slug)}
            aria-label={playing ? t("stop") : t("listen")}
            className="hidden text-white group-hover:block"
          >
            {playing ? (
              <Pause className="size-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-4 fill-current" aria-hidden="true" />
            )}
          </button>
        </span>
      ) : null}
      <span className="flex min-w-0 items-center gap-3">
        <Cover src={tr.cover} color={s.color} className="size-10" rounded="rounded" />
        <span className="min-w-0">
          <span className={cn("block truncate", live ? "text-[#1ed760]" : "text-white")} dir="auto">
            {tr.title}
          </span>
          <span className="block truncate text-sm text-[#b3b3b3]" dir="auto">
            {live ? (
              <span className="me-1.5 inline-flex items-center gap-1 rounded-sm bg-[#1ed760] px-1 text-[10px] font-black text-black uppercase">
                {t("live")}
              </span>
            ) : null}
            {tr.artist ?? "—"}
          </span>
        </span>
      </span>
      {!compact ? (
        <button
          type="button"
          onClick={() => ctx.go({ kind: "station", slug: s.slug })}
          className="hidden truncate text-start text-sm text-[#b3b3b3] hover:text-white hover:underline md:block"
          dir="auto"
        >
          {s.name}
        </button>
      ) : null}
      <span className="flex items-center justify-end gap-3">
        <LikeButton
          ctx={ctx}
          tr={tr}
          slug={s.slug}
          className={cn(!ctx.liked(tr.id) && "sm:opacity-0 sm:group-hover:opacity-100")}
        />
        <span className="hidden w-10 text-end text-sm text-[#b3b3b3] tabular-nums sm:block" dir="ltr">
          {fmt(tr.durationSec)}
        </span>
      </span>
    </li>
  );
}

// ─── Liked songs ─────────────────────────────────────────────────────────────

function LikedView({ ctx }: { ctx: Ctx }) {
  const { t, lib } = ctx;
  const songs = lib.liked;
  const first = songs[0];
  return (
    <div>
      <header
        className="flex flex-col items-center gap-5 px-4 pt-6 pb-6 sm:flex-row sm:items-end sm:px-6 lg:pt-16"
        style={{ background: `linear-gradient(transparent 0, rgba(0,0,0,0.5) 100%), ${LIKED_COLOR}` }}
      >
        <LikedArt className="size-56 rounded shadow-[0_4px_60px_rgba(0,0,0,0.5)] lg:size-[232px]" />
        <div className="w-full min-w-0">
          <p className="hidden text-sm font-semibold sm:block">{t("filterLiked")}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-6xl xl:text-8xl">
            {t("likedSongs")}
          </h1>
          <p className="mt-4 text-sm text-white/80">{t("likedCount", { count: songs.length })}</p>
        </div>
      </header>
      <div
        className="px-4 pt-4 pb-10 sm:px-6"
        style={{
          background: `linear-gradient(color-mix(in srgb, ${LIKED_COLOR} 45%, #121212) 0, #121212 232px)`,
        }}
      >
        {first ? (
          <>
            <div className="py-2">
              <GreenPlay
                on={ctx.isOn(first.station)}
                onClick={() => ctx.play(first.station)}
                label={t("listen")}
              />
            </div>
            <ol className="mt-4">
              {songs.map((l, i) => (
                <LikedRow key={l.id} ctx={ctx} l={l} index={i} />
              ))}
            </ol>
          </>
        ) : (
          <div className="py-16 text-center">
            <Heart className="mx-auto size-14 text-white/70" aria-hidden="true" />
            <p className="mt-6 text-2xl font-bold">{t("noLiked")}</p>
            <p className="mt-3 text-[#b3b3b3]">{t("noLikedBody")}</p>
            <button
              type="button"
              onClick={() => ctx.go({ kind: "search" })}
              className="mt-8 h-12 rounded-full bg-white px-8 font-bold text-black hover:scale-105"
            >
              {t("browseAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LikedRow({ ctx, l, index }: { ctx: Ctx; l: LikedTrack; index: number }) {
  const s = ctx.stations.find((x) => x.slug === l.station);
  if (!s) return null;
  return <TrackRow ctx={ctx} tr={l} s={s} index={index} />;
}

// ─── Right panel ─────────────────────────────────────────────────────────────

function PanelHead({ title, close, ctx }: { title: string; close: () => void; ctx: Ctx }) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-[#121212] px-4 py-4">
      <p className="truncate font-bold" dir="auto">
        {title}
      </p>
      <button
        type="button"
        onClick={close}
        aria-label={ctx.t("close")}
        className="grid size-8 place-items-center rounded-full text-[#b3b3b3] hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function NowPanel({ ctx, s, live, close }: { ctx: Ctx; s: Station; live: Live | null; close: () => void }) {
  const { t } = ctx;
  const next = live?.upNext[0];
  return (
    <div className="pb-6">
      <PanelHead title={s.name} close={close} ctx={ctx} />
      <div className="px-4">
        <Cover src={live?.track.cover ?? s.cover} color={s.color} className="w-full" rounded="rounded-lg" />
        <div className="mt-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-2xl font-bold" dir="auto">
              {live?.track.title ?? s.name}
            </p>
            <p className="truncate text-[#b3b3b3]" dir="auto">
              {live ? (live.track.artist ?? "—") : t("liveStation")}
            </p>
          </div>
          {live ? <LikeButton ctx={ctx} tr={live.track} slug={s.slug} className="mt-1" /> : null}
        </div>

        <div className="mt-6 overflow-hidden rounded-lg bg-[#242424]">
          <div
            className="relative h-40"
            style={{ background: `linear-gradient(135deg, ${s.color}, #121212)` }}
          >
            <StationArt s={s} className="absolute inset-0 size-full opacity-60" rounded="rounded-none" />
            <p className="absolute start-4 top-4 font-bold">{t("aboutStation")}</p>
          </div>
          <div className="p-4">
            <p className="font-bold" dir="auto">
              {s.name}
            </p>
            <p className="mt-1 text-sm text-[#b3b3b3]">
              {t("tracksOnStation", { count: s.trackCount })} · {t("minutes", { count: s.minutes })}
            </p>
            {s.description ? (
              <p className="mt-3 text-sm text-[#b3b3b3]" dir="auto">
                {s.description}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => ctx.lib.toggleFollow(s.slug)}
              className="mt-4 h-8 rounded-full border border-white/50 px-4 text-sm font-bold hover:scale-105 hover:border-white"
            >
              {ctx.lib.followed.includes(s.slug) ? t("following") : t("follow")}
            </button>
          </div>
        </div>

        {next ? (
          <div className="mt-4 rounded-lg bg-[#242424] p-4">
            <p className="font-bold">{t("nextInQueue")}</p>
            <div className="mt-3 flex items-center gap-3">
              <Cover src={next.cover} color={s.color} className="size-12" rounded="rounded" />
              <div className="min-w-0">
                <p className="truncate" dir="auto">
                  {next.title}
                </p>
                <p className="truncate text-sm text-[#b3b3b3]" dir="auto">
                  {next.artist ?? "—"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QueuePanel({ ctx, s, live, close }: { ctx: Ctx; s: Station; live: Live | null; close: () => void }) {
  const { t } = ctx;
  const rows = live ? (live.queue ?? live.upNext) : s.tracks;
  return (
    <div className="pb-6">
      <PanelHead title={t("queue")} close={close} ctx={ctx} />
      <div className="px-2">
        {live ? (
          <>
            <p className="px-2 pb-2 font-bold">{t("nowPlaying")}</p>
            <MiniRow tr={live.track} s={s} green />
          </>
        ) : null}
        <p className="px-2 pt-4 pb-2 font-bold">
          {t("nextInQueue")} <span className="font-normal text-[#b3b3b3]">· {s.name}</span>
        </p>
        {rows.map((tr, i) => (
          <MiniRow key={`${tr.id}-${i}`} tr={tr} s={s} />
        ))}
      </div>
    </div>
  );
}

function MiniRow({ tr, s, green }: { tr: Row; s: Station; green?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
      <Cover src={tr.cover} color={s.color} className="size-12" rounded="rounded" />
      <div className="min-w-0">
        <p className={cn("truncate", green && "text-[#1ed760]")} dir="auto">
          {tr.title}
        </p>
        <p className="truncate text-sm text-[#b3b3b3]" dir="auto">
          {tr.artist ?? "—"}
        </p>
      </div>
    </div>
  );
}

// ─── Player bar (desktop) ────────────────────────────────────────────────────

function Controls({
  ctx,
  on,
  toggle,
  step,
  big,
}: {
  ctx: Ctx;
  on: boolean;
  toggle: () => void;
  step: (d: 1 | -1) => void;
  big?: boolean;
}) {
  const { t } = ctx;
  const dim = "text-[#b3b3b3] hover:text-white";
  return (
    <div className={cn("flex items-center", big ? "w-full justify-between" : "gap-5")} dir="ltr">
      <button
        type="button"
        disabled
        title={t("liveNoSkip")}
        aria-label={t("shuffle")}
        className="text-white/30"
      >
        <Shuffle className={big ? "size-6" : "size-4"} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label={t("prevStation")}
        title={t("prevStation")}
        className={big ? "text-white" : dim}
      >
        <SkipBack className={cn("fill-current", big ? "size-9" : "size-5")} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={on ? t("stop") : t("listen")}
        className={cn(
          "grid place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95",
          big ? "size-16" : "size-8",
        )}
      >
        {ctx.loading ? (
          <span
            className={cn(
              "animate-spin rounded-full border-2 border-black/20 border-t-black",
              big ? "size-6" : "size-4",
            )}
          />
        ) : on ? (
          <Pause
            className={cn("fill-current", big ? "size-7" : "size-4")}
            strokeWidth={0}
            aria-hidden="true"
          />
        ) : (
          <Play
            className={cn("translate-x-[1px] fill-current", big ? "size-7" : "size-4")}
            strokeWidth={0}
            aria-hidden="true"
          />
        )}
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label={t("nextStation")}
        title={t("nextStation")}
        className={big ? "text-white" : dim}
      >
        <SkipForward className={cn("fill-current", big ? "size-9" : "size-5")} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled
        title={t("liveNoSkip")}
        aria-label={t("repeat")}
        className="text-white/30"
      >
        <Repeat className={big ? "size-6" : "size-4"} aria-hidden="true" />
      </button>
    </div>
  );
}

function TimeLine({ ctx, live, className }: { ctx: Ctx; live: Live | null; className?: string }) {
  const value = live ? ctx.time : 0;
  const max = live?.track.durationSec ?? 1;
  return (
    <div
      className={cn("flex w-full items-center gap-2 text-xs text-[#b3b3b3] tabular-nums", className)}
      dir="ltr"
    >
      <span className="min-w-10 text-end">{live ? fmt(value) : "-:--"}</span>
      <Progress value={value} max={max} label={ctx.t("onAir")} />
      <span className="min-w-10">{live ? fmt(max) : "-:--"}</span>
    </div>
  );
}

function PlayerBar({
  ctx,
  s,
  live,
  art,
  on,
  toggle,
  step,
  volume,
  setVolume,
  panel,
  togglePanel,
  openFull,
}: {
  ctx: Ctx;
  s: Station;
  live: Live | null;
  art: string | null;
  on: boolean;
  toggle: () => void;
  step: (d: 1 | -1) => void;
  volume: number;
  setVolume: (v: number) => void;
  panel: "now" | "queue" | null;
  togglePanel: (p: "now" | "queue") => void;
  openFull: () => void;
}) {
  const { t } = ctx;
  const iconBtn = (active: boolean) =>
    cn(
      "relative grid size-8 place-items-center",
      active ? "text-[#1ed760]" : "text-[#b3b3b3] hover:text-white",
    );
  return (
    <footer className="hidden h-[72px] shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)] items-center gap-2 bg-black px-4 lg:grid">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={() => ctx.go({ kind: "station", slug: s.slug })} className="shrink-0">
          <Cover src={art} color={s.color} className="size-14" rounded="rounded" />
        </button>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => ctx.go({ kind: "station", slug: s.slug })}
            className="block max-w-full truncate text-start text-sm hover:underline"
            dir="auto"
          >
            {live?.track.title ?? s.name}
          </button>
          <p className="truncate text-xs text-[#b3b3b3]" dir="auto">
            {live ? (live.track.artist ?? s.name) : t("liveStation")}
          </p>
        </div>
        {live ? <LikeButton ctx={ctx} tr={live.track} slug={s.slug} /> : null}
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <Controls ctx={ctx} on={on} toggle={toggle} step={step} />
        <div className="flex w-full max-w-[38rem] items-center gap-2">
          <TimeLine ctx={ctx} live={live} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="me-1 inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2 py-0.5 text-[11px] font-bold">
          <span className={cn("size-1.5 rounded-full bg-red-500", on && "animate-pulse")} />
          {t("live")}
        </span>
        <button
          type="button"
          onClick={() => togglePanel("now")}
          aria-pressed={panel === "now"}
          aria-label={t("nowPlayingView")}
          title={t("nowPlayingView")}
          className={iconBtn(panel === "now")}
        >
          <SquarePlay className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => togglePanel("queue")}
          aria-pressed={panel === "queue"}
          aria-label={t("queue")}
          title={t("queue")}
          className={iconBtn(panel === "queue")}
        >
          <ListMusic className="size-4" aria-hidden="true" />
        </button>
        <VolumeControl volume={volume} onChange={setVolume} label={t("volume")} />
        <button
          type="button"
          onClick={openFull}
          aria-label={t("fullscreen")}
          title={t("fullscreen")}
          className={iconBtn(false)}
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

// ─── Phones: mini player, bottom tabs, full-screen player ────────────────────

function MiniPlayer({
  ctx,
  s,
  live,
  art,
  color,
  on,
  toggle,
  open,
}: {
  ctx: Ctx;
  s: Station;
  live: Live | null;
  art: string | null;
  color: string;
  on: boolean;
  toggle: () => void;
  open: () => void;
}) {
  const { t } = ctx;
  const pct = live ? (ctx.time / Math.max(1, live.track.durationSec)) * 100 : 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      className="fixed inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-40 overflow-hidden rounded-md lg:hidden"
      style={{ background: `color-mix(in srgb, ${color} 85%, #000)` }}
    >
      <div className="flex items-center gap-2.5 p-2">
        <Cover src={art} color={s.color} className="size-10" rounded="rounded" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" dir="auto">
            {live?.track.title ?? s.name}
          </p>
          <p className="truncate text-xs text-white/70" dir="auto">
            {live ? (live.track.artist ?? s.name) : t("liveStation")}
          </p>
        </div>
        {live ? <LikeButton ctx={ctx} tr={live.track} slug={s.slug} className="text-white" /> : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          aria-label={on ? t("stop") : t("listen")}
          className="grid size-9 place-items-center"
        >
          {ctx.loading ? (
            <span className="size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : on ? (
            <Pause className="size-6 fill-current" strokeWidth={0} aria-hidden="true" />
          ) : (
            <Play className="size-6 fill-current" strokeWidth={0} aria-hidden="true" />
          )}
        </button>
      </div>
      <span
        className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-white/25"
        aria-hidden="true"
        dir="ltr"
      >
        <span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function BottomNav({ ctx, view }: { ctx: Ctx; view: View }) {
  const { t } = ctx;
  const tab = (kind: "home" | "search" | "library", Icon: typeof Home, label: string) => {
    const active =
      view.kind === kind || (kind === "library" && (view.kind === "liked" || view.kind === "station"));
    return (
      <button
        type="button"
        onClick={() => ctx.go({ kind })}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-1 pt-2 text-[10px]",
          active ? "text-white" : "text-[#b3b3b3]",
        )}
      >
        <Icon
          className={cn("size-6", active && kind === "home" && "fill-current")}
          strokeWidth={active ? 2.5 : 2}
          aria-hidden="true"
        />
        {label}
      </button>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black via-black/95 to-black/70 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tab("home", Home, t("home"))}
      {tab("search", Search, t("search"))}
      {tab("library", Library, t("yourLibrary"))}
    </nav>
  );
}

function FullPlayer({
  ctx,
  s,
  live,
  art,
  color,
  on,
  toggle,
  step,
  close,
}: {
  ctx: Ctx;
  s: Station;
  live: Live | null;
  art: string | null;
  color: string;
  on: boolean;
  toggle: () => void;
  step: (d: 1 | -1) => void;
  close: () => void;
}) {
  const { t } = ctx;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [close]);
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?s=${s.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: s.name, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      // Dismissed.
    }
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("nowPlaying")}
      className="fixed inset-0 z-50 flex animate-[sheet-up_0.3s_ease-out] flex-col overflow-y-auto"
      style={{
        background: `linear-gradient(180deg, ${color} 0%, color-mix(in srgb, ${color} 40%, #121212) 55%, #121212 100%)`,
      }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={close}
            aria-label={t("minimize")}
            className="grid size-10 place-items-center"
          >
            <ChevronDown className="size-7 lg:hidden" aria-hidden="true" />
            <Minimize2 className="hidden size-6 lg:block" aria-hidden="true" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[11px] font-bold tracking-wider text-white/80 uppercase">{t("playingFrom")}</p>
            <p className="truncate text-sm font-bold" dir="auto">
              {s.name}
            </p>
          </div>
          <button
            type="button"
            onClick={share}
            aria-label="Share"
            className="grid size-10 place-items-center"
          >
            <Share2 className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-8 py-6 lg:flex-row lg:items-center lg:gap-16">
          <Cover
            src={art}
            color={s.color}
            className="mx-auto w-full max-w-[min(86vw,26rem)] shadow-[0_16px_64px_rgba(0,0,0,0.5)] lg:mx-0 lg:max-w-[min(60vh,32rem)]"
            rounded="rounded-lg"
          />
          <div className="w-full max-w-[26rem] self-center lg:max-w-md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-2xl font-bold lg:text-4xl" dir="auto">
                  {live?.track.title ?? s.name}
                </p>
                <p className="truncate text-white/70 lg:text-lg" dir="auto">
                  {live ? (live.track.artist ?? "—") : t("liveStation")}
                </p>
              </div>
              {live ? (
                <LikeButton ctx={ctx} tr={live.track} slug={s.slug} className="size-10 [&_svg]:size-6" />
              ) : null}
            </div>
            <TimeLine ctx={ctx} live={live} className="mt-6 text-white/70" />
            <div className="mt-4">
              <Controls ctx={ctx} on={on} toggle={toggle} step={step} big />
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-xs text-white/70">
              <span className={cn("size-2 rounded-full bg-red-500", on && "animate-pulse")} />
              {t("liveNoSkip")}
            </p>
            {live?.upNext.length ? (
              <div className="mt-6 rounded-lg bg-black/25 p-4">
                <p className="font-bold">{t("nextInQueue")}</p>
                <ul className="mt-3 space-y-3">
                  {live.upNext.map((tr, i) => (
                    <li key={`${tr.id}-${i}`} className="flex items-center gap-3">
                      <Cover src={tr.cover} color={s.color} className="size-10" rounded="rounded" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm" dir="auto">
                          {tr.title}
                        </span>
                        <span className="block truncate text-xs text-white/60" dir="auto">
                          {tr.artist ?? "—"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
