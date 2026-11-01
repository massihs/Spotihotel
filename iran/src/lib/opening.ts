export type OpeningHours = Record<string, { open: string; close: string }[]> | null;
export type OpenState =
  { status: "open"; until: string } | { status: "closed"; from: string | null } | { status: "unknown" };

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Open / closed right now in the restaurant's time zone; ranges may run past midnight. */
export function openState(hours: OpeningHours, timeZone: string, at: Date): OpenState {
  if (!hours) return { status: "unknown" };
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const dow = DAYS.findIndex((d) => d === String(parts.weekday).slice(0, 3).toLowerCase());
  if (dow < 0) return { status: "unknown" };
  const now = mins(`${parts.hour}:${parts.minute}`);
  const today = hours[DAYS[dow]!] ?? [];
  const yesterday = hours[DAYS[(dow + 6) % 7]!] ?? [];
  // Last night's range still running after midnight.
  for (const r of yesterday)
    if (mins(r.close) < mins(r.open) && now < mins(r.close)) return { status: "open", until: r.close };
  for (const r of today) {
    const o = mins(r.open);
    const c = mins(r.close);
    if (c <= o ? now >= o : now >= o && now < c) return { status: "open", until: r.close };
  }
  const later = today.filter((r) => mins(r.open) > now).sort((a, b) => mins(a.open) - mins(b.open))[0];
  return { status: "closed", from: later?.open ?? null };
}
