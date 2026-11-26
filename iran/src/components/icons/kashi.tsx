/**
 * Spotihotel's own icons ("Kâshi"): drawn on a 45° grid like the octagonal tiles of Persian
 * tilework — cut corners instead of rounded ones, diamonds and octagons instead of circles, the
 * eight-point star (khatam) for settings. Same names and props as the library they replace, so
 * every `import { X } from "@/components/icons"` keeps working; icons not drawn yet come from the
 * library, restyled in globals.css (square ends, mitred corners).
 */
import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

function kashi(name: string, paths: string[]): LucideIcon {
  const Icon = forwardRef<SVGSVGElement, LucideProps>(function Icon(
    { size = 24, strokeWidth, absoluteStrokeWidth: _a, className, color = "currentColor", children, ...rest },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth ?? 1.75}
        strokeLinecap="square"
        strokeLinejoin="miter"
        className={["lucide kashi", `lucide-${name}`, className].filter(Boolean).join(" ")}
        {...rest}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
        {children}
      </svg>
    );
  });
  Icon.displayName = name;
  return Icon as LucideIcon;
}

export const Plus = kashi("plus", ["M12 5v14", "M5 12h14"]);
export const Minus = kashi("minus", ["M5 12h14"]);
export const Check = kashi("check", ["M5 12.5l4.5 4.5L19 7.5"]);
export const X = kashi("x", ["M6 6l12 12", "M18 6 6 18"]);
export const CheckCheck = kashi("check-check", ["M2.5 12.5 6 16l8-8.5", "M11.5 15.5l.5.5 8-8.5"]);
export const ChevronDown = kashi("chevron-down", ["M7 10l5 5 5-5"]);
export const ChevronRight = kashi("chevron-right", ["M10 7l5 5-5 5"]);
export const ChevronLeft = kashi("chevron-left", ["M14 7l-5 5 5 5"]);
export const ChevronsUpDown = kashi("chevrons-up-down", ["M8 9l4-4 4 4", "M8 15l4 4 4-4"]);
export const ArrowRight = kashi("arrow-right", ["M4 12h15", "M14 7l5 5-5 5"]);
export const ArrowLeft = kashi("arrow-left", ["M20 12H5", "M10 7l-5 5 5 5"]);
export const ArrowUpRight = kashi("arrow-up-right", ["M7 17 17 7", "M9 7h8v8"]);
export const ArrowLeftRight = kashi("arrow-left-right", [
  "M4 8h16",
  "M16 4l4 4-4 4",
  "M20 16H4",
  "M8 12l-4 4 4 4",
]);
export const ExternalLink = kashi("external-link", [
  "M14 4h6v6",
  "M20 4l-9 9",
  "M18 14v4l-2 2H6l-2-2V8l2-2h4",
]);
export const Trash2 = kashi("trash-2", [
  "M4 6.5h16",
  "M9 6.5V4h6v2.5",
  "M6 6.5l1 13.5h10l1-13.5",
  "M10 10.5v6M14 10.5v6",
]);
export const Pencil = kashi("pencil", ["M15.5 4.5l4 4L9 19H5v-4z", "M13 7l4 4"]);
export const PenLine = kashi("pen-line", ["M15.5 4.5l4 4L9 19H5v-4z", "M13 7l4 4", "M13 20h7"]);
export const Copy = kashi("copy", ["M10 9h9l1 1v9l-1 1h-9l-1-1v-9z", "M5 15H4V5l1-1h10v1"]);
export const Search = kashi("search", ["M8 4.5h5l3.5 3.5v5L13 16.5H8L4.5 13V8z", "M15.5 15.5 20 20"]);
export const Users = kashi("users", [
  "M7.5 4h3L12 5.5v3L10.5 10h-3L6 8.5v-3z",
  "M3 20v-3l2.5-2.5h7L15 17v3",
  "M15 4.5h2l1.5 1.5v2.5L17 10h-2",
  "M17.5 14.5H19l2 2V20",
]);
export const UsersRound = kashi("users-round", [
  "M7.5 4h3L12 5.5v3L10.5 10h-3L6 8.5v-3z",
  "M3 20v-3l2.5-2.5h7L15 17v3",
  "M15 4.5h2l1.5 1.5v2.5L17 10h-2",
  "M17.5 14.5H19l2 2V20",
]);
export const User = kashi("user", ["M10.5 4h3L15 5.5v3L13.5 10h-3L9 8.5v-3z", "M5 20v-3l2.5-2.5h9L19 17v3"]);
export const UserRound = kashi("user-round", [
  "M10.5 4h3L15 5.5v3L13.5 10h-3L9 8.5v-3z",
  "M5 20v-3l2.5-2.5h9L19 17v3",
]);
export const UserPlus = kashi("user-plus", [
  "M8.5 4h3L13 5.5v3L11.5 10h-3L7 8.5v-3z",
  "M3 20v-3l2.5-2.5h9L17 17v3",
  "M19 8v6M16 11h6",
]);
export const UserCheck = kashi("user-check", [
  "M8.5 4h3L13 5.5v3L11.5 10h-3L7 8.5v-3z",
  "M3 20v-3l2.5-2.5h9L17 17v3",
  "M16 11l2 2 4-4",
]);
export const BedDouble = kashi("bed-double", [
  "M3 19V6",
  "M3 15h18v4",
  "M21 15v-3l-2-2H10v5",
  "M5.5 12.5 7 11l1.5 1.5L7 14z",
]);
export const Star = kashi("star", ["M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7z"]);
export const Sparkles = kashi("sparkles", [
  "M11 3l1.8 6.2L19 11l-6.2 1.8L11 19l-1.8-6.2L3 11l6.2-1.8z",
  "M19 2.5v4M17 4.5h4",
]);
export const Clock = kashi("clock", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 7.5V12l3 2"]);
export const Clock3 = kashi("clock-3", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 7.5V12h4"]);
export const AlarmClock = kashi("alarm-clock", [
  "M8.5 5h7l4 4v6l-4 4h-7l-4-4V9z",
  "M12 9v3.5l2 1.5",
  "M3 5.5 5.5 3M21 5.5 18.5 3",
]);
export const Timer = kashi("timer", ["M8.5 6h7l4 4v6l-4 4h-7l-4-4v-6z", "M10 2.5h4", "M12 9.5v3.5"]);
export const Hourglass = kashi("hourglass", [
  "M6 3h12",
  "M6 21h12",
  "M7 3v3l5 6-5 6v3",
  "M17 3v3l-5 6 5 6v3",
]);
export const UtensilsCrossed = kashi("utensils-crossed", [
  "M6 3v6l2 2v10",
  "M10 3v6l-2 2",
  "M8 3v5",
  "M17 21V3l-3 4v7h3",
]);
export const Utensils = kashi("utensils", ["M6 3v6l2 2v10", "M10 3v6l-2 2", "M8 3v5", "M17 21V3l-3 4v7h3"]);
export const ChefHat = kashi("chef-hat", [
  "M6 14v6h12v-6",
  "M6 14l-2.5-2.5V8L6 5.5h2.5L10 4h4l1.5 1.5H18L20.5 8v3.5L18 14z",
  "M6 17h12",
]);
export const Coffee = kashi("coffee", [
  "M5 8h12v8l-3 3H8l-3-3z",
  "M17 10h2l1.5 1.5v1L19 14h-2",
  "M8 3.5v2M11 3.5v2M14 3.5v2",
]);
export const Wine = kashi("wine", ["M7 3h10l-1 6-4 3-4-3z", "M12 12v8", "M8 21h8"]);
export const ReceiptText = kashi("receipt-text", [
  "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z",
  "M8.5 8h7M8.5 12h7M8.5 16h4",
]);
export const Receipt = kashi("receipt", [
  "M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z",
  "M8.5 8h7M8.5 12h7",
]);
export const Wallet = kashi("wallet", ["M4 8l2-2h12l2 2v10l-2 2H6l-2-2z", "M20 11h-4l-1.5 1.5L16 14h4"]);
export const Phone = kashi("phone", ["M5 4h4l1.5 4.5-2.5 2 5.5 5.5 2-2.5L20 15v4l-1 1h-2L4 7V5z"]);
export const Smartphone = kashi("smartphone", ["M8 2.5h8l1.5 1.5v16L16 21.5H8L6.5 20V4z", "M11 18.5h2"]);
export const ConciergeBell = kashi("concierge-bell", [
  "M6 18l1-3.5 2.5-2.5h5l2.5 2.5 1 3.5",
  "M4 18h16",
  "M12 9.5V8",
  "M10.5 8h3",
]);
export const Bell = kashi("bell", ["M6 17v-6l2-4 2.5-2h3L16 7l2 4v6", "M4 17h16", "M10 20.5h4"]);
export const BellRing = kashi("bell-ring", [
  "M6 17v-6l2-4 2.5-2h3L16 7l2 4v6",
  "M4 17h16",
  "M10 20.5h4",
  "M2.5 8 4 6M21.5 8 20 6",
]);
export const BellOff = kashi("bell-off", [
  "M6 17v-6l2-4 2.5-2h3L16 7l2 4v6",
  "M4 17h16",
  "M10 20.5h4",
  "M4 4l16 16",
]);
export const LayoutGrid = kashi("layout-grid", [
  "M4 4h6v6H4z",
  "M14 4h6v6h-6z",
  "M4 14h6v6H4z",
  "M14 14h6v6h-6z",
]);
export const LayoutDashboard = kashi("layout-dashboard", [
  "M4 4h7v9H4z",
  "M13 4h7v5h-7z",
  "M13 11h7v9h-7z",
  "M4 15h7v5H4z",
]);
export const MapPin = kashi("map-pin", ["M12 21l-6-8V8l3-4h6l3 4v5z", "M12 8l2 2-2 2-2-2z"]);
export const Printer = kashi("printer", ["M7 8V3.5h10V8", "M5 17H3.5V10l2-2h13l2 2v7H19", "M7 14h10v6.5H7z"]);
export const KeyRound = kashi("key-round", [
  "M4 9h6v6H4z",
  "M7 7.8 11.2 12 7 16.2 2.8 12z",
  "M11 12h10",
  "M18 12v3M15.5 12v2",
]);
export const CalendarDays = kashi("calendar-days", [
  "M6 5h12l2 2v12l-2 2H6l-2-2V7z",
  "M4 10h16",
  "M8 3v4M16 3v4",
  "M12 13.5l1.5 1.5-1.5 1.5-1.5-1.5z",
]);
export const CalendarCheck = kashi("calendar-check", [
  "M6 5h12l2 2v12l-2 2H6l-2-2V7z",
  "M4 10h16",
  "M8 3v4M16 3v4",
  "M9 15l2 2 4-4",
]);
export const CalendarPlus = kashi("calendar-plus", [
  "M6 5h12l2 2v12l-2 2H6l-2-2V7z",
  "M4 10h16",
  "M8 3v4M16 3v4",
  "M12 13v5M9.5 15.5h5",
]);
export const CalendarRange = kashi("calendar-range", [
  "M6 5h12l2 2v12l-2 2H6l-2-2V7z",
  "M4 10h16",
  "M8 3v4M16 3v4",
  "M7.5 14h9M7.5 17h5",
]);
export const CalendarClock = kashi("calendar-clock", [
  "M6 5h12l2 2v12l-2 2H6l-2-2V7z",
  "M4 10h16",
  "M8 3v4M16 3v4",
  "M12 13v2.5l1.5 1.5",
]);
export const Flame = kashi("flame", ["M12 21l-5-3v-5l3-4 1 3 2-3V4l5 6v8z"]);
export const Store = kashi("store", ["M3.5 9 5 4h14l1.5 5", "M3.5 9h17", "M5 9v11h14V9", "M9.5 20v-5h5v5"]);
export const TrendingUp = kashi("trending-up", ["M3 17l6-6 4 4 8-8", "M15 7h6v6"]);
export const TrendingDown = kashi("trending-down", ["M3 7l6 6 4-4 8 8", "M15 17h6v-6"]);
export const CreditCard = kashi("credit-card", ["M4 6h16l1 1v10l-1 1H4l-1-1V7z", "M3 10h18", "M6.5 14.5h4"]);
export const SprayCan = kashi("spray-can", [
  "M18 3l-7 7",
  "M11 10l3 3-1 1-4 7-6-6 7-4z",
  "M6 18l2-2M8.5 20.5l2-2",
]);
export const Building2 = kashi("building-2", [
  "M5 21V5l2-2h7l2 2v16",
  "M16 9h3l1 1v11",
  "M3 21h18",
  "M8.5 7h3M8.5 11h3M8.5 15h3",
]);
export const Hotel = kashi("hotel", [
  "M5 21V5l2-2h10l2 2v16",
  "M3 21h18",
  "M10 21v-4h4v4",
  "M8.5 7h1M14.5 7h1M8.5 11h1M14.5 11h1",
]);
export const ShieldCheck = kashi("shield-check", [
  "M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z",
  "M8.5 12l2.5 2.5 4.5-4.5",
]);
export const Shield = kashi("shield", ["M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z"]);
export const ShieldAlert = kashi("shield-alert", [
  "M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z",
  "M12 8v4.5",
  "M12 15.5v.5",
]);
export const Globe = kashi("globe", [
  "M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z",
  "M3.5 12h17",
  "M12 3.5 9 8v8l3 4.5 3-4.5V8z",
]);
export const QrCode = kashi("qr-code", [
  "M4 4h6v6H4z",
  "M14 4h6v6h-6z",
  "M4 14h6v6H4z",
  "M17 14l3 3-3 3-3-3z",
]);
export const Calculator = kashi("calculator", [
  "M6 3h12l1 1v16l-1 1H6l-1-1V4z",
  "M8 6.5h8v3.5H8z",
  "M8.5 14h1M12 14h1M15 14h.5M8.5 17.5h1M12 17.5h1M15 17.5h.5",
]);
export const Percent = kashi("percent", [
  "M19 5 5 19",
  "M7 4.5l2.5 2.5L7 9.5 4.5 7z",
  "M17 14.5l2.5 2.5-2.5 2.5-2.5-2.5z",
]);
export const Eye = kashi("eye", ["M2.5 12 7 6.5h10l4.5 5.5-4.5 5.5H7z", "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z"]);
export const EyeOff = kashi("eye-off", [
  "M2.5 12 7 6.5h10l4.5 5.5-4.5 5.5H7z",
  "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z",
  "M4 4l16 16",
]);
export const Lock = kashi("lock", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 3v4"]);
export const LockOpen = kashi("lock-open", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 2"]);
export const Unlock = kashi("unlock", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 2"]);
export const ChartColumn = kashi("chart-column", [
  "M5 20v-7l1.5-1.5L8 13v7",
  "M10.5 20V8l1.5-1.5L13.5 8v12",
  "M16 20v-9l1.5-1.5L19 11v9",
  "M3 20h18",
]);
export const BarChart3 = kashi("bar-chart-3", [
  "M5 20v-7l1.5-1.5L8 13v7",
  "M10.5 20V8l1.5-1.5L13.5 8v12",
  "M16 20v-9l1.5-1.5L19 11v9",
  "M3 20h18",
]);
export const ChartSpline = kashi("chart-spline", ["M3 20h18", "M4 16l4-5 4 3 4-6 4-3"]);
export const LogOut = kashi("log-out", ["M10 4H5l-1 1v14l1 1h5", "M9 12h11", "M16 8l4 4-4 4"]);
export const LogIn = kashi("log-in", ["M14 4h5l1 1v14l-1 1h-5", "M4 12h11", "M11 8l4 4-4 4"]);
export const Headset = kashi("headset", [
  "M4 14v-3l2-5 3-2h6l3 2 2 5v3",
  "M4 14h3v6H5l-1-1z",
  "M20 14h-3v6h2l1-1z",
]);
export const MessageCircle = kashi("message-circle", ["M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z"]);
export const MessageSquare = kashi("message-square", ["M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z"]);
export const MessageSquareText = kashi("message-square-text", [
  "M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z",
  "M7.5 9.5h9M7.5 12.5h6",
]);
export const MessagesSquare = kashi("messages-square", [
  "M8 8h12l1.5 1.5v7L20 18h-2v3l-3.5-3H9.5L8 16.5z",
  "M4 13V4h12",
]);
export const Send = kashi("send", ["M21 3 3 10.5l7 3 3 7z", "M10 13.5 21 3"]);
export const SendHorizontal = kashi("send-horizontal", ["M21 3 3 10.5l7 3 3 7z", "M10 13.5 21 3"]);
export const Inbox = kashi("inbox", ["M4 13l3-8h10l3 8v6l-1 1H5l-1-1z", "M4 13h5l1.5 2.5h3L15 13h5"]);
export const Download = kashi("download", ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"]);
export const FileDown = kashi("file-down", ["M6 3h8l5 5v12l-1 1H6l-1-1V4z", "M12 10v7", "M9 14l3 3 3-3"]);
export const ArrowDownToLine = kashi("arrow-down-to-line", ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"]);
export const Upload = kashi("upload", ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"]);
export const ArrowUpFromLine = kashi("arrow-up-from-line", ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"]);
export const FileText = kashi("file-text", [
  "M6 3h8l5 5v12l-1 1H6l-1-1V4z",
  "M14 3v5h5",
  "M8.5 13h7M8.5 16.5h5",
]);
export const Info = kashi("info", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 11v5.5", "M12 7.5v.5"]);
export const CircleAlert = kashi("circle-alert", [
  "M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z",
  "M12 7.5v5.5",
  "M12 16v.5",
]);
export const AlertTriangle = kashi("alert-triangle", ["M12 3.5 21.5 20h-19z", "M12 9.5v5", "M12 17v.5"]);
export const TriangleAlert = kashi("triangle-alert", ["M12 3.5 21.5 20h-19z", "M12 9.5v5", "M12 17v.5"]);
export const CircleCheck = kashi("circle-check", [
  "M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z",
  "M8 12.5l2.5 2.5 5.5-5.5",
]);
export const CheckCircle2 = kashi("check-circle-2", [
  "M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z",
  "M8 12.5l2.5 2.5 5.5-5.5",
]);
export const XCircle = kashi("x-circle", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M9 9l6 6M15 9l-6 6"]);
export const Ban = kashi("ban", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M6.5 6.5l11 11"]);
export const CircleOff = kashi("circle-off", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M4 4l16 16"]);
export const Wifi = kashi("wifi", [
  "M2.5 9l4-3h11l4 3",
  "M6 12.5l2.5-2h7l2.5 2",
  "M9.5 16l1-1h3l1 1",
  "M12 19l.8.8-.8.8-.8-.8z",
]);
export const WifiOff = kashi("wifi-off", [
  "M2.5 9l4-3h11l4 3",
  "M6 12.5l2.5-2h7l2.5 2",
  "M9.5 16l1-1h3l1 1",
  "M12 19l.8.8-.8.8-.8-.8z",
  "M4 3l16 18",
]);
export const Mail = kashi("mail", ["M4 5h16l1 1v12l-1 1H4l-1-1V6z", "M3 6.5l9 6.5 9-6.5"]);
export const Settings = kashi("settings", [
  "M6 6h12v12H6z",
  "M12 3.5 20.5 12 12 20.5 3.5 12z",
  "M12 10l2 2-2 2-2-2z",
]);
export const Settings2 = kashi("settings-2", [
  "M6 6h12v12H6z",
  "M12 3.5 20.5 12 12 20.5 3.5 12z",
  "M12 10l2 2-2 2-2-2z",
]);
export const Ticket = kashi("ticket", [
  "M3 6h18v4l-1.5 2L21 14v4H3v-4l1.5-2L3 10z",
  "M14.5 6v2M14.5 11v2M14.5 16v2",
]);
export const Crown = kashi("crown", ["M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"]);
export const Gauge = kashi("gauge", [
  "M3.5 17v-3.5l2.5-5L9 6h6l3 2.5 2.5 5V17",
  "M12 17l3.5-6",
  "M3.5 17h17",
]);
export const Banknote = kashi("banknote", [
  "M3 6h18v12H3z",
  "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z",
  "M6 9v6M18 9v6",
]);
export const Heart = kashi("heart", ["M12 20 4 12V7.5L7 4.5h2.5L12 7l2.5-2.5H17l3 3V12z"]);
export const ShoppingBag = kashi("shopping-bag", ["M5 8h14l-1 12H6z", "M9 8V6l1.5-2h3L15 6v2"]);
export const Package = kashi("package", ["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M4 7.5l8 4.5 8-4.5", "M12 12v9"]);
export const Power = kashi("power", ["M12 3v8", "M7 6 4.5 9.5v5l3.5 5h8l3.5-5v-5L17 6"]);
export const Home = kashi("home", ["M4 21V10l8-6 8 6v11z", "M9.5 21v-4l2.5-3 2.5 3v4"]);
export const House = kashi("house", ["M4 21V10l8-6 8 6v11z", "M9.5 21v-4l2.5-3 2.5 3v4"]);
export const Tags = kashi("tags", ["M3.5 3.5H11l9.5 9.5-7.5 7.5L3.5 11z", "M7.5 7l1 1-1 1-1-1z"]);
export const Tag = kashi("tag", ["M3.5 3.5H11l9.5 9.5-7.5 7.5L3.5 11z", "M7.5 7l1 1-1 1-1-1z"]);
export const Bot = kashi("bot", [
  "M5 9h14l1 1v8l-1 1H5l-1-1v-8z",
  "M12 9V5",
  "M10.5 4h3",
  "M9 13l1 1-1 1-1-1zM15 13l1 1-1 1-1-1z",
]);
export const Activity = kashi("activity", ["M3 12h4l3-7 4 14 3-7h4"]);
export const Play = kashi("play", ["M7 4.5l12 7.5-12 7.5z"]);
export const Pause = kashi("pause", ["M7 5h3v14H7z", "M14 5h3v14h-3z"]);
export const ImagePlus = kashi("image-plus", [
  "M4 5h11",
  "M4 5v14h16v-6",
  "M4 16l5-5 4 4 3-3 4 4",
  "M19 3v6M16 6h6",
]);
export const Landmark = kashi("landmark", [
  "M3 9.5 12 4l9 5.5",
  "M3.5 20.5h17",
  "M5.5 10v8M10 10v8M14 10v8M18.5 10v8",
]);
export const MoreHorizontal = kashi("more-horizontal", [
  "M5 11l1 1-1 1-1-1z",
  "M12 11l1 1-1 1-1-1z",
  "M19 11l1 1-1 1-1-1z",
]);
export const MoreVertical = kashi("more-vertical", [
  "M12 4l1 1-1 1-1-1z",
  "M12 11l1 1-1 1-1-1z",
  "M12 18l1 1-1 1-1-1z",
]);
export const Zap = kashi("zap", ["M13 3 5 13h6l-1 8 8-10h-6z"]);

export const Apple = kashi("apple", [
  "M12 7.5 9 6 6 7 4 10v4l3 5h3l2-1 2 1h3l3-5v-4l-2-3-3-1z",
  "M12 7.5V4l2-1",
]);
export const Archive = kashi("archive", ["M4 4H20L21 5V7L20 8H4L3 7V5Z", "M5 8v11l1 1h12l1-1V8", "M10 12h4"]);
export const Armchair = kashi("armchair", [
  "M5 10V6l2-2h10l2 2v4",
  "M3 11h3v4h12v-4h3v7H3z",
  "M5 18v2M19 18v2",
]);
export const ArrowDownRight = kashi("arrow-down-right", ["M7 7l10 10", "M17 9v8H9"]);
export const Award = kashi("award", [
  "M9.72 3.5H14.28L17.5 6.72V11.28L14.28 14.5H9.72L6.5 11.28V6.72Z",
  "M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5",
]);
export const Baby = kashi("baby", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M9 10.2L9.8 11L9 11.8L8.2 11Z",
  "M15 10.2L15.8 11L15 11.8L14.2 11Z",
  "M10 15.5h4",
]);
export const BadgeCheck = kashi("badge-check", [
  "M6 6h12v12H6z",
  "M12 3.5 20.5 12 12 20.5 3.5 12z",
  "M9 12l2 2 4-4",
]);
export const BadgePercent = kashi("badge-percent", [
  "M6 6h12v12H6z",
  "M12 3.5 20.5 12 12 20.5 3.5 12z",
  "M9.5 14.5l5-5",
  "M9.5 8.7L10.3 9.5L9.5 10.3L8.7 9.5Z",
  "M14.5 13.7L15.3 14.5L14.5 15.3L13.7 14.5Z",
]);
export const Banana = kashi("banana", [
  "M4 14l3 4 5 1.5 5-1.5 3-3-4 1.5h-5l-3-2.5-1.5-4L4 9z",
  "M19.5 14.5 21 12",
]);
export const Bean = kashi("bean", ["M8 4h6l4 4v4l-2 3-4 1-3 4H6l-2-3v-5l2-3z", "M10 9l2 2"]);
export const Beef = kashi("beef", [
  "M5 9l4-4h7l4 4v5l-4 4h-4l-3 3H6l-2-2v-3l1-2z",
  "M14 8L16 10L14 12L12 10Z",
]);
export const Beer = kashi("beer", [
  "M5 7h10v13H5z",
  "M15 10h3l1 1v5l-1 1h-3",
  "M5 7l1-3h8l1 3",
  "M8.5 11v6M11.5 11v6",
]);
export const Bike = kashi("bike", [
  "M4.55 12.5H7.45L9.5 14.55V17.45L7.45 19.5H4.55L2.5 17.45V14.55Z",
  "M16.55 12.5H19.45L21.5 14.55V17.45L19.45 19.5H16.55L14.5 17.45V14.55Z",
  "M6 16l4-7h5l3 7",
  "M10 9l2 7",
  "M14 6h2l-1 3",
]);
export const Blend = kashi("blend", [
  "M6.72 6.5H11.28L14.5 9.72V14.28L11.28 17.5H6.72L3.5 14.28V9.72Z",
  "M12.72 6.5H17.28L20.5 9.72V14.28L17.28 17.5H12.72L9.5 14.28V9.72Z",
]);
export const Blocks = kashi("blocks", [
  "M4 13H10L11 14V20L10 21H4L3 20V14Z",
  "M14 13H20L21 14V20L20 21H14L13 20V14Z",
  "M4 3H10L11 4V10L10 11H4L3 10V4Z",
  "M17 3L21 7L17 11L13 7Z",
]);
export const BookOpen = kashi("book-open", ["M12 6.5 7 4H3v14h5l4 2.5 4-2.5h5V4h-4z", "M12 6.5v14"]);
export const BookOpenCheck = kashi("book-open-check", [
  "M12 6.5 7 4H3v14h5l4 2.5 4-2.5h5V4h-4z",
  "M12 6.5v14",
  "M14.5 11l1.5 1.5 3-3",
]);
export const BookOpenText = kashi("book-open-text", [
  "M12 6.5 7 4H3v14h5l4 2.5 4-2.5h5V4h-4z",
  "M12 6.5v14",
  "M5.5 8h3.5M5.5 11.5h3.5M15 8h3.5M15 11.5h3.5",
]);
export const BookUser = kashi("book-user", [
  "M5 3h13l1 1v16l-1 1H5z",
  "M11.09 7.3H12.91L14.2 8.59V10.41L12.91 11.7H11.09L9.8 10.41V8.59Z",
  "M8.5 16l1.5-2h4.5l1.5 2",
]);
export const BottleWine = kashi("bottle-wine", ["M10 3h4v4l2 3v10l-1 1H9l-1-1V10l2-3z", "M8 13h8"]);
export const Boxes = kashi("boxes", [
  "M4 12H10L11 13V19L10 20H4L3 19V13Z",
  "M14 12H20L21 13V19L20 20H14L13 19V13Z",
  "M9 3H15L16 4V10L15 11H9L8 10V4Z",
]);
export const Briefcase = kashi("briefcase", [
  "M5 7H19L21 9V18L19 20H5L3 18V9Z",
  "M9 7V5l1-1h4l1 1v2",
  "M3 12h18",
  "M11 12v2h2v-2",
]);
export const Bug = kashi("bug", [
  "M9 7h6l2 2v7l-3 4h-4l-3-4V9z",
  "M9 7 7 4M15 7l2-3",
  "M7 11H3.5M7 15H4M17 11h3.5M17 15h3",
  "M12 9v11",
]);
export const Cake = kashi("cake", [
  "M4 12h16v8H4z",
  "M4 15.5l2.5 1.5L9 15.5l3 1.5 3-1.5 2.5 1.5 2.5-1.5",
  "M8 12V9M12 12V9M16 12V9",
  "M8 5.1L8.9 6L8 6.9L7.1 6Z",
  "M12 5.1L12.9 6L12 6.9L11.1 6Z",
  "M16 5.1L16.9 6L16 6.9L15.1 6Z",
]);
export const CakeSlice = kashi("cake-slice", [
  "M3 13 20 7v13H3z",
  "M3 16.5h17",
  "M15 3.6L15.9 4.5L15 5.4L14.1 4.5Z",
]);
export const CanSoda = kashi("can-soda", ["M7 5h10l1 2v12l-1 2H7l-1-2V7z", "M6 8h12M6 17h12", "M11 3h3"]);
export const Candy = kashi("candy", [
  "M10.34 8H13.66L16 10.34V13.66L13.66 16H10.34L8 13.66V10.34Z",
  "M8.5 8.5 4 7l1.5-3 3 1.5",
  "M15.5 15.5 20 17l-1.5 3-3-1.5",
]);
export const CandyCane = kashi("candy-cane", ["M8 21V8l2-4h4l2 2v4", "M8 13l3-2M8 17l3-2M13 4l1 3"]);
export const Car = kashi("car", [
  "M4 16v-4l2-5h12l2 5v4",
  "M3 16h18v2H3z",
  "M5 11h14",
  "M7.5 16.7L9.3 18.5L7.5 20.3L5.7 18.5Z",
  "M16.5 16.7L18.3 18.5L16.5 20.3L14.7 18.5Z",
]);
export const Carrot = kashi("carrot", [
  "M4 20l4-11 7-.5L15.5 15z",
  "M15 8.5l2-4.5M15.5 9l4.5-2M15 8.5l5 1",
  "M9 13l2 1M7 17l2 1",
]);
export const Cherry = kashi("cherry", [
  "M7 12.5L10.5 16L7 19.5L3.5 16Z",
  "M16 13.5L19.5 17L16 20.5L12.5 17Z",
  "M7 12.5 13 4l3 9.5",
  "M13 4l4-1",
]);
export const ChevronsDownUp = kashi("chevrons-down-up", ["M7 20l5-5 5 5", "M7 4l5 5 5-5"]);
export const Cigarette = kashi("cigarette", [
  "M2 13H18L18 13V17L18 17H2L2 17V13Z",
  "M14 13v4",
  "M20 13v4M22 13v4",
  "M17 9V7l2-2V3",
]);
export const CirclePause = kashi("circle-pause", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M10 9v6M14 9v6",
]);
export const Citrus = kashi("citrus", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M9.51 6H14.49L18 9.51V14.49L14.49 18H9.51L6 14.49V9.51Z",
  "M12 6v12M6 12h12M7.8 7.8l8.4 8.4M16.2 7.8l-8.4 8.4",
]);
export const ClipboardCheck = kashi("clipboard-check", [
  "M7 4H17L19 6V19L17 21H7L5 19V6Z",
  "M9 2.5h6v3H9z",
  "M9 13l2 2 4-4",
]);
export const ClipboardList = kashi("clipboard-list", [
  "M7 4H17L19 6V19L17 21H7L5 19V6Z",
  "M9 2.5h6v3H9z",
  "M9 11h6M9 14.5h6M9 18h3",
]);
export const Coins = kashi("coins", [
  "M6.51 3H11.49L15 6.51V11.49L11.49 15H6.51L3 11.49V6.51Z",
  "M9 7L11 9L9 11L7 9Z",
  "M16.5 8.5l4 4v3l-5 5h-3l-2-1.5",
]);
export const Contact = kashi("contact", [
  "M6 3H18L20 5V19L18 21H6L4 19V5Z",
  "M10.84 7.2H13.16L14.8 8.84V11.16L13.16 12.8H10.84L9.2 11.16V8.84Z",
  "M8 17l1.5-2.5h5L16 17",
  "M8 2v2M16 2v2",
]);
export const Cookie = kashi("cookie", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M9 8L10 9L9 10L8 9Z",
  "M14.5 9L15.5 10L14.5 11L13.5 10Z",
  "M10 14L11 15L10 16L9 15Z",
  "M15 14.2L15.8 15L15 15.8L14.2 15Z",
]);
export const CookingPot = kashi("cooking-pot", [
  "M4 10h16v8l-2 2H6l-2-2z",
  "M2 10h20",
  "M9 6.5h6",
  "M12 4v2.5",
]);
export const CornerDownLeft = kashi("corner-down-left", ["M20 4v7l-2 2H5", "M9 9l-4 4 4 4"]);
export const Croissant = kashi("croissant", [
  "M4 15l3-7 5-2 5 2 3 7-3 2-2-3H9l-2 3z",
  "M9 8.5l1 5M15 8.5l-1 5",
]);
export const CupSoda = kashi("cup-soda", ["M6 8h12l-1.5 13h-9z", "M5 8h14", "M12 8l2-6h3", "M6.5 13h11"]);
export const Cupcake = kashi("cupcake", [
  "M6 13h12l-2 8H8z",
  "M5 13l1-4 3-2h6l3 2 1 4",
  "M12 7V4",
  "M10 13l1 8M14 13l-1 8",
]);
export const Database = kashi("database", [
  "M5 6l2-2h10l2 2v12l-2 2H7l-2-2z",
  "M5 6l2 2h10l2-2",
  "M5 12l2 2h10l2-2",
]);
export const Dessert = kashi("dessert", ["M4 13h16l-2 5H6z", "M8 21h8", "M7 13v-3l2-3h6l2 3v3", "M12 7V4"]);
export const Dices = kashi("dices", [
  "M6 4H18L20 6V18L18 20H6L4 18V6Z",
  "M8.5 7.5L9.5 8.5L8.5 9.5L7.5 8.5Z",
  "M15.5 14.5L16.5 15.5L15.5 16.5L14.5 15.5Z",
  "M12 11L13 12L12 13L11 12Z",
  "M15.5 7.5L16.5 8.5L15.5 9.5L14.5 8.5Z",
  "M8.5 14.5L9.5 15.5L8.5 16.5L7.5 15.5Z",
]);
export const Donut = kashi("donut", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M10.76 9H13.24L15 10.76V13.24L13.24 15H10.76L9 13.24V10.76Z",
]);
export const DoorOpen = kashi("door-open", ["M5 21V4l1-1h8v18", "M3 21h18", "M14 5l5-1v17", "M11 12v1"]);
export const Droplets = kashi("droplets", ["M8 3l4 6v4l-4 4-4-4V9z", "M16 9l3 4.5v3L16 19l-3-2.5v-3z"]);
export const Drumstick = kashi("drumstick", [
  "M12.72 3.5H17.28L20.5 6.72V11.28L17.28 14.5H12.72L9.5 11.28V6.72Z",
  "M11 13l-5 5",
  "M4 17l2 3 1-2 2-1-3-2z",
]);
export const Egg = kashi("egg", ["M12 3l4 4 2 5v4l-3 4H9l-3-4v-4l2-5z"]);
export const EggFried = kashi("egg-fried", [
  "M5 7l4-3h5l3 2 3 4v4l-3 5h-6l-5-3-2-4z",
  "M10.76 9H13.24L15 10.76V13.24L13.24 15H10.76L9 13.24V10.76Z",
]);
export const FileBarChart = kashi("file-bar-chart", [
  "M6 3h8l5 5v12l-1 1H6l-1-1V4z",
  "M14 3v5h5",
  "M9 17v-3M12 17v-6M15 17v-4",
]);
export const FileCheck2 = kashi("file-check-2", [
  "M6 3h8l5 5v12l-1 1H6l-1-1V4z",
  "M14 3v5h5",
  "M9 14l2 2 4-4",
]);
export const FileSpreadsheet = kashi("file-spreadsheet", [
  "M6 3h8l5 5v12l-1 1H6l-1-1V4z",
  "M14 3v5h5",
  "M8 12h8v6H8z",
  "M12 12v6",
  "M8 15h8",
]);
export const FileWarning = kashi("file-warning", [
  "M6 3h8l5 5v12l-1 1H6l-1-1V4z",
  "M14 3v5h5",
  "M12 10.5v4",
  "M12 17v.5",
]);
export const Fish = kashi("fish", [
  "M3 12l5-5h6l4 5-4 5H8z",
  "M18 12l3-3v6z",
  "M9 10.2L9.8 11L9 11.8L8.2 11Z",
]);
export const Flag = kashi("flag", ["M5 21V4", "M5 4h12l-2 4 2 4H5"]);
export const Flower2 = kashi("flower-2", [
  "M8.5 5.5h7v7h-7z",
  "M12 4l5 5-5 5-5-5z",
  "M12 14v7",
  "M12 18 8 16M12 18l4-2",
]);
export const Frown = kashi("frown", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M9 9.2L9.8 10L9 10.8L8.2 10Z",
  "M15 9.2L15.8 10L15 10.8L14.2 10Z",
  "M9 16l1.5-1.5h3L15 16",
]);
export const Gem = kashi("gem", ["M7 4h10l4 5-9 11L3 9z", "M3 9h18", "M10 4 8 9l4 11 4-11-2-5"]);
export const Gift = kashi("gift", [
  "M3 8H21L21 8V12L21 12H3L3 12V8Z",
  "M5 12v9h14v-9",
  "M12 8v13",
  "M12 8 9 4H7L6 6l3 2",
  "M12 8l3-4h2l1 2-3 2",
]);
export const GlassWater = kashi("glass-water", ["M5 3h14l-2 18H7z", "M6 9h12"]);
export const Grape = kashi("grape", [
  "M9 8L11 10L9 12L7 10Z",
  "M15 8L17 10L15 12L13 10Z",
  "M12 11.5L14 13.5L12 15.5L10 13.5Z",
  "M9 15L11 17L9 19L7 17Z",
  "M15 15L17 17L15 19L13 17Z",
  "M12 7V3l3-1",
]);
export const GripVertical = kashi("grip-vertical", [
  "M9 5L10 6L9 7L8 6Z",
  "M15 5L16 6L15 7L14 6Z",
  "M9 11L10 12L9 13L8 12Z",
  "M15 11L16 12L15 13L14 12Z",
  "M9 17L10 18L9 19L8 18Z",
  "M15 17L16 18L15 19L14 18Z",
]);
export const Ham = kashi("ham", [
  "M11.51 4H16.49L20 7.51V12.49L16.49 16H11.51L8 12.49V7.51Z",
  "M9.5 14.5 4 20",
  "M3 18l2 3",
]);
export const Hamburger = kashi("hamburger", ["M4 10l2-4 3-2h6l3 2 2 4z", "M3 13h18", "M4 16h16l-1 4H5z"]);
export const Hand = kashi("hand", [
  "M8 12V5l1.5-1.5L11 5v6",
  "M11 10V3.5L12.5 2 14 3.5V10",
  "M14 10V5l1.5-1.5L17 5v8l-1 5-3 3h-3l-4-4-2.5-4 1-1.5L8 14",
]);
export const HandCoins = kashi("hand-coins", [
  "M3 15h3l4-2h4l1 1-1 1h-4",
  "M14 15l4-2 2 1-6 5H9l-3-1H3",
  "M16 3L19 6L16 9L13 6Z",
]);
export const HandPlatter = kashi("hand-platter", [
  "M4 15h16",
  "M5 15l1.5-4.5L9 8h6l2.5 2.5L19 15",
  "M12 8V6",
  "M11 6h2",
  "M3 19h6l3 1 5-1h4",
]);
export const Hash = kashi("hash", ["M5 9h15M4 15h15", "M10 3 8 21M16 3l-2 18"]);
export const HeartHandshake = kashi("heart-handshake", [
  "M12 20 4 12V7.5L7 4.5h2.5L12 7l2.5-2.5H17l3 3V12z",
  "M8 12l3-2.5 2 1.5 2-1.5",
]);
export const Hop = kashi("hop", ["M12 3l5 5v6l-5 7-5-7V8z", "M7 10l5 4 5-4", "M8 15l4 3 4-3"]);
export const IceCreamBowl = kashi("ice-cream-bowl", [
  "M3 12h18l-2 6H5z",
  "M8 21h8",
  "M7 12V9l2-2h2l1 1 1-1h2l2 2v3",
]);
export const IceCreamCone = kashi("ice-cream-cone", ["M7 10l5 11 5-11", "M6 10V7l3-3h6l3 3v3z"]);
export const IdCard = kashi("id-card", [
  "M5 5H19L21 7V17L19 19H5L3 17V7Z",
  "M7.67 9H9.33L10.5 10.17V11.83L9.33 13H7.67L6.5 11.83V10.17Z",
  "M5.5 16 7 14.5h3l1.5 1.5",
  "M14 10h4M14 13.5h3",
]);
export const ImageIcon = kashi("image-icon", [
  "M6 4H18L20 6V18L18 20H6L4 18V6Z",
  "M4 16l5-5 4 4 3-3 4 4",
  "M15 7.3L16.2 8.5L15 9.7L13.8 8.5Z",
]);
export const ImageOff = kashi("image-off", [
  "M6 4H18L20 6V18L18 20H6L4 18V6Z",
  "M4 16l5-5 4 4 3-3 4 4",
  "M3 3l18 18",
]);
export const ImageUp = kashi("image-up", [
  "M4 6h7",
  "M4 6v14h16v-7",
  "M4 16l5-5 4 4 3-3 4 4",
  "M17 10V3",
  "M14.5 5.5 17 3l2.5 2.5",
]);
export const Images = kashi("images", [
  "M9 3H19L21 5V15L19 17H9L7 15V5Z",
  "M3 7v13l1 1h13",
  "M7 13l4-4 3 3 2-2 5 5",
]);
export const Languages = kashi("languages", [
  "M3 5h10M8 3v2",
  "M5 5l1 4 5 4M11 5l-3 7-4 3",
  "M13 21l4-10 4 10",
  "M14.5 17h5",
]);
export const Laptop = kashi("laptop", ["M6 4H18L19 5V14L18 15H6L5 14V5Z", "M2.5 18h19L20 20H4z"]);
export const Layers = kashi("layers", ["M12 3l9 5-9 5-9-5z", "M3 12.5l9 5 9-5", "M3 16.5l9 5 9-5"]);
export const LayoutList = kashi("layout-list", [
  "M4 4H8L9 5V9L8 10H4L3 9V5Z",
  "M4 14H8L9 15V19L8 20H4L3 19V15Z",
  "M12 5h9M12 9h6M12 15h9M12 19h6",
]);
export const Leaf = kashi("leaf", ["M5 19l1-8 5-5 9-2-2 9-5 5z", "M5 19l8-8"]);
export const LeafyGreen = kashi("leafy-green", ["M4 20l2-9 6-6 7-2-1 8-5 6z", "M4 20l9-9", "M9 12l3 3"]);
export const Library = kashi("library", ["M5 4v16M9 4v16", "M13 5l4-1 4 15-4 1z"]);
export const List = kashi("list", [
  "M4.5 5L5.5 6L4.5 7L3.5 6Z",
  "M4.5 11L5.5 12L4.5 13L3.5 12Z",
  "M4.5 17L5.5 18L4.5 19L3.5 18Z",
  "M9 6h12M9 12h12M9 18h12",
]);
export const ListMusic = kashi("list-music", [
  "M3 6h12M3 11h12M3 16h7",
  "M15 20v-6l5-1.5v6",
  "M13.5 18.5L15 20L13.5 21.5L12 20Z",
  "M18.5 17L20 18.5L18.5 20L17 18.5Z",
]);
export const Loader2 = kashi("loader-2", ["M15.5 3.5l5 5v7l-5 5h-7"]);
export const LoaderCircle = kashi("loader-circle", ["M15.5 3.5l5 5v7l-5 5h-7"]);
export const LocateFixed = kashi("locate-fixed", [
  "M9.1 5H14.9L19 9.1V14.9L14.9 19H9.1L5 14.9V9.1Z",
  "M12 2v3M12 19v3M2 12h3M19 12h3",
  "M12 10L14 12L12 14L10 12Z",
]);
export const Lollipop = kashi("lollipop", [
  "M8.51 3H13.49L17 6.51V11.49L13.49 15H8.51L5 11.49V6.51Z",
  "M11 6.5L13.5 9L11 11.5L8.5 9Z",
  "M15.5 13.5 21 21",
]);
export const Luggage = kashi("luggage", [
  "M8 7H16L18 9V18L16 20H8L6 18V9Z",
  "M9 7V4h6v3",
  "M10 11v5M14 11v5",
  "M8 20v1.5M16 20v1.5",
]);
export const Martini = kashi("martini", ["M4 4h16l-8 9z", "M12 13v7", "M8 21h8", "M14 7l2-3"]);
export const Maximize2 = kashi("maximize-2", ["M14 4h6v6", "M20 4l-6 6", "M10 20H4v-6", "M4 20l6-6"]);
export const Minimize2 = kashi("minimize-2", ["M4 14h6v6", "M10 14l-6 6", "M20 10h-6V4", "M14 10l6-6"]);
export const Medal = kashi("medal", [
  "M7 3l3 6M17 3l-3 6",
  "M9.72 9.5H14.28L17.5 12.72V17.28L14.28 20.5H9.72L6.5 17.28V12.72Z",
  "M12 13L14 15L12 17L10 15Z",
]);
export const Mic = kashi("mic", [
  "M10.5 3h3L15 4.5v8L13.5 14h-3L9 12.5v-8z",
  "M5.5 11l1 3 3 2.5h5l3-2.5 1-3",
  "M12 17v4M9 21h6",
]);
export const Milk = kashi("milk", ["M8 2h8v3l2 3v13H6V8l2-3z", "M6 11h12", "M8 5h8"]);
export const Monitor = kashi("monitor", ["M4 4H20L21 5V15L20 16H4L3 15V5Z", "M8 21h8", "M12 16v5"]);
export const MonitorPlay = kashi("monitor-play", [
  "M4 4H20L21 5V15L20 16H4L3 15V5Z",
  "M8 21h8",
  "M12 16v5",
  "M10.5 8v4l3.5-2z",
]);
export const MonitorSmartphone = kashi("monitor-smartphone", [
  "M15 18H4V5h14v3",
  "M8 21h7",
  "M10 18v3",
  "M17 10H21L22 11V20L21 21H17L16 20V11Z",
]);
export const Moon = kashi("moon", [
  "M15 3.5 11 6 9.5 10.5 11 15l4 2.5 4.5.5-2.5 2.5H11l-4.5-2.5L4 13V9.5L6.5 5 11 3z",
]);
export const MoonStar = kashi("moon-star", [
  "M15 3.5 11 6 9.5 10.5 11 15l4 2.5 4.5.5-2.5 2.5H11l-4.5-2.5L4 13V9.5L6.5 5 11 3z",
  "M18 4L20 6L18 8L16 6Z",
]);
export const MousePointerClick = kashi("mouse-pointer-click", [
  "M9 9l11 4-5 2-2 5z",
  "M7 3l1 3M3 7l3 1M3.5 3.5l2 2M12 4l-1 2",
]);
export const Music = kashi("music", [
  "M9 18V5l11-2v13",
  "M6.5 15.5L9 18L6.5 20.5L4 18Z",
  "M17.5 13.5L20 16L17.5 18.5L15 16Z",
]);
export const Music2 = kashi("music-2", ["M14 18V3l5 2v3l-5-1", "M10.5 14.5L14 18L10.5 21.5L7 18Z"]);
export const Navigation = kashi("navigation", ["M3 11 21 3l-8 18-2-8z"]);
export const Network = kashi("network", [
  "M10 3H14L15 4V7L14 8H10L9 7V4Z",
  "M3 16H7L8 17V20L7 21H3L2 20V17Z",
  "M17 16H21L22 17V20L21 21H17L16 20V17Z",
  "M12 8v4M5 16v-4h14v4",
]);
export const NotebookPen = kashi("notebook-pen", [
  "M5 3H16L17 4V20L16 21H5L4 20V4Z",
  "M2.5 7h3M2.5 12h3M2.5 17h3",
  "M19.5 7l2 2-6 6h-2v-2z",
]);
export const NotebookTabs = kashi("notebook-tabs", [
  "M5 3H17L18 4V20L17 21H5L4 20V4Z",
  "M2.5 7h3M2.5 12h3M2.5 17h3",
  "M18 6h3v4h-3M18 13h3v4h-3",
]);
export const Nut = kashi("nut", ["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M12 8.5l3.5 2V14L12 16l-3.5-2v-3.5z"]);
export const PartyPopper = kashi("party-popper", [
  "M3 21l5-13 8 8z",
  "M14 3l1 2M19 5l-2 2M21 10l-2 .5M13 9l3-3",
  "M17 8.7L17.8 9.5L17 10.3L16.2 9.5Z",
  "M10 4.2L10.8 5L10 5.8L9.2 5Z",
]);
export const Pizza = kashi("pizza", [
  "M12 3 3 8l9 13 9-13z",
  "M3 8l9 2 9-2",
  "M10 12.1L10.9 13L10 13.9L9.1 13Z",
  "M14 10.6L14.9 11.5L14 12.4L13.1 11.5Z",
]);
export const PlayCircle = kashi("play-circle", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M10 8.5v7l5.5-3.5z",
]);
export const Popcorn = kashi("popcorn", [
  "M6 9l2 12h8l2-12z",
  "M5 9l1-3 2-1 2-2h4l2 2 2 1 1 3",
  "M10 9l.5 12M14 9l-.5 12",
]);
export const Popsicle = kashi("popsicle", ["M7 3h10v13H7z", "M12 16v6", "M10 6.5v6"]);
export const Radio = kashi("radio", [
  "M4 8H20L21 9V19L20 20H4L3 19V9Z",
  "M7 3l10 5",
  "M6.96 11.5H9.04L10.5 12.96V15.04L9.04 16.5H6.96L5.5 15.04V12.96Z",
  "M14 12h3M14 16h3",
]);
export const RefreshCw = kashi("refresh-cw", [
  "M4 10l2-4 3-2h6l3 2",
  "M18 3v3h-3",
  "M20 14l-2 4-3 2H9l-3-2",
  "M6 21v-3h3",
]);
export const Repeat = kashi("repeat", [
  "M4 11V8l2-2h14",
  "M17 3l3 3-3 3",
  "M20 13v3l-2 2H4",
  "M7 21l-3-3 3-3",
]);
export const RotateCcw = kashi("rotate-ccw", ["M4 4v5h5", "M4.5 9 8 5h6l5 5v4l-5 5H8l-3-3"]);
export const Rows3 = kashi("rows-3", ["M4 4H20L21 5V19L20 20H4L3 19V5Z", "M3 9.5h18M3 14.5h18"]);
export const Salad = kashi("salad", [
  "M3 12h18l-2 6-3 2H8l-3-2z",
  "M7 12l1-5 3 3",
  "M12 12l1-6 3 4",
  "M16 12l2-3",
]);
export const Sandwich = kashi("sandwich", ["M3 9l9-5 9 5z", "M3 13h18", "M4 16h16l-1 3H5z"]);
export const Save = kashi("save", ["M5 3h11l4 4v13l-1 1H5l-1-1V4z", "M8 3v5h7V3", "M7 21v-7h10v7"]);
export const Scale = kashi("scale", ["M12 3v18", "M7 21h10", "M4 7h16", "M4 7l-2.5 6h5z", "M20 7l-2.5 6h5z"]);
export const ScanLine = kashi("scan-line", ["M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4", "M3 12h18"]);
export const Shapes = kashi("shapes", [
  "M8 3l5 8H3z",
  "M14 13H20L21 14V20L20 21H14L13 20V14Z",
  "M5.84 13H9.16L11.5 15.34V18.66L9.16 21H5.84L3.5 18.66V15.34Z",
]);
export const Share2 = kashi("share-2", [
  "M18 2.5L20.5 5L18 7.5L15.5 5Z",
  "M6 9.5L8.5 12L6 14.5L3.5 12Z",
  "M18 16.5L20.5 19L18 21.5L15.5 19Z",
  "M8.3 10.8l7.4-4.6M8.3 13.2l7.4 4.6",
]);
export const Shirt = kashi("shirt", ["M8 3l4 2 4-2 5 4-3 3-2-1v12H8V9l-2 1-3-3z"]);
export const Shrimp = kashi("shrimp", [
  "M20 7l-5-3H9L5 7l-1 5 3 4 4 1 3-2",
  "M14 15l1 4-3 2",
  "M9 4l2 4M5 8l4 1",
]);
export const Shuffle = kashi("shuffle", [
  "M3 7h4l10 10h4",
  "M18 14l3 3-3 3",
  "M3 17h4l3-3",
  "M14 10l3-3h4",
  "M18 4l3 3-3 3",
]);
export const SkipBack = kashi("skip-back", ["M19 5v14L9 12z", "M5 5v14"]);
export const SkipForward = kashi("skip-forward", ["M5 5v14l10-7z", "M19 5v14"]);
export const SlidersHorizontal = kashi("sliders-horizontal", [
  "M3 6h10M17 6h4M3 12h4M11 12h10M3 18h12M19 18h2",
  "M15 4L17 6L15 8L13 6Z",
  "M9 10L11 12L9 14L7 12Z",
  "M17 16L19 18L17 20L15 18Z",
]);
export const Snowflake = kashi("snowflake", [
  "M12 2v20",
  "M3.3 7l17.4 10",
  "M3.3 17l17.4-10",
  "M9.5 3.5 12 6l2.5-2.5",
  "M9.5 20.5 12 18l2.5 2.5",
]);
export const Sofa = kashi("sofa", ["M5 10V7l2-2h10l2 2v3", "M3 11h3v4h12v-4h3v6H3z", "M5 17v2M19 17v2"]);
export const Soup = kashi("soup", [
  "M3 11h18l-1.5 5-3 3h-9l-3-3z",
  "M8 21h8",
  "M8 3l1 2-1 2 1 2M12 3l1 2-1 2 1 2M16 3l1 2-1 2 1 2",
]);
export const Sprout = kashi("sprout", ["M12 21v-9", "M12 13 6 10 4 5l6 2z", "M12 11l5-4 4-1-1 5-5 3z"]);
export const SquareMenu = kashi("square-menu", [
  "M5 3H19L21 5V19L19 21H5L3 19V5Z",
  "M7 8h10M7 12h10M7 16h10",
]);
export const SquarePlay = kashi("square-play", ["M5 3H19L21 5V19L19 21H5L3 19V5Z", "M10 8v8l6-4z"]);
export const Sun = kashi("sun", [
  "M10.34 8H13.66L16 10.34V13.66L13.66 16H10.34L8 13.66V10.34Z",
  "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1",
]);
export const Sunrise = kashi("sunrise", [
  "M12 2v6",
  "M9 5l3-3 3 3",
  "M2 20h20",
  "M5.5 20l1-3 3-3h5l3 3 1 3",
  "M3 14l1.5 1M21 14l-1.5 1",
]);
export const TableProperties = kashi("table-properties", [
  "M4 3H20L21 4V20L20 21H4L3 20V4Z",
  "M3 9h18",
  "M9 9v12",
  "M15 3v6",
]);
export const Target = kashi("target", [
  "M8.48 3.5H15.52L20.5 8.48V15.52L15.52 20.5H8.48L3.5 15.52V8.48Z",
  "M9.93 7H14.07L17 9.93V14.07L14.07 17H9.93L7 14.07V9.93Z",
  "M12 10.5L13.5 12L12 13.5L10.5 12Z",
]);
export const ThermometerSun = kashi("thermometer-sun", [
  "M9 4.5 10.5 3h1L13 4.5v9l2 2.5v2.5L13 21H9l-2-2.5V16l2-2.5z",
  "M11 9v8",
  "M17 4l2-1M18 8h2.5M17 12l2 1",
]);
export const ThumbsUp = kashi("thumbs-up", [
  "M3 10h4v11H3z",
  "M7 10l4-7h1l1.5 1.5-1 5.5h6l1.5 1.5-2 9-1.5 1.5H7",
]);
export const Trees = kashi("trees", [
  "M7 2 2.5 10h3L2 16h10l-3.5-6h3z",
  "M7 16v5",
  "M16 6l-3.5 7H15l-2 4h8l-2-4h2.5z",
  "M17 17v4",
]);
export const Trophy = kashi("trophy", [
  "M7 3h10v7l-2 3H9l-2-3z",
  "M7 5H3.5v2.5L7 10M17 5h3.5v2.5L17 10",
  "M12 13v4",
  "M8 21h8l-1-4H9z",
]);
export const Truck = kashi("truck", [
  "M2 6h12v10H2z",
  "M14 9h4l4 4v3h-8",
  "M6 16.5L8 18.5L6 20.5L4 18.5Z",
  "M17 16.5L19 18.5L17 20.5L15 18.5Z",
]);
export const Tv = kashi("tv", ["M3 7H21L22 8V20L21 21H3L2 20V8Z", "M8 2l4 5 4-5"]);
export const Undo2 = kashi("undo-2", ["M9 14 4 9l5-5", "M4 9h11l3 3v4l-3 3h-4"]);
export const UserX = kashi("user-x", [
  "M8.5 4h3L13 5.5v3L11.5 10h-3L7 8.5v-3z",
  "M3 20v-3l2.5-2.5h9L17 17v3",
  "M17 8l5 5M22 8l-5 5",
]);
export const Vegan = kashi("vegan", ["M3 3l9 18", "M12 21l3-6 5-4 1-8-6 2-3 6"]);
export const Volume1 = kashi("volume-1", ["M3 9h4l5-5v16l-5-5H3z", "M15.5 9.5 17 12l-1.5 2.5"]);
export const Volume2 = kashi("volume-2", [
  "M3 9h4l5-5v16l-5-5H3z",
  "M15.5 9.5 17 12l-1.5 2.5",
  "M18.5 7l3 5-3 5",
]);
export const VolumeX = kashi("volume-x", ["M3 9h4l5-5v16l-5-5H3z", "M16 9l6 6M22 9l-6 6"]);
export const Wand2 = kashi("wand-2", [
  "M4 20 16 8",
  "M14 6l4 4",
  "M19 2.5L20.5 4L19 5.5L17.5 4Z",
  "M9 3L10 4L9 5L8 4Z",
]);
export const Waves = kashi("waves", [
  "M2 7l3-2 3 2 3-2 3 2 3-2 3 2 2-1",
  "M2 12l3-2 3 2 3-2 3 2 3-2 3 2 2-1",
  "M2 17l3-2 3 2 3-2 3 2 3-2 3 2 2-1",
]);
export const Wheat = kashi("wheat", [
  "M12 21V4",
  "M12 8 8.5 5.5 8 9l4 2",
  "M12 8l3.5-2.5L16 9l-4 2",
  "M12 13l-3.5-2.5L8 14l4 2",
  "M12 13l3.5-2.5L16 14l-4 2",
]);
export const WheatOff = kashi("wheat-off", [
  "M12 21V4",
  "M12 8 8.5 5.5 8 9l4 2",
  "M12 8l3.5-2.5L16 9l-4 2",
  "M12 13l-3.5-2.5L8 14l4 2",
  "M12 13l3.5-2.5L16 14l-4 2",
  "M3 3l18 18",
]);
export const Wind = kashi("wind", [
  "M3 8h10l2-2V5l-1-1h-1",
  "M3 12h15l2 2v1l-1.5 1.5H17",
  "M3 16h7l1.5 1.5v1L10 20H9",
]);
export const Wrench = kashi("wrench", ["M15 3h4l2 2v4l-3 3h-3l-9 9-3-3 9-9V6z"]);
export const ZoomIn = kashi("zoom-in", [
  "M8 4.5h5l3.5 3.5v5L13 16.5H8L4.5 13V8z",
  "M15.5 15.5 20 20",
  "M10.5 8v5M8 10.5h5",
]);
export const ZoomOut = kashi("zoom-out", [
  "M8 4.5h5l3.5 3.5v5L13 16.5H8L4.5 13V8z",
  "M15.5 15.5 20 20",
  "M8 10.5h5",
]);
