"use client";

import { CircleCheck } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/cn";

/** Transient, non-blocking confirmation (announced to screen readers). */
export function Toast({
  message,
  onDone,
  duration = 5000,
  className = "bottom-6",
}: {
  message: string | null;
  onDone: () => void;
  duration?: number;
  /** Vertical placement, e.g. above a sticky bottom bar. */
  className?: string;
}) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, duration);
    return () => clearTimeout(id);
  }, [message, onDone, duration]);
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 print:hidden",
        className,
      )}
    >
      {message ? (
        <p
          role="status"
          className="animate-pop-in pointer-events-auto inline-flex items-center gap-2 rounded-full bg-ink py-3 ps-3.5 pe-5 text-sm font-semibold text-ink-fg shadow-[var(--shadow-float)]"
        >
          <CircleCheck className="size-5 shrink-0 text-accent" aria-hidden="true" />
          {message}
        </p>
      ) : null}
    </div>
  );
}
