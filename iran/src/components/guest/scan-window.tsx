"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock, ScanLine } from "@/components/icons";

/**
 * The 30-minute ordering window opened by each QR scan: a reminder in the last 5 minutes, then a
 * banner asking to scan the code again (browsing the menu and the bill stays possible).
 */
export function ScanWindow({ end }: { end: number | null }) {
  const t = useTranslations("scanWindow");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now == null) return null;
  const left = end == null ? 0 : end - now;
  if (left > 5 * 60_000) return null;
  if (left > 0)
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
        <p className="flex items-center gap-2 rounded-full bg-warning-soft px-4 py-2 text-xs font-semibold text-warning shadow-[var(--shadow-soft)]">
          <Clock className="size-4" aria-hidden="true" />
          {t("left", { n: Math.max(1, Math.ceil(left / 60_000)) })}
        </p>
      </div>
    );
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-50 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-xl items-start gap-3 rounded-2xl bg-ink p-4 text-ink-fg shadow-[var(--shadow-card)]">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15" aria-hidden="true">
          <ScanLine className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">{t("expired")}</p>
          <p className="mt-0.5 text-xs opacity-80">{t("expiredHint")}</p>
        </div>
      </div>
    </div>
  );
}
