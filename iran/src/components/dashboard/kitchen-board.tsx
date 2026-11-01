"use client";

import { useTranslations } from "next-intl";
import { Maximize2, Moon, Printer, Settings2, Sun } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { usePref, writePref } from "@/components/ui/use-pref";
import { LiveIndicator, LiveRefresh, useLiveEvent } from "@/components/realtime/live";
import { StationManager, STATION_TONE, type StationView } from "@/components/kitchen/stations";
import { AcceptAllButton } from "./accept-all-button";
import { OrderCard, type OrderCardData } from "./order-card";

const COLUMNS = ["received", "accepted", "preparing", "ready", "served"] as const;

const DOT: Record<(typeof COLUMNS)[number], string> = {
  received: "bg-accent",
  accepted: "bg-warning",
  preparing: "bg-warning",
  ready: "bg-success",
  served: "bg-fg-subtle",
};

/** Per-device preferences: which station this screen shows, and whether it auto-prints tickets. */
export function KitchenBoard({
  restaurantId,
  orders,
  timeZone,
  canUpdate,
  canCancel,
  stations,
  categories,
  canManage,
  acceptAtTill,
  defaultStation,
}: {
  /** Guest orders reach this screen only once the till accepted them. */
  acceptAtTill: boolean;
  /** Station of the bar / kitchen member signed in (their screen opens on it). */
  defaultStation: string | null;
  restaurantId: string;
  orders: OrderCardData[];
  timeZone: string;
  canUpdate: boolean;
  canCancel: boolean;
  stations: StationView[];
  categories: { id: string; name: string; stationId: string | null }[];
  canManage: boolean;
}) {
  const t = useTranslations("kitchen");
  const stationKey = `sf-kitchen-station-${restaurantId}`;
  const printKey = `sf-kitchen-autoprint-${restaurantId}`;
  const stored = usePref(stationKey, defaultStation ?? "all");
  const station = stored === "all" || stations.some((s) => s.id === stored) ? stored : "all";
  const autoPrint = usePref(printKey, "off") === "on";
  const darkKey = `sf-kitchen-dark-${restaurantId}`;
  const dark = usePref(darkKey, "off") === "on";
  const board = useRef<HTMLDivElement>(null);
  const [managing, setManaging] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  const columns = acceptAtTill ? COLUMNS.filter((c) => c !== "received") : COLUMNS;
  const visible = orders
    .filter((o) => !acceptAtTill || (o.status !== "received" && o.status !== "pending_payment"))
    .map((o) => (station === "all" ? o : { ...o, items: o.items.filter((i) => i.stationId === station) }))
    .filter((o) => o.items.length > 0);

  const ticketUrl = (orderId: string, auto = false) =>
    `/print/kitchen/${restaurantId}/${orderId}?${station === "all" ? "" : `station=${station}&`}${auto ? "auto=1" : ""}`;

  // Order sent to the kitchen + auto print on this screen: print its ticket in a hidden frame.
  useLiveEvent((type, data) => {
    if (type !== "order.accepted" || !autoPrint || !data.orderId || !frame.current) return;
    frame.current.src = ticketUrl(String(data.orderId), true);
  });

  const byStatus = (s: (typeof COLUMNS)[number]) =>
    visible.filter((o) =>
      s === "received" ? o.status === "received" || o.status === "pending_payment" : o.status === s,
    );

  return (
    <div
      ref={board}
      className={cn(
        "flex h-[calc(100dvh-8rem)] min-h-[32rem] flex-col rounded-3xl transition-colors [&:fullscreen]:h-dvh [&:fullscreen]:rounded-none [&:fullscreen]:p-4",
        dark && "kds-dark -mx-2 p-3 sm:-mx-4 sm:p-4",
      )}
    >
      <LiveRefresh types={["order.created", "order.accepted", "order.updated"]} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("title")}</h1>
          <LiveIndicator />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={autoPrint}
            onClick={() => writePref(printKey, autoPrint ? "off" : "on")}
            className={cn(autoPrint && "ring-2 ring-accent")}
          >
            <Printer className="size-4" aria-hidden="true" />
            {autoPrint ? t("autoPrintOn") : t("autoPrintOff")}
          </Button>
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setManaging(true)}>
              <Settings2 className="size-4" aria-hidden="true" />
              {t("stations.manage")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={dark}
            onClick={() => writePref(darkKey, dark ? "off" : "on")}
            className={cn(dark && "ring-2 ring-accent")}
          >
            {dark ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
            {dark ? t("lightMode") : t("darkMode")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="max-sm:hidden"
            onClick={() => (board.current ?? document.documentElement).requestFullscreen?.().catch(() => {})}
          >
            <Maximize2 className="size-4" aria-hidden="true" />
            {t("fullscreen")}
          </Button>
        </div>
      </div>
      {stations.length ? (
        <div className="-mx-4 mb-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {[{ id: "all", name: t("stations.all"), color: "" } as StationView, ...stations].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => writePref(stationKey, s.id)}
              aria-pressed={station === s.id}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
                station === s.id ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              {s.id !== "all" ? (
                <span
                  className={cn("size-2.5 rounded-full", STATION_TONE[s.color]?.dot)}
                  aria-hidden="true"
                />
              ) : null}
              {s.name}
              <span className="text-xs tabular-nums opacity-70">
                {s.id === "all"
                  ? orders.filter((o) => o.status !== "served").length
                  : orders.filter((o) => o.status !== "served" && o.items.some((i) => i.stationId === s.id))
                      .length}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="-mx-4 grid min-h-0 flex-1 snap-x snap-mandatory scroll-px-4 auto-cols-[min(20rem,85vw)] grid-flow-col gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:auto-cols-[minmax(17rem,1fr)] sm:px-0">
        {columns.map((col) => {
          const list = byStatus(col);
          return (
            <section
              key={col}
              aria-labelledby={`col-${col}`}
              className={cn(
                "flex min-h-0 snap-start flex-col rounded-2xl bg-surface-2/70 p-2",
                col === "served" && "opacity-75",
              )}
            >
              <h2
                id={`col-${col}`}
                className="flex items-center justify-between px-2.5 py-2 text-sm font-semibold"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", DOT[col])} aria-hidden="true" />
                  {t(`columns.${col}`)}
                </span>
                <span className="flex items-center gap-2">
                  {canUpdate && (col === "received" || col === "accepted") && list.length > 1 ? (
                    <AcceptAllButton
                      restaurantId={restaurantId}
                      from={col}
                      orderIds={list.filter((o) => o.status === col).map((o) => o.id)}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-bold tabular-nums",
                      list.length ? "bg-accent text-accent-fg" : "bg-surface text-fg-subtle",
                    )}
                  >
                    {list.length}
                  </span>
                </span>
              </h2>
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-0.5">
                {list.map((o) => (
                  <li key={o.id} className="relative">
                    {o.channel && o.channel !== "dine_in" ? (
                      <span
                        className={cn(
                          "absolute start-3 -top-1 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white",
                          o.channel === "delivery" ? "bg-tone-sky" : "bg-tone-amber",
                        )}
                      >
                        {t(`channel.${o.channel}`)}
                      </span>
                    ) : null}
                    <OrderCard
                      restaurantId={restaurantId}
                      order={o}
                      canUpdate={canUpdate}
                      canCancel={canCancel}
                      timeZone={timeZone}
                      compact
                    />
                    <a
                      href={ticketUrl(o.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="ms-auto mt-1 flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs text-fg-muted hover:bg-surface hover:text-fg"
                      aria-label={t("printTicket")}
                      title={t("printTicket")}
                    >
                      <Printer className="size-3.5" aria-hidden="true" />
                      {t("printTicket")}
                    </a>
                  </li>
                ))}
                {list.length === 0 ? (
                  <li className="mx-1 rounded-2xl border-2 border-dashed border-border py-8 text-center text-sm text-fg-subtle">
                    {t("empty")}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
      <iframe ref={frame} title="print" className="hidden" aria-hidden="true" />
      {managing ? (
        <StationManager
          restaurantId={restaurantId}
          stations={stations}
          categories={categories}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </div>
  );
}
