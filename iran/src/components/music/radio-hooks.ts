"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Live } from "./players";

/**
 * Spotify tints every surface with the artwork's dominant color. Sampled on a tiny canvas,
 * then pulled into a dark, saturated range so white text always reads.
 */
export function useDominantColor(src: string | null | undefined, fallback: string) {
  const [found, setFound] = useState<{ src: string; color: string } | null>(null);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        let r = 0,
          g = 0,
          b = 0,
          w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [pr, pg, pb] = [d[i]!, d[i + 1]!, d[i + 2]!];
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          // Colorful mid-tones count most; near-white and near-black backgrounds barely.
          const weight = 1 + ((max - min) / 255) * 6 - (max > 240 || max < 20 ? 0.9 : 0);
          r += pr * weight;
          g += pg * weight;
          b += pb * weight;
          w += weight;
        }
        if (alive && w > 0) setFound({ src, color: tone(r / w, g / w, b / w) });
      } catch {
        // Cross-origin artwork without CORS: keep the station color.
      }
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  return found && found.src === src ? found.color : fallback;
}

function tone(r: number, g: number, b: number) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return `hsl(${Math.round(h)} ${Math.round(Math.max(s, 0.35) * 100)}% ${Math.round(Math.min(Math.max(l, 0.28), 0.42) * 100)}%)`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

// ─── The listener's library, kept on this device ─────────────────────────────

export type LikedTrack = {
  id: string;
  title: string;
  artist: string | null;
  cover: string | null;
  durationSec: number;
  station: string;
  likedAt: number;
};

type Library = { liked: LikedTrack[]; followed: string[]; recent: string[] };
const KEY = "sf-radio-library";
const EMPTY: Library = { liked: [], followed: [], recent: [] };
const listeners = new Set<() => void>();
let cache: Library | null = null;
let raw: string | null = null;

function read(): Library {
  try {
    const now = localStorage.getItem(KEY);
    if (cache && now === raw) return cache;
    raw = now;
    cache = now ? { ...EMPTY, ...(JSON.parse(now) as Partial<Library>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Library) {
  cache = next;
  try {
    raw = JSON.stringify(next);
    localStorage.setItem(KEY, raw);
  } catch {
    // Private mode: the library lives for this visit only.
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => e.key === KEY && l();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLibrary() {
  const lib = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggleLike = useCallback((t: Omit<LikedTrack, "likedAt">) => {
    const cur = read();
    write({
      ...cur,
      liked: cur.liked.some((x) => x.id === t.id)
        ? cur.liked.filter((x) => x.id !== t.id)
        : [{ ...t, likedAt: Date.now() }, ...cur.liked],
    });
  }, []);
  const toggleFollow = useCallback((slug: string) => {
    const cur = read();
    write({
      ...cur,
      followed: cur.followed.includes(slug)
        ? cur.followed.filter((s) => s !== slug)
        : [slug, ...cur.followed],
    });
  }, []);
  const played = useCallback((slug: string) => {
    const cur = read();
    if (cur.recent[0] === slug) return;
    write({ ...cur, recent: [slug, ...cur.recent.filter((s) => s !== slug)].slice(0, 12) });
  }, []);
  return { ...lib, toggleLike, toggleFollow, played };
}

// ─── What every station is playing ───────────────────────────────────────────

/** Polls each station's clock, so shelves and search show what is on air right now. */
export function useOnAir(slugs: string[]) {
  const [onAir, setOnAir] = useState<Record<string, Live>>({});
  const key = slugs.join(",");
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const entries = await Promise.all(
        key
          .split(",")
          .filter(Boolean)
          .map(async (slug) => {
            try {
              const res = await fetch(`/api/v1/music/radio/${slug}`, { cache: "no-store" });
              return res.ok ? ([slug, (await res.json()) as Live] as const) : null;
            } catch {
              return null;
            }
          }),
      );
      if (alive) setOnAir(Object.fromEntries(entries.filter((e) => e !== null)));
    };
    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [key]);
  return onAir;
}

/** Morning / afternoon / evening in the listener's own clock (after hydration). */
export function useGreeting() {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const h = new Date().getHours();
      return h >= 5 && h < 12
        ? "greetingMorning"
        : h >= 12 && h < 18
          ? "greetingAfternoon"
          : "greetingEvening";
    },
    () => "greetingEvening",
  ) as "greetingMorning" | "greetingAfternoon" | "greetingEvening";
}
