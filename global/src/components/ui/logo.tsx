import { cn } from "@/lib/cn";

/** Spotifood mark: a plate seen from above with a QR-like notch. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight text-fg", className)}>
      <svg viewBox="0 0 32 32" aria-hidden="true" className="size-7 shrink-0">
        <rect width="32" height="32" rx="9" className="fill-accent" />
        <circle cx="16" cy="16" r="8.5" fill="none" strokeWidth="2.5" className="stroke-accent-fg" />
        <rect x="13" y="13" width="6" height="6" rx="1.5" className="fill-accent-fg" />
      </svg>
      {withText ? <span className="text-[17px]">Spotifood</span> : null}
    </span>
  );
}
