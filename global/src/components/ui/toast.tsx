"use client";

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
          className="pointer-events-auto rounded-xl bg-fg px-4 py-3 text-sm font-medium text-bg shadow-2xl"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
