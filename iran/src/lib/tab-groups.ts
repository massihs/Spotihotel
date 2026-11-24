/**
 * Pages with many tabs show them in two levels: a few categories, then the tabs of the open
 * category (the same groups head the page's sub-menu in the sidebar). Labels: `tabGroups.{page}.{key}`.
 */

export type TabGroup = { key: string; icon: TabGroupIcon; tabs: readonly string[] };
export type TabGroupIcon =
  | "desk"
  | "chart"
  | "wallet"
  | "settings"
  | "users"
  | "bed"
  | "tag"
  | "sparkles"
  | "clipboard"
  | "wrench"
  | "building";

export const TAB_GROUPS = {
  cashier: [
    { key: "desk", icon: "desk", tabs: ["handover", "move", "transfer", "search"] },
    {
      key: "reports",
      icon: "chart",
      tabs: ["currency", "daily", "transactions", "pending", "summary", "handoverReport"],
    },
    { key: "settings", icon: "settings", tabs: ["settings"] },
  ],
  hotelReports: [
    {
      key: "management",
      icon: "chart",
      tabs: ["manager", "comprehensive", "occupancy", "dailySales", "charts"],
    },
    {
      key: "accounts",
      icon: "building",
      tabs: ["accounts", "accountPerformance", "plans", "segments", "bank", "invoices"],
    },
    {
      key: "guests",
      icon: "users",
      tabs: ["expected", "individual", "pax", "openFolios", "debtors", "roomCharge"],
    },
  ],
  housekeeping: [
    { key: "today", icon: "sparkles", tabs: ["base", "plan", "mine", "rack"] },
    { key: "work", icon: "wrench", tabs: ["log", "operations", "maintenance"] },
    { key: "analysis", icon: "chart", tabs: ["reports", "settings"] },
  ],
  hotel: [
    { key: "rooms", icon: "bed", tabs: ["types", "rooms"] },
    { key: "prices", icon: "tag", tabs: ["plans", "rates", "pricing"] },
    { key: "services", icon: "sparkles", tabs: ["services", "minibar"] },
    { key: "admin", icon: "settings", tabs: ["accounts", "settings"] },
  ],
} as const satisfies Record<string, readonly TabGroup[]>;

export type TabGroupPage = keyof typeof TAB_GROUPS;

/** The groups of a page keeping only the tabs this person may open (empty groups dropped). */
export function groupsFor(page: TabGroupPage, allowed: readonly string[]) {
  return TAB_GROUPS[page]
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => allowed.includes(t)) }))
    .filter((g) => g.tabs.length > 0);
}

/** The group a tab belongs to (`page` groups), the first one if none. */
export function groupOf(page: TabGroupPage, allowed: readonly string[], tab: string) {
  const groups = groupsFor(page, allowed);
  return groups.find((g) => (g.tabs as readonly string[]).includes(tab)) ?? groups[0];
}

/** Every tab of a page, in the order of its categories. */
export function allTabs(page: TabGroupPage): string[] {
  return TAB_GROUPS[page].flatMap((g) => [...g.tabs]);
}
