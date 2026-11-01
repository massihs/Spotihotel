"use client";

import { X } from "lucide-react";
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
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" aria-label="×" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-sheet-up relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 sm:max-w-lg sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-lg font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-surface-2"
            aria-label="×"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useRun() {
  const tErr = useTranslations("errorCodes");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null | undefined>, done?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok) setError(res.error && tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
      else done?.();
    });
  return { pending, error, run };
}
