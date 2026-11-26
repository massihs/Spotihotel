"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Each part of the panel in its own blue, so pages tell apart at a glance: the front office in
 * azure, rooms and services in cyan, revenue and reports in periwinkle, money in indigo, the
 * restaurants in sky, settings in steel. Titles, tabs, card headers and tables take it up.
 */
const SHADE_OF: Record<string, string> = {
  "": "shade-royal",
  frontdesk: "shade-azure",
  planning: "shade-azure",
  reservation: "shade-azure",
  stays: "shade-azure",
  blocks: "shade-azure",
  guests: "shade-azure",
  rooms: "shade-cyan",
  housekeeping: "shade-cyan",
  requests: "shade-cyan",
  laundry: "shade-cyan",
  damages: "shade-cyan",
  minibar: "shade-cyan",
  internet: "shade-cyan",
  tv: "shade-cyan",
  engineering: "shade-cyan",
  wellness: "shade-cyan",
  tables: "shade-cyan",
  forecast: "shade-periwinkle",
  "hotel-reports": "shade-periwinkle",
  owner: "shade-periwinkle",
  shield: "shade-indigo",
  tips: "shade-cyan",
  support: "shade-azure",
  chain: "shade-periwinkle",
  reports: "shade-periwinkle",
  ledger: "shade-indigo",
  cashier: "shade-indigo",
  invoices: "shade-indigo",
  payments: "shade-indigo",
  billing: "shade-indigo",
  outlets: "shade-sky",
  pos: "shade-sky",
  waiter: "shade-sky",
  kitchen: "shade-sky",
  floor: "shade-sky",
  menu: "shade-sky",
  inventory: "shade-sky",
  orders: "shade-sky",
  reservations: "shade-sky",
  delivery: "shade-sky",
  customers: "shade-sky",
  settings: "shade-steel",
  team: "shade-steel",
  hotel: "shade-steel",
  security: "shade-steel",
};

export function shadeOfPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const i = parts.indexOf("dashboard");
  const seg = i >= 0 ? (parts[i + 2] ?? "") : "";
  return SHADE_OF[seg] ?? "shade-royal";
}

export function ShadedMain({ className, children }: { className?: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <main id="main" data-shaded="" className={cn(shadeOfPath(pathname), className)}>
      <span aria-hidden="true" className="section-glow" />
      {children}
    </main>
  );
}
