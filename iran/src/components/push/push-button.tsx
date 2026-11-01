"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  subscribeGuestPushAction,
  subscribeStaffPushAction,
  unsubscribePushAction,
} from "@/app/[locale]/push-actions";

const b64ToBytes = (b64: string) => {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

type State = "unsupported" | "off" | "on" | "denied";

/** Turns Web Push on/off for this browser (staff: new orders; guest: order ready). */
export function PushButton({
  publicKey,
  restaurantId,
  className,
  compact = false,
}: {
  publicKey: string;
  /** Staff of this restaurant; without it, the current guest (table seat or account). */
  restaurantId?: string;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("off");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    if (Notification.permission === "denied") {
      queueMicrotask(() => setState("denied"));
      return;
    }
    void navigator.serviceWorker.getRegistration("/push-sw.js").then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      if (sub) setState("on");
    });
  }, []);

  const enable = () =>
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const reg = await navigator.serviceWorker.register("/push-sw.js");
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64ToBytes(publicKey),
        });
        const json = sub.toJSON();
        const res = restaurantId
          ? await subscribeStaffPushAction(restaurantId, json)
          : await subscribeGuestPushAction(json);
        setState(res?.ok ? "on" : "off");
      } catch {
        // No push service reachable from this browser (or blocked): stay off, nothing breaks.
        setState("off");
        setFailed(true);
      }
    });

  const disable = () =>
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/push-sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    });

  if (state === "unsupported") return null;
  const on = state === "on";
  return (
    <button
      type="button"
      disabled={pending || state === "denied"}
      onClick={on ? disable : enable}
      className={cn(
        "inline-flex items-center gap-2 rounded-full text-sm font-semibold disabled:opacity-60",
        compact ? "px-3 py-1.5 ring-1 ring-border" : "h-11 justify-center bg-surface px-4 ring-1 ring-border",
        on && "bg-accent-soft text-accent-text ring-0",
        className,
      )}
    >
      {on ? (
        <BellOff className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4" aria-hidden="true" />
      )}
      {state === "denied"
        ? t("denied")
        : failed
          ? t("unavailable")
          : on
            ? t("off")
            : restaurantId
              ? t("onStaff")
              : t("onGuest")}
    </button>
  );
}
