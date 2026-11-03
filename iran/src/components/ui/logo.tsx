import { cn } from "@/lib/cn";

/**
 * Spotihotel mark: a deep navy tile with a brass arched doorway and its keyhole — the room the
 * guest scans into. Wordmark in spaced capitals, "HOTEL" in brass.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <rect width="32" height="32" rx="7" fill="oklch(0.25 0.05 258)" />
      <path
        d="M10 25.5V14.5a6 6 0 0 1 12 0v11"
        fill="none"
        stroke="var(--brass)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M8 25.5h16" stroke="var(--brass)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="17.2" r="1.7" fill="var(--brass)" />
      <path d="M16 18.5v3" stroke="var(--brass)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold text-fg", className)} dir="ltr">
      <LogoMark className="size-8" />
      {withText ? (
        <span className="latin-digits text-[15px] leading-none tracking-[0.16em]">
          SPOTI<span style={{ color: "var(--brass)" }}>HOTEL</span>
        </span>
      ) : null}
    </span>
  );
}
