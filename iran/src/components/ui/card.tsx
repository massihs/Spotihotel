import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative rounded-lg border border-border bg-surface shadow-[var(--shadow-card)]",
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
  count,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** A number next to the title (items in the list). */
  count?: number;
}) {
  return (
    <div className="shade-azure shade-wash flex flex-wrap items-start justify-between gap-4 rounded-t-[inherit] border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-fg">
          {title}
          {count != null ? (
            <span className="shade-soft k-cut k-sm grid h-6 min-w-6 place-items-center px-2 text-xs font-bold tabular-nums">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Colored icon tile classes (static for Tailwind). */
export const TONE_TILE = {
  violet: "[--shade:var(--tone-violet)] shade-fill",
  sky: "[--shade:var(--tone-sky)] shade-fill",
  amber: "[--shade:var(--tone-amber)] shade-fill",
  rose: "[--shade:var(--tone-rose)] shade-fill",
  teal: "[--shade:var(--tone-teal)] shade-fill",
  orange: "[--shade:var(--tone-orange)] shade-fill",
  emerald: "[--shade:var(--tone-emerald)] shade-fill",
  fuchsia: "[--shade:var(--tone-fuchsia)] shade-fill",
  indigo: "[--shade:var(--tone-indigo)] shade-fill",
  lime: "[--shade:var(--tone-lime)] shade-fill",
  navy: "shade-navy shade-fill",
  royal: "shade-royal shade-fill",
  azure: "shade-azure shade-fill",
  cyan: "shade-cyan shade-fill",
  periwinkle: "shade-periwinkle shade-fill",
  steel: "shade-steel shade-fill",
} as const;
export type Tone = keyof typeof TONE_TILE;
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  compact = false,
  progress,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "ink" | "accent" | "gradient" | Tone;
  /** Narrow cards (five in a row): a smaller figure that keeps its unit on the same line. */
  compact?: boolean;
  /** How far along (0–100): a bar in the card's blue under the figure. */
  progress?: number;
}) {
  const solid = tone === "ink" || tone === "accent" || tone === "gradient";
  const colored = !solid && tone !== "default" ? (tone as Tone) : null;
  // Long figures (billions with separators) get a smaller size so they never overflow the card.
  const long =
    (typeof value === "string" || typeof value === "number") &&
    Math.max(
      ...String(value)
        .split(/\s+/)
        .map((w) => w.length),
    ) > 11;
  return (
    <Card
      className={cn(
        "@container overflow-hidden p-4 sm:p-5",
        // Plain figures: a line of their blue on top, a breath of it from the corner.
        !solid && "kpi",
        // No tone given: the card takes a blue of its own from its place in the grid (CSS);
        // a blue tone colours the whole card, not only its icon.
        !solid && !colored && "stat-auto",
        colored && TONE_TILE[colored].split(" ")[0],
        tone === "ink" && "border-transparent bg-ink text-ink-fg shadow-none",
        tone === "accent" && "border-transparent bg-accent text-accent-fg shadow-none",
        tone === "gradient" && "border-transparent text-white shadow-accent",
      )}
      style={tone === "gradient" ? { background: "var(--brand-gradient)" } : undefined}
    >
      {/* The star lattice in the corner: white on the solid tiles, the card's blue on the light ones. */}
      <span
        className={cn(
          "texture-khatam texture-fade-corner [--tex-size:60px]",
          solid
            ? "[--tex-color:white] [--tex-opacity:0.12]"
            : "[--tex-color:var(--shade,var(--brand-600))] [--tex-opacity:0.08]",
        )}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className={cn("text-[13px] font-semibold", solid ? "opacity-85" : "text-fg-muted")}>{label}</p>
        {icon ? (
          <span
            className={cn(
              "k-cut k-sm grid size-9 shrink-0 place-items-center [&_svg]:size-[18px]",
              solid ? "bg-current/15" : colored ? TONE_TILE[colored] : "shade-fill",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      {/* Scales down in narrow cards so a figure with its unit stays on one line. */}
      <p
        className={cn(
          "relative mt-1.5 leading-tight font-extrabold tabular-nums",
          !solid && "kpi-value",
          // Sized on the card's own width, not the window's.
          compact
            ? long
              ? "text-[clamp(0.9rem,7cqi,1.25rem)]"
              : "text-[clamp(1.05rem,9cqi,1.4rem)]"
            : long
              ? "text-[clamp(0.95rem,8cqi,1.6rem)]"
              : "text-[clamp(1.2rem,11cqi,1.85rem)]",
        )}
      >
        {value}
      </p>
      {progress != null ? (
        <div
          className={cn(
            "relative mt-3 h-1.5 overflow-hidden rounded-full",
            solid ? "bg-current/15" : "bg-surface-2",
          )}
        >
          <span
            className={cn("block h-full rounded-full", solid ? "bg-current opacity-80" : "shade-bar")}
            style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <p className={cn("relative mt-1.5 text-xs", solid ? "opacity-75" : "text-fg-subtle")}>{hint}</p>
      ) : null}
    </Card>
  );
}
