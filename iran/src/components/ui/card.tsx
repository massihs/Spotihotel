import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Colored icon tile classes (static for Tailwind). */
export const TONE_TILE = {
  violet: "bg-tone-violet/12 text-tone-violet",
  sky: "bg-tone-sky/12 text-tone-sky",
  amber: "bg-tone-amber/18 text-tone-amber",
  rose: "bg-tone-rose/12 text-tone-rose",
  teal: "bg-tone-teal/12 text-tone-teal",
  orange: "bg-tone-orange/12 text-tone-orange",
  emerald: "bg-tone-emerald/12 text-tone-emerald",
  fuchsia: "bg-tone-fuchsia/12 text-tone-fuchsia",
  indigo: "bg-tone-indigo/14 text-tone-indigo",
  lime: "bg-tone-lime/15 text-tone-lime",
} as const;
export type Tone = keyof typeof TONE_TILE;
const TONE_GLOW: Record<Tone, string> = {
  violet: "bg-tone-violet",
  sky: "bg-tone-sky",
  amber: "bg-tone-amber",
  rose: "bg-tone-rose",
  teal: "bg-tone-teal",
  orange: "bg-tone-orange",
  emerald: "bg-tone-emerald",
  fuchsia: "bg-tone-fuchsia",
  indigo: "bg-tone-indigo",
  lime: "bg-tone-lime",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "ink" | "accent" | "gradient" | Tone;
}) {
  const solid = tone === "ink" || tone === "accent" || tone === "gradient";
  const colored = !solid && tone !== "default" ? (tone as Tone) : null;
  return (
    <Card
      className={cn(
        "overflow-hidden p-5",
        tone === "ink" && "border-transparent bg-ink text-ink-fg shadow-none",
        tone === "accent" && "border-transparent bg-accent text-accent-fg shadow-none",
        tone === "gradient" && "border-transparent text-white shadow-accent",
      )}
      style={tone === "gradient" ? { background: "var(--brand-gradient)" } : undefined}
    >
      {colored ? (
        <span
          className={cn(
            "pointer-events-none absolute -end-8 -top-8 size-24 rounded-full opacity-[0.08]",
            TONE_GLOW[colored],
          )}
          aria-hidden="true"
        />
      ) : null}
      <div className="relative flex items-start justify-between gap-3">
        <p className={cn("text-sm font-medium", solid ? "opacity-80" : "text-fg-muted")}>{label}</p>
        {icon ? (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
              solid ? "bg-white/18" : colored ? TONE_TILE[colored] : "bg-accent-soft text-accent-text",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="relative mt-2 text-[28px] leading-tight font-bold tracking-tight tabular-nums">{value}</p>
      {hint ? (
        <p className={cn("relative mt-1 text-xs", solid ? "opacity-75" : "text-fg-subtle")}>{hint}</p>
      ) : null}
    </Card>
  );
}
