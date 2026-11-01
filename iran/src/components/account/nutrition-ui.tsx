import { AlertTriangle, ArrowDownRight, Check, CheckCircle2, Info, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/**
 * Macro colours: one fixed hue per macro everywhere on the page (validated for colour-blind
 * separation); every coloured mark also carries its name or number.
 */
export const MACRO = {
  proteinG: { bar: "bg-tone-sky", stroke: "stroke-tone-sky", soft: "bg-tone-sky/12 text-tone-sky" },
  carbsG: { bar: "bg-tone-amber", stroke: "stroke-tone-amber", soft: "bg-tone-amber/15 text-tone-amber" },
  fatG: {
    bar: "bg-tone-fuchsia",
    stroke: "stroke-tone-fuchsia",
    soft: "bg-tone-fuchsia/12 text-tone-fuchsia",
  },
} as const;

/** Progress ring (0…1, clipped), with whatever goes in the middle. */
export function Ring({
  ratio,
  size = 48,
  stroke = 5,
  className,
  children,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  className?: string;
  children?: ReactNode;
}) {
  const r = (100 - stroke * 2) / 2;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, ratio));
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth={stroke * 2} className="stroke-surface-2" />
        {shown > 0 ? (
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth={stroke * 2}
            strokeLinecap="round"
            strokeDasharray={`${c * shown} ${c}`}
            className={cn("transition-[stroke-dasharray] duration-700", className ?? "stroke-accent")}
          />
        ) : null}
      </svg>
      {children ? <span className="relative text-center">{children}</span> : null}
    </span>
  );
}

/** The week at a glance: each day with its calories ring; tap to open it. */
export function WeekStrip({
  days,
}: {
  days: {
    date: string;
    weekday: string;
    day: string;
    ratio: number;
    meals: number;
    selected: boolean;
    today: boolean;
    href: string;
    label: string;
  }[];
}) {
  return (
    <nav
      className="grid grid-cols-7 gap-1 rounded-3xl bg-surface p-2 shadow-[var(--shadow-soft)]"
      aria-label="week"
    >
      {days.map((d) => (
        <Link
          key={d.date}
          href={d.href}
          aria-label={d.label}
          aria-current={d.selected ? "date" : undefined}
          className={cn(
            "flex flex-col items-center gap-1 rounded-2xl py-2 transition-colors",
            d.selected ? "bg-accent-soft" : "hover:bg-surface-2",
          )}
        >
          <span className={cn("text-[11px] font-medium", d.selected ? "text-accent-text" : "text-fg-muted")}>
            {d.weekday}
          </span>
          <Ring
            ratio={d.ratio}
            size={36}
            stroke={6}
            className={d.ratio > 1.1 ? "stroke-warning" : "stroke-accent"}
          >
            <span className={cn("text-xs font-bold tabular-nums", !d.meals && "text-fg-muted")}>{d.day}</span>
          </Ring>
          <span
            className={cn("size-1 rounded-full", d.today ? "bg-accent" : "bg-transparent")}
            aria-hidden="true"
          />
        </Link>
      ))}
    </nav>
  );
}

