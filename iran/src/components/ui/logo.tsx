import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Spotifood mark: a black tile with a green "spot" — the table you scan — and a small bite
 * taken out of it. Wordmark in lowercase, the second "o" echoing the spot.
 */
export function LogoMark({ className }: { className?: string }) {
  // One gradient per mark: a shared id points at the first copy, which may sit in a hidden
  // sidebar (display: none) and then paints nothing — the spot went black on phones.
  const id = `sf-spot-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="oklch(0.7 0.18 calc(var(--brand-h) + 50))" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" className="fill-ink" />
      <circle cx="16" cy="16" r="8" fill={`url(#${id})`} />
      <circle cx="22.2" cy="10.2" r="3.4" className="fill-ink" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-fg", className)}
      dir="ltr"
    >
      <LogoMark className="size-8" />
      {withText ? (
        <span className="latin-digits text-[19px] leading-none">
          spotif<span className="text-accent-text">oo</span>d
        </span>
      ) : null}
    </span>
  );
}
