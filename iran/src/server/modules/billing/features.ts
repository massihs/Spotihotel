import type { PlanLimits } from "@/server/db/schema";

type T = (key: string, values?: Record<string, string | number>) => string;

/** What a plan gives, as short lines for plan cards (pricing page, billing page). */
export function planFeatureLines(limits: PlanLimits, t: T): string[] {
  const n = (v: number | null, key: string) =>
    v === null ? t(`limits.${key}Unlimited`) : t(`limits.${key}`, { count: v });
  const lines = [
    n(limits.maxTables, "tables"),
    n(limits.maxStaff, "staff"),
    n(limits.maxRestaurants, "restaurants"),
  ];
  if (limits.maxOrdersPerMonth !== null) lines.push(t("limits.orders", { count: limits.maxOrdersPerMonth }));
  else lines.push(t("limits.ordersUnlimited"));
  for (const f of limits.features) {
    if (
      [
        "online_payments",
        "invoices_email",
        "analytics_advanced",
        "custom_branding",
        "priority_support",
      ].includes(f)
    )
      lines.push(t(`features.${f}`));
  }
  return lines;
}