/** Protein / carbs / fat share of the energy, as one bar with its legend. */
export function EnergySplit({
  split,
  labels,
}: {
  split: { protein: number; carbs: number; fat: number };
  labels: { protein: string; carbs: string; fat: string };
}) {
  const parts = [
    { key: "protein", pct: split.protein, cls: MACRO.proteinG.bar, label: labels.protein },
    { key: "carbs", pct: split.carbs, cls: MACRO.carbsG.bar, label: labels.carbs },
    { key: "fat", pct: split.fat, cls: MACRO.fatG.bar, label: labels.fat },
  ];
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((p) =>
          p.pct > 0 ? (
            <span key={p.key} className={cn("h-full", p.cls)} style={{ width: `${p.pct}%` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", p.cls)} aria-hidden="true" />
            <span className="text-fg-muted">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Protein, carbs, fat: a ring each, amount and goal. */
export function MacroTile({
  nutrient,
  name,
  ratio,
  value,
  goal,
}: {
  nutrient: keyof typeof MACRO;
  name: string;
  ratio: number;
  value: string;
  goal: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-3 text-center shadow-[var(--shadow-soft)] sm:p-4">
      <Ring ratio={goal ? ratio : 1} size={64} stroke={7} className={MACRO[nutrient].stroke}>
        <span className="text-sm font-bold tabular-nums">{goal ? `${Math.round(ratio * 100)}%` : value}</span>
      </Ring>
      <div>
        <p className="text-sm font-semibold">{name}</p>
        <p className="text-xs text-fg-muted tabular-nums">
          <span className="font-semibold text-fg">{value}</span>
          {goal ? ` / ${goal}` : ""}
        </p>
      </div>
    </div>
  );
}

export type Status = "good" | "high" | "low" | "ok";

/** Fibre, sugars, salt: a bar and a status in words (never colour alone). */
export function LimitTile({
  name,
  ratio,
  value,
  goal,
  status,
  statusLabel,
}: {
  name: string;
  ratio: number;
  value: string;
  goal: string | null;
  status: Status;
  statusLabel: string;
}) {
  const Icon =
    status === "good" ? Check : status === "high" ? AlertTriangle : status === "low" ? ArrowDownRight : null;
  return (
    <div className="rounded-2xl bg-surface p-3.5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {Icon ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
              status === "good" && "bg-success-soft text-success",
              status === "high" && "bg-warning-soft text-fg",
              status === "low" && "bg-surface-2 text-fg-muted",
            )}
          >
            <Icon className={cn("size-3", status === "high" && "text-warning")} aria-hidden="true" />
            {statusLabel}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-fg-muted tabular-nums">
        <span className="text-base font-bold text-fg">{value}</span>
        {goal ? ` / ${goal}` : ""}
      </p>
      <div
        className={cn("mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2", !goal && "hidden")}
        aria-hidden="true"
      >
        <div
          className={cn(
            "h-full rounded-full",
            status === "high" ? "bg-warning" : status === "good" ? "bg-success" : "bg-accent",
          )}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

const INSIGHT_ICON = { good: CheckCircle2, warn: AlertTriangle, info: Info } as const;

export function InsightList({ items }: { items: { tone: "good" | "warn" | "info"; text: string }[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i, n) => {
        const Icon = INSIGHT_ICON[i.tone];
        return (
          <li
            key={n}
            className={cn(
              "flex gap-3 rounded-2xl px-4 py-3 text-sm",
              i.tone === "good" && "bg-success-soft",
              i.tone === "warn" && "bg-warning-soft",
              i.tone === "info" && "bg-surface-2",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                i.tone === "good" && "text-success",
                i.tone === "warn" && "text-warning",
                i.tone === "info" && "text-fg-muted",
              )}
              aria-hidden="true"
            />
            <span>{i.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A dish photo, or a soft placeholder with a fork and knife. */
export function DishThumb({
  src,
  placeholder,
  size = 48,
}: {
  src: string | null;
  placeholder?: string | null;
  size?: number;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-2 bg-cover bg-center"
      style={{ width: size, height: size, backgroundImage: placeholder ? `url(${placeholder})` : undefined }}
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} loading="lazy" className="size-full object-cover" />
      ) : (
        <Utensils className="size-5 text-fg-muted" aria-hidden="true" />
      )}
    </span>
  );
}

/** Mini stacked bar of a dish's protein / carbs / fat energy (no bar when unknown). */
export function MacroMiniBar({ split }: { split: { protein: number; carbs: number; fat: number } | null }) {
  if (!split) return null;
  return (
    <span className="flex h-1.5 w-full gap-px overflow-hidden rounded-full" aria-hidden="true">
      <span className={MACRO.proteinG.bar} style={{ width: `${split.protein}%` }} />
      <span className={MACRO.carbsG.bar} style={{ width: `${split.carbs}%` }} />
      <span className={MACRO.fatG.bar} style={{ width: `${split.fat}%` }} />
    </span>
  );
}

/**
 * One metric per day (one hue), the goal as a dashed line and the average as a dotted one.
 * Bars are links (open the day) with a tooltip; the same numbers are in a hidden table.
 */
export function TrendChart({
  days,
  goal,
  average,
  goalLabel,
  averageLabel,
  caption,
}: {
  days: {
    date: string;
    label: string;
    short: string;
    value: number;
    tooltip: string;
    href: string;
    active: boolean;
  }[];
  goal: number | null;
  average: number;
  goalLabel: string;
  averageLabel: string;
  caption: string;
}) {
  const H = 160;
  const max = Math.max((goal ?? 0) * 1.15, average * 1.15, ...days.map((d) => d.value), 1);
  const y = (v: number) => H - (v / max) * H;
  const every = days.length > 14 ? 5 : 1;
  return (
    <figure>
      <div className="relative" style={{ height: H + 22 }}>
        <div className="absolute inset-x-0 border-t border-border" style={{ top: H }} aria-hidden="true" />
        <div className="absolute inset-x-0 top-0 flex items-end gap-[2px]" style={{ height: H }}>
          {days.map((d) => (
            <Link
              key={d.date}
              href={d.href}
              title={d.tooltip}
              aria-label={d.tooltip}
              className="group relative flex h-full flex-1 items-end justify-center"
            >
              <span className="absolute inset-0 rounded-md group-hover:bg-surface-2/70" aria-hidden="true" />
              <span
                className={cn(
                  "relative block w-full max-w-10 rounded-t-[4px] transition-all",
                  d.active ? "bg-accent" : "bg-accent/40 group-hover:bg-accent/60",
                )}
                style={{ height: d.value > 0 ? Math.max(3, H - y(d.value)) : 0 }}
              />
            </Link>
          ))}
        </div>
        {goal ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-fg/30"
            style={{ top: y(goal) }}
          >
            <span className="absolute end-0 -top-5 rounded-md bg-surface px-1.5 text-[11px] font-semibold text-fg-muted">
              {goalLabel}
            </span>
          </div>
        ) : null}
        {average > 0 ? (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dotted border-accent-text/70"
            style={{ top: y(average) }}
          >
            <span className="absolute start-0 -top-5 rounded-md bg-surface px-1.5 text-[11px] font-semibold text-accent-text">
              {averageLabel}
            </span>
          </div>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex gap-[2px] text-center text-[10px] text-fg-muted">
          {days.map((d, i) => (
            <span key={d.date} className={cn("flex-1 truncate", d.active && "font-bold text-fg")}>
              {i % every === 0 || d.active ? d.short : ""}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
      <table className="sr-only">
        <tbody>
          {days.map((d) => (
            <tr key={d.date}>
              <th>{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
