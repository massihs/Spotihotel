"use client";

import { BellRing, ConciergeBell, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLiveEvent } from "@/components/realtime/live";
import { chime } from "@/components/dashboard/order-alerts";

const permission = () => ("Notification" in window ? Notification.permission : "unsupported");
const subscribeNothing = () => () => {};

/**
 * Tells the guest the moment an order turns "ready": sound, vibration, a full-screen card,
 * and a system notification when the page is in the background (if allowed).
 */
export function ReadyWatcher() {
  const t = useTranslations("guest");
  const [ready, setReady] = useState<string | null>(null);
  const [asked, setAsked] = useState(0);
  const perm = useSyncExternalStore(subscribeNothing, permission, () => "unsupported");
  const audio = useRef<AudioContext | null>(null);

  useEffect(() => {
    const unlock = () => {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      void audio.current?.close();
    };
  }, []);

  useLiveEvent((type, data) => {
    if (type !== "order.updated" || data.status !== "ready") return;
    const number = String(data.number ?? "");
    setReady(number);
    if (audio.current) chime(audio.current);
    navigator.vibrate?.([200, 100, 200, 100, 300]);
    if (document.hidden && "Notification" in window && Notification.permission === "granted")
      new Notification(t("readyTitle"), { body: t("readyBody", { number }), tag: `ready-${number}` });
  });

  return (
    <>
      {perm === "default" ? (
        <button
          key={asked}
          type="button"
          onClick={async () => {
            await Notification.requestPermission().catch(() => undefined);
            setAsked((n) => n + 1);
          }}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start text-sm font-semibold shadow-[var(--shadow-soft)] lg:col-span-2"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <BellRing className="size-5" aria-hidden="true" />
          </span>
          {t("notifyMe")}
        </button>
      ) : null}

      {ready !== null ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-6 backdrop-blur-sm"
          role="alertdialog"
          aria-labelledby="ready-title"
        >
          <div className="animate-pop-in relative w-full max-w-sm rounded-3xl bg-surface p-7 text-center shadow-[var(--shadow-float)]">
            <button
              type="button"
              onClick={() => setReady(null)}
              aria-label={t("close")}
              className="absolute end-3 top-3 grid size-9 place-items-center rounded-full bg-surface-2 text-fg-muted"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-accent text-accent-fg shadow-accent">
              <ConciergeBell className="size-10" aria-hidden="true" />
            </span>
            <p id="ready-title" className="mt-5 text-2xl font-bold">
              {t("readyTitle")}
            </p>
            <p className="mt-2 text-fg-muted">{t("readyBody", { number: ready })}</p>
            <button
              type="button"
              onClick={() => setReady(null)}
              className="mt-6 h-12 w-full rounded-2xl bg-accent font-bold text-accent-fg"
            >
              {t("ok")}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
