"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type LiveStatus = "connecting" | "live" | "reconnecting";

const EVENT_TYPES = [
  "order.created",
  "order.updated",
  "session.opened",
  "session.closed",
  "notification.created",
  "payment.updated",
] as const;
export type LiveEventType = (typeof EVENT_TYPES)[number] | "ready";

type Listener = (type: LiveEventType, data: Record<string, unknown>) => void;
type LiveApi = { status: LiveStatus; subscribe: (l: Listener) => () => void };
const LiveContext = createContext<LiveApi | null>(null);

/** One EventSource per page; components subscribe to the events they care about. */
export function LiveProvider({ url, children }: { url: string; children: ReactNode }) {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const listeners = useRef(new Set<Listener>());
  const [subscribe] = useState(() => (l: Listener) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  });

  useEffect(() => {
    const es = new EventSource(url);
    const dispatch = (type: LiveEventType, raw: string) => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(raw);
      } catch {
        /* ignore malformed payloads */
      }
      listeners.current.forEach((l) => l(type, data));
    };
    es.addEventListener("ready", (ev) => {
      setStatus("live");
      dispatch("ready", (ev as MessageEvent<string>).data);
    });
    for (const type of EVENT_TYPES)
      es.addEventListener(type, (ev) => dispatch(type, (ev as MessageEvent<string>).data));
    es.onerror = () => setStatus("reconnecting"); // EventSource retries by itself
    return () => es.close();
  }, [url]);

  return <LiveContext value={{ status, subscribe }}>{children}</LiveContext>;
}

export function useLive() {
  return use(LiveContext);
}

/** Calls `handler` for every realtime event of the enclosing LiveProvider. */
export function useLiveEvent(handler: Listener) {
  const live = useLive();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => live?.subscribe((t, d) => ref.current(t, d)), [live]);
}

/**
 * Re-renders the server data of the page when one of `types` arrives (debounced, so a burst
 * triggers one refresh), after a reconnect (to catch up), and periodically while disconnected
 * so a screen never silently goes stale.
 */
export function LiveRefresh({
  types,
  fallbackSeconds = 15,
}: {
  types: LiveEventType[];
  fallbackSeconds?: number;
}) {
  const router = useRouter();
  const live = useLive();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const key = types.join(",");
  useLiveEvent((type) => {
    if (type !== "ready" && !key.split(",").includes(type)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 150);
  });
  const status = live?.status;
  useEffect(() => {
    if (status !== "reconnecting") return;
    const id = setInterval(
      () => document.visibilityState === "visible" && router.refresh(),
      fallbackSeconds * 1000,
    );
    return () => clearInterval(id);
  }, [status, router, fallbackSeconds]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return null;
}

export function LiveIndicator({ className }: { className?: string }) {
  const t = useTranslations("live");
  const status = useLive()?.status ?? "connecting";
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "size-2 rounded-full",
          status === "live"
            ? "animate-pulse bg-success"
            : status === "reconnecting"
              ? "bg-warning"
              : "bg-fg-subtle",
        )}
      />
      <span className={status === "live" ? "text-success" : "text-fg-muted"}>{t(status)}</span>
    </span>
  );
}
