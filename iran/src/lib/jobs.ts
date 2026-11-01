/** Jobs in a restaurant team. Each sets a permission preset and the screen the member lands on. */
export const JOBS = ["manager", "cashier", "waiter", "bar", "kitchen"] as const;
export type Job = (typeof JOBS)[number];
export const isJob = (v: unknown): v is Job =>
  typeof v === "string" && (JOBS as readonly string[]).includes(v);
/** Jobs that work at a kitchen station (their screen shows only that station's items). */
export const STATION_JOBS: readonly Job[] = ["bar", "kitchen"];
