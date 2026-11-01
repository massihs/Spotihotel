"use client";

import { useLocale } from "next-intl";
import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { isToman, normalizeDigits, unitLabel } from "@/lib/money";

/** "1440000" → "1,440,000" (digits only, any script). The Persian font draws them as Persian digits. */
export function groupDigits(raw: string) {
  const digits = normalizeDigits(raw)
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * A price input: thousands are grouped while typing (tomans), and the unit sits inside the field,
 * so "1440000" can no longer be misread as 144 000. The posted value keeps the separators, which
 * the server parser accepts.
 */
export function MoneyField({
  label,
  hint,
  error,
  currency,
  defaultValue,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "value" | "onChange" | "type"> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  currency: string;
  defaultValue?: string;
}) {
  const id = useId();
  const locale = useLocale();
  const toman = isToman(currency);
  const [value, setValue] = useState(() => (toman ? groupDigits(defaultValue ?? "") : (defaultValue ?? "")));
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const input = (
    <span
      className={cn(
        "flex h-11 w-full items-center rounded-xl border border-border-strong bg-surface text-[15px] text-fg shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition-[border-color,box-shadow]",
        "focus-within:border-accent focus-within:ring-4 focus-within:ring-[var(--ring)] hover:border-fg-subtle",
        error && "border-danger",
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode={toman ? "numeric" : "decimal"}
        autoComplete="off"
        dir="ltr"
        value={value}
        onChange={(e) => setValue(toman ? groupDigits(e.target.value) : e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-end font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-fg-subtle"
        {...props}
      />
      <span className="shrink-0 border-s border-border px-3 text-xs font-medium text-fg-muted">
        {unitLabel(currency, locale)}
      </span>
    </span>
  );
  if (!label) return input;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {input}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
