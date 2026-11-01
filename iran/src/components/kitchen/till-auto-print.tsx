"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useLiveEvent } from "@/components/realtime/live";
import { cn } from "@/lib/cn";

const EVENT = "sf-till-print-pref";
const read = (key: string) => {
  try {
    return localStorage.getItem(key) === "on";
  } catch {
    return false;
  }
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

/**
 * Till screen: when an order is accepted (and sent to the kitchen), print the till copy on this
 * device's printer. Silent with Chrome started with --kiosk-printing; per device setting.
 */
export function TillAutoPrint({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("kitchen");
  const key = `sf-till-autoprint-${restaurantId}`;
  const on = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const frame = useRef<HTMLIFrameElement>(null);
  useLiveEvent((type, data) => {
    if (type !== "order.accepted" || !on || !data.orderId || !frame.current) return;
    frame.current.src = `/print/kitchen/${restaurantId}/${String(data.orderId)}?copy=cashier&auto=1`;
  });
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-pressed={on}
        onClick={() => {
          try {
            localStorage.setItem(key, on ? "off" : "on");
          } catch {
            /* ignore */
          }
          window.dispatchEvent(new Event(EVENT));
        }}
        className={cn(on && "ring-2 ring-accent")}
      >
        <Printer className="size-4" aria-hidden="true" />
        {on ? t("tillPrintOn") : t("tillPrintOff")}
      </Button>
      <iframe ref={frame} title="print" className="hidden" aria-hidden="true" />
    </>
  );
}
