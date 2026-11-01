"use client";

import { CheckCheck, Flame } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { acceptAllOrdersAction } from "@/app/[locale]/dashboard/[restaurantId]/orders/actions";
import { cn } from "@/lib/cn";

/**
 * "Accept all" (new orders → kitchen) or "Start all" (accepted → preparing), for the orders
 * shown. Two taps: the first asks for confirmation, so a stray tap does nothing.
 */
export function AcceptAllButton({
  restaurantId,
  orderIds,
  from = "received",
  className,
  size = "sm",
}: {
  restaurantId: string;
  orderIds: string[];
  from?: "received" | "accepted";
  className?: string;
  size?: "sm" | "md";
}) {
  const t = useTranslations("kitchen");
  const [pending, start] = useTransition();
  const [armed, setArmed] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  if (!orderIds.length) return null;
  const n = orderIds.length;
  const Icon = from === "received" ? CheckCheck : Flame;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
          return;
        }
        start(async () => {
          const res = await acceptAllOrdersAction(restaurantId, orderIds, from);
          setArmed(false);
          if (res?.ok) setResult(res.data?.done ?? 0);
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-bold whitespace-nowrap transition-colors disabled:opacity-60",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        armed ? "bg-danger text-white" : "bg-accent text-accent-fg hover:bg-accent-hover",
        className,
      )}
      aria-live="polite"
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden="true" />
      {pending
        ? "…"
        : armed
          ? t("bulk.confirm", { n })
          : result != null && !n
            ? t("bulk.done", { n: result })
            : from === "received"
              ? t("bulk.acceptAll", { n })
              : t("bulk.startAll", { n })}
    </button>
  );
}
