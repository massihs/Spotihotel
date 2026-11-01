"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LiveIndicator, LiveRefresh, useLiveEvent } from "@/components/realtime/live";
import { Toast } from "@/components/ui/toast";
import { OrderCard, type OrderCardData } from "./order-card";

const COLUMNS = ["received", "accepted", "preparing", "ready", "served"] as const;

/** Two short tones; browsers only allow audio after a user gesture, hence the toggle. */
function chime(ctx: AudioContext) {
  const now = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.17);
  });
}

export function KitchenBoard({
  restaurantId,
  orders,
  timeZone,
  canUpdate,
  canCancel,
}: {
  restaurantId: string;
  orders: OrderCardData[];
  timeZone: string;
  canUpdate: boolean;
  canCancel: boolean;
}) {
  const t = useTranslations("kitchen");
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useLiveEvent((type, data) => {
    if (type !== "order.created") return;
    setToast(t("newOrder", { number: String(data.number ?? "") }));
    if (sound && audio.current) chime(audio.current);
  });

  useEffect(() => () => void audio.current?.close(), []);

  const byStatus = (s: (typeof COLUMNS)[number]) =>
    orders.filter((o) =>
      s === "received" ? o.status === "received" || o.status === "pending_payment" : o.status === s,
    );

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col">
      <LiveRefresh types={["order.created", "order.updated"]} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <LiveIndicator />
        </div>
        <div className="flex gap-2">
          <Button
            variant={sound ? "primary" : "secondary"}
            size="sm"
            aria-pressed={sound}
            onClick={() => {
              if (!audio.current) audio.current = new AudioContext();
              void audio.current.resume();
              if (!sound) chime(audio.current);
              setSound(!sound);
            }}
          >
            {sound ? `🔔 ${t("soundOn")}` : `🔕 ${t("soundOff")}`}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
          >
            {t("fullscreen")}
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const list = byStatus(col);
          return (
            <section
              key={col}
              aria-labelledby={`col-${col}`}
              className="flex min-h-0 flex-col rounded-2xl bg-surface-2/60 p-2"
            >
              <h2
                id={`col-${col}`}
                className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold"
              >
                {t(`columns.${col}`)}
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs tabular-nums">
                  {list.length}
                </span>
              </h2>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5">
                {list.map((o) => (
                  <li key={o.id}>
                    <OrderCard
                      restaurantId={restaurantId}
                      order={o}
                      canUpdate={canUpdate}
                      canCancel={canCancel}
                      timeZone={timeZone}
                    />
                  </li>
                ))}
                {list.length === 0 ? (
                  <li className="py-6 text-center text-sm text-fg-subtle">{t("empty")}</li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} duration={4000} />
    </div>
  );
}
