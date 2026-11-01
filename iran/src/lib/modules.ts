/** Optional dashboard modules a restaurant can switch off to keep its panel simple. */
export const MODULES = [
  "pos",
  "kitchen",
  "floor",
  "delivery",
  "reservations",
  "inventory",
  "customers",
  "invoices",
  "branches",
  "music",
] as const;
export type ModuleKey = (typeof MODULES)[number];

export function isModule(v: string): v is ModuleKey {
  return (MODULES as readonly string[]).includes(v);
}
