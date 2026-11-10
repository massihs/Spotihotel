import { Card } from "@/components/ui/card";

/**
 * A plain bar chart (no library, prints as is): one bar per day, an optional inner part (room
 * revenue inside total revenue), the value on hover and the highest value marked.
 */
export function BarChart({
  title,
  points,
  format,
  max,
  legend,
  empty,
}: {
  title: string;
  points: { label: string; value: number; part?: number }[];
  format: (v: number) => string;
  max?: number;
  /** Two labels when bars have a part: [part, rest]. */
  legend?: [string, string];
  empty: string;
}) {
  const top = max ?? Math.max(1, ...points.map((p) => p.value));
  const best = points.reduce((b, p, i) => (p.value > (points[b]?.value ?? -1) ? i : b), 0);
  const avg = points.length ? points.reduce((s, p) => s + p.value, 0) / points.length : 0;
  const every = Math.max(1, Math.ceil(points.length / 12));
  return (
    <Card className="p-4 print:break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {points.length ? (
          <p className="text-xs text-fg-muted">
            Ø <b className="tabular-nums">{format(Math.round(avg))}</b> · max{" "}
            <b className="tabular-nums">{format(points[best]!.value)}</b>
          </p>
        ) : null}
      </div>
      {legend ? (
        <div className="mb-2 flex gap-4 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-brand-700" />
            {legend[0]}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm bg-[var(--brass)]" />
            {legend[1]}
          </span>
        </div>
      ) : null}
      {points.length ? (
        <div dir="ltr">
          <div className="flex h-48 items-end gap-[2px] border-b border-border">
            {points.map((p, i) => {
              const h = Math.max(1, (p.value / top) * 100);
              const part = p.part !== undefined && p.value ? (p.part / p.value) * 100 : 100;
              return (
                <div
                  key={i}
                  title={`${p.label}: ${format(p.value)}`}
                  className="group relative flex h-full min-w-0 flex-1 items-end"
                >
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${h}%` }}
                  >
                    <div className="w-full bg-brand-700" style={{ height: `${part}%` }} />
                    <div className="w-full flex-1 bg-[var(--brass)]" />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[2px] text-[10px] text-fg-subtle">
            {points.map((p, i) => (
              <span key={i} className="min-w-0 flex-1 truncate text-center">
                {i % every === 0 ? p.label : ""}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-fg-muted">{empty}</p>
      )}
    </Card>
  );
}
