import { cn } from "@/lib/cn";
import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[15px] text-fg",
        "shadow-[0_1px_2px_hsl(var(--shadow-color)/0.04)] transition-[border-color,box-shadow] placeholder:text-fg-subtle",
        "hover:border-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
        "aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

/** Label + input + hint/error, correctly wired for screen readers. */
export function Field({
  label,
  hint,
  error,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...inputProps} />
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
