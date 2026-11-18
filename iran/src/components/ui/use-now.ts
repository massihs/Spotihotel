"use client";

import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `every` ms. `null` on the server and while hydrating, so the
 * first render in the browser always matches the server's (no hydration error when a minute turns
 * in between): time-dependent bits ("12 min ago", a late badge) appear once it is known.
 */
export function useNow(every = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, every);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [every]);
  return now;
}
