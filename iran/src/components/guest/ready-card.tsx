"use client";

import { BedDouble, CheckCircle2, Coffee, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

/** The room's preparation on arrival day, refreshed every 20 s, and the café offer meanwhile. */
export function ReadyCard({
  state,
  room,
  offerPct,
  cafe,
  number,
}: {
  state: "ready" | "cleaning" | "assigning";
  room: string | null;
  offerPct: number | null;
  cafe: string | null;
  number: number;
}) {
  const t = useTranslations("ready");
  const router = useRouter();
  useEffect(() => {
    if (state === "ready") return;
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [state, router]);
  const steps = ["assigning", "cleaning", "ready"] as const;
  const at = steps.indexOf(state);
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden rounded-3xl border p-5 shadow-[var(--shadow-soft)]",
        state === "ready" ? "border-success/30 bg-success-soft/50" : "border-border bg-surface",
      )}
      aria-live="polite"
    >
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "grid size-14 shrink-0 place-items-center rounded-2xl",
            state === "ready" ? "bg-success text-white" : "shade-fill",
          )}
        >
          {state === "ready" ? (
            <CheckCircle2 className="size-7" aria-hidden="true" />
          ) : state === "cleaning" ? (
            <Sparkles className="size-7 animate-pulse" aria-hidden="true" />
          ) : (
            <BedDouble className="size-7" aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold">{t(`state.${state}`, { room: room ?? "" })}</p>
          <p className="mt-0.5 text-sm text-fg-muted">{t(`hint.${state}`)}</p>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-3 gap-1.5">
        {steps.map((s, i) => (
          <li key={s} className="text-center">
            <span
              className={cn(
                "block h-1.5 rounded-full",
                i <= at ? (state === "ready" ? "bg-success" : "shade-bar") : "bg-surface-2",
              )}
            />
            <span
              className={cn("mt-1.5 block text-[11px]", i <= at ? "font-semibold text-fg" : "text-fg-subtle")}
            >
              {t(`step.${s}`)}
            </span>
          </li>
        ))}
      </ol>
      {offerPct ? (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[var(--sidebar)] p-4 text-[var(--sidebar-fg)]">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[image:var(--brass-gradient)] text-[color:var(--brass-ink)]">
            <Coffee className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t("offer", { pct: offerPct, cafe: cafe ?? t("cafe") })}</p>
            <p className="mt-0.5 text-xs opacity-80">{t("offerHint", { number })}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
