/** A small column chart of daily values (last N days), labels every few days. */
export function DayBars({
  data,
  label,
  locale,
}: {
  data: { day: string; value: number }[];
  label: (v: number) => string;
  locale: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div>
      <div
        className="flex h-40 items-end gap-1"
        role="img"
        aria-label={data.map((d) => `${d.day}: ${label(d.value)}`).join(", ")}
      >
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent"
              style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }}
            />
            <span className="pointer-events-none absolute start-1/2 -top-7 z-10 hidden -translate-x-1/2 rounded-md bg-fg px-2 py-0.5 text-xs whitespace-nowrap text-bg group-hover:block">
              {label(d.value)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-fg-subtle">
        <span>{data[0] ? fmt.format(new Date(data[0].day)) : ""}</span>
        <span>{data.at(-1) ? fmt.format(new Date(data.at(-1)!.day)) : ""}</span>
      </div>
    </div>
  );
}

/** Zero-filled last `days` days ending today (YYYY-MM-DD, Tehran). */
export function lastDays<T extends { day: string }>(
  rows: T[],
  days: number,
  pick: (r: T) => number,
  now = new Date(),
) {
  const key = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
  const by = new Map(rows.map((r) => [r.day, pick(r)]));
  return Array.from({ length: days }, (_, i) => {
    const day = key(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    return { day, value: by.get(day) ?? 0 };
  });
}
