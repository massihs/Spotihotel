"use client";

import { useFormatter, useNow } from "next-intl";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * "il y a 3 minutes", hydration-safe: the server and the first client render show the
 * absolute time in the restaurant's zone; the relative form appears once hydrated.
 */
export function TimeAgo({ date, timeZone }: { date: Date | string; timeZone: string }) {
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const d = typeof date === "string" ? new Date(date) : date;
  const absolute = format.dateTime(d, { timeStyle: "short", timeZone });
  return (
    <time dateTime={d.toISOString()} title={absolute}>
      {hydrated ? format.relativeTime(d, now) : absolute}
    </time>
  );
}
