"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { useLiveEvent } from "@/components/realtime/live";
import { TimeAgo } from "@/components/ui/time-ago";
import {
  listNotificationsAction,
  markNotificationsReadAction,
} from "@/app/[locale]/dashboard/[restaurantId]/live-actions";

type Item = { id: string; type: string; payload: Record<string, unknown>; createdAt: string; read: boolean };

export function NotificationBell({
  restaurantId,
  timeZone,
  initialUnread,
}: {
  restaurantId: string;
  timeZone: string;
  initialUnread: number;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    () =>
      startTransition(async () => {
        const res = await listNotificationsAction(restaurantId);
        if (res?.ok && res.data) {
          setUnread(res.data.unread);
          setItems(res.data.items as Item[]);
        }
      }),
    [restaurantId],
  );

  useLiveEvent((type) => {
    if (type === "notification.created") load();
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = (n: Item) => {
    const key = `types.${n.type}`;
    return t.has(key)
      ? t(key, {
          number: String(n.payload.number ?? ""),
          table: String(n.payload.tableLabel ?? ""),
          client: String(n.payload.seq ?? ""),
          method: String(n.payload.method ?? "any"),
          amount:
            typeof n.payload.amountCents === "number" && typeof n.payload.currency === "string"
              ? format.number(n.payload.amountCents / 100, {
                  style: "currency",
                  currency: n.payload.currency,
                })
              : "",
        })
      : n.type;
  };

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        aria-label={t("open", { count: unread })}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute end-1 top-1 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-5 font-semibold text-accent-fg tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute start-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-semibold">{t("title")}</p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-accent"
                onClick={() =>
                  startTransition(async () => {
                    await markNotificationsReadAction(restaurantId);
                    setUnread(0);
                    setItems((list) => list?.map((i) => ({ ...i, read: true })) ?? null);
                  })
                }
              >
                {t("markRead")}
              </button>
            ) : null}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {items === null ? (
              <li className="px-4 py-6 text-center text-sm text-fg-muted">…</li>
            ) : items.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-fg-muted">{t("empty")}</li>
            ) : (
              items.map((n) => (
                <li key={n.id} className={cn("px-4 py-3 text-sm", !n.read && "bg-accent-soft/40")}>
                  <p className={cn(!n.read && "font-medium")}>{label(n)}</p>
                  <p className="text-xs text-fg-subtle">
                    <TimeAgo date={n.createdAt} timeZone={timeZone} />
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
