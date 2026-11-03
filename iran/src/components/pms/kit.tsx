"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";

/** "2026-11-03" → "3 nov." / "۱۲ آبان" (the UI language picks the calendar). */
export function useDay() {
  const locale = useLocale();
  return (day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
    new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

export function useTime(timeZone: string) {
  const locale = useLocale();
  return (iso: string | Date) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

const STATUS_TONE: Record<string, string> = {
  tentative: "bg-warning-soft text-fg",
  confirmed: "bg-info-soft text-info",
  in_house: "bg-success-soft text-success",
  checked_out: "bg-surface-3 text-fg-muted",
  cancelled: "bg-danger-soft text-danger",
  no_show: "bg-danger-soft text-danger",
  booked: "bg-info-soft text-info",
  done: "bg-success-soft text-success",
  open: "bg-success-soft text-success",
  closed: "bg-surface-3 text-fg-muted",
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const t = useTranslations("pms.status");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        STATUS_TONE[status] ?? "bg-surface-2 text-fg",
        className,
      )}
    >
      {t.has(status) ? t(status) : status}
    </span>
  );
}

type Result = { ok: boolean; error?: string } | null | undefined;

/** A button running a server action, with optional confirmation and inline error. */
export function RunButton({
  run,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
  onDone,
}: {
  run: () => Promise<Result>;
  children: ReactNode;
  confirm?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const r = useRun();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || r.pending}
        aria-busy={r.pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          r.run(run, onDone);
        }}
      >
        {children}
      </Button>
      {r.error ? (
        <span role="alert" className="text-xs text-danger">
          {r.error}
        </span>
      ) : null}
    </span>
  );
}

/** A button opening a sheet (dialog) with a form inside. */
export function SheetButton({
  label,
  title,
  children,
  variant = "secondary",
  size = "sm",
  className,
}: {
  label: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </Sheet>
      ) : null}
    </>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
      {error}
    </p>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block text-sm font-semibold">
      {children}
      {hint ? <span className="ms-1 font-normal text-fg-muted">{hint}</span> : null}
    </span>
  );
}

export const inputCls =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-[15px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

/** Tabs as links (?tab=…), rendered by the server page. */
export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-border bg-surface", className)}>
      <table className="w-full min-w-[640px] text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-fg-muted [&_th]:uppercase">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">
      {children}
    </p>
  );
}
