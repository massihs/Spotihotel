"use client";

import { X } from "@/components/icons";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { normalizeDigits } from "@/lib/money";

export const num = (v: string) => {
  const n = Number(normalizeDigits(v).replace(/[,٬]/g, "").replace("٫", "."));
  return Number.isFinite(n) ? n : NaN;
};
export const field = "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-[15px]";

export function Sheet({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** A larger panel for multi-part forms (guided check-in…). */
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="×"
        className="animate-fade-in absolute inset-0 bg-[oklch(0.18_0.04_262/0.45)] backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        className={`animate-sheet-up relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-surface shadow-[var(--shadow-float)] ring-1 ring-border sm:rounded-3xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
      >
        {/* The header: a band of the section's blue over the lattice, kept in view while scrolling. */}
        <div className="shade-wash sticky top-0 isolate z-10 overflow-hidden border-b border-border bg-surface px-5 pt-4 pb-3.5 sm:px-6">
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:var(--shade,var(--accent))] [--tex-opacity:0.12] [--tex-size:44px]"
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span aria-hidden="true" className="ornament mb-1.5 [--ornament-width:2rem]" />
              <p className="truncate text-lg font-bold">{title}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface/90 ring-1 ring-border transition-colors hover:bg-surface-2"
              aria-label="×"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className={wide ? "p-5 sm:p-6" : "p-5"}>{children}</div>
      </div>
    </div>
  );
}

export function useRun() {
  const tErr = useTranslations("errorCodes");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (
    fn: () => Promise<
      { ok: boolean; error?: string; values?: Record<string, string | number> } | null | undefined
    >,
    done?: () => void,
  ) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok)
        setError(res.error && tErr.has(res.error) ? tErr(res.error, res.values) : tErr("internal"));
      else done?.();
    });
  return { pending, error, run };
}
