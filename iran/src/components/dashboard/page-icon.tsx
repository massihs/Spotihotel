"use client";

import {
  BedDouble,
  Bike,
  BookOpenCheck,
  Boxes,
  Building2,
  Calculator,
  CalendarClock,
  CalendarRange,
  ChartColumn,
  ChartSpline,
  ChefHat,
  Coins,
  ConciergeBell,
  Contact,
  CreditCard,
  Eye,
  FileBarChart,
  FileText,
  Flower2,
  HandCoins,
  Headset,
  HeartHandshake,
  Hotel,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Music,
  Network,
  NotebookPen,
  NotebookTabs,
  QrCode,
  ReceiptText,
  Settings,
  Shirt,
  ShieldAlert,
  SprayCan,
  Star,
  Store,
  Tv,
  Users,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";

/** The icon of each part of the panel, the same as in the sidebar. */
const ICON_OF: Record<string, LucideIcon> = {
  "": LayoutDashboard,
  frontdesk: KeyRound,
  chain: Building2,
  planning: CalendarRange,
  reservation: BedDouble,
  stays: NotebookTabs,
  blocks: UsersRound,
  forecast: ChartSpline,
  tips: HandCoins,
  shield: Coins,
  owner: Eye,
  "hotel-reports": FileBarChart,
  guests: Contact,
  wellness: Flower2,
  requests: ConciergeBell,
  rooms: BedDouble,
  housekeeping: SprayCan,
  laundry: Shirt,
  damages: ShieldAlert,
  minibar: Wine,
  internet: Wifi,
  tv: Tv,
  engineering: Wrench,
  outlets: Store,
  pos: Calculator,
  waiter: NotebookPen,
  orders: ReceiptText,
  kitchen: ChefHat,
  floor: LayoutGrid,
  callcenter: Headset,
  delivery: Bike,
  reservations: CalendarClock,
  menu: UtensilsCrossed,
  inventory: Boxes,
  tables: QrCode,
  customers: HeartHandshake,
  feedback: Star,
  music: Music,
  cashier: Landmark,
  ledger: BookOpenCheck,
  reports: ChartColumn,
  payments: Wallet,
  invoices: FileText,
  hotel: Hotel,
  branches: Network,
  team: Users,
  billing: CreditCard,
  settings: Settings,
};

/** The current page's section icon in a tile of its blue (nothing outside the hotel panel). */
export function PageIcon() {
  const parts = usePathname().split("/").filter(Boolean);
  const i = parts.indexOf("dashboard");
  if (i < 0) return null;
  const Icon = ICON_OF[parts[i + 2] ?? ""];
  if (!Icon) return null;
  return (
    <span
      className="shade-fill grid size-11 shrink-0 place-items-center rounded-2xl sm:size-12 [&_svg]:size-5 sm:[&_svg]:size-[22px]"
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
