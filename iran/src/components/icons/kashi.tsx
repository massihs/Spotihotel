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
export const ArrowLeftRight = kashi("arrow-left-right", ["M4 8h16", "M16 4l4 4-4 4", "M20 16H4", "M8 12l-4 4 4 4"]);
export const ExternalLink = kashi("external-link", ["M14 4h6v6", "M20 4l-9 9", "M18 14v4l-2 2H6l-2-2V8l2-2h4"]);
export const Trash2 = kashi("trash-2", ["M4 6.5h16", "M9 6.5V4h6v2.5", "M6 6.5l1 13.5h10l1-13.5", "M10 10.5v6M14 10.5v6"]);
export const Pencil = kashi("pencil", ["M15.5 4.5l4 4L9 19H5v-4z", "M13 7l4 4"]);
export const PenLine = kashi("pen-line", ["M15.5 4.5l4 4L9 19H5v-4z", "M13 7l4 4", "M13 20h7"]);
export const Copy = kashi("copy", ["M10 9h9l1 1v9l-1 1h-9l-1-1v-9z", "M5 15H4V5l1-1h10v1"]);
export const Search = kashi("search", ["M8 4.5h5l3.5 3.5v5L13 16.5H8L4.5 13V8z", "M15.5 15.5 20 20"]);
export const Users = kashi("users", ["M7.5 4h3L12 5.5v3L10.5 10h-3L6 8.5v-3z", "M3 20v-3l2.5-2.5h7L15 17v3", "M15 4.5h2l1.5 1.5v2.5L17 10h-2", "M17.5 14.5H19l2 2V20"]);
export const UsersRound = kashi("users-round", ["M7.5 4h3L12 5.5v3L10.5 10h-3L6 8.5v-3z", "M3 20v-3l2.5-2.5h7L15 17v3", "M15 4.5h2l1.5 1.5v2.5L17 10h-2", "M17.5 14.5H19l2 2V20"]);
export const User = kashi("user", ["M10.5 4h3L15 5.5v3L13.5 10h-3L9 8.5v-3z", "M5 20v-3l2.5-2.5h9L19 17v3"]);
export const UserRound = kashi("user-round", ["M10.5 4h3L15 5.5v3L13.5 10h-3L9 8.5v-3z", "M5 20v-3l2.5-2.5h9L19 17v3"]);
export const UserPlus = kashi("user-plus", ["M8.5 4h3L13 5.5v3L11.5 10h-3L7 8.5v-3z", "M3 20v-3l2.5-2.5h9L17 17v3", "M19 8v6M16 11h6"]);
export const UserCheck = kashi("user-check", ["M8.5 4h3L13 5.5v3L11.5 10h-3L7 8.5v-3z", "M3 20v-3l2.5-2.5h9L17 17v3", "M16 11l2 2 4-4"]);
export const BedDouble = kashi("bed-double", ["M3 19V6", "M3 15h18v4", "M21 15v-3l-2-2H10v5", "M5.5 12.5 7 11l1.5 1.5L7 14z"]);
export const Star = kashi("star", ["M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.8l6-.7z"]);
export const Sparkles = kashi("sparkles", ["M11 3l1.8 6.2L19 11l-6.2 1.8L11 19l-1.8-6.2L3 11l6.2-1.8z", "M19 2.5v4M17 4.5h4"]);
export const Clock = kashi("clock", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 7.5V12l3 2"]);
export const Clock3 = kashi("clock-3", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 7.5V12h4"]);
export const AlarmClock = kashi("alarm-clock", ["M8.5 5h7l4 4v6l-4 4h-7l-4-4V9z", "M12 9v3.5l2 1.5", "M3 5.5 5.5 3M21 5.5 18.5 3"]);
export const Timer = kashi("timer", ["M8.5 6h7l4 4v6l-4 4h-7l-4-4v-6z", "M10 2.5h4", "M12 9.5v3.5"]);
export const Hourglass = kashi("hourglass", ["M6 3h12", "M6 21h12", "M7 3v3l5 6-5 6v3", "M17 3v3l-5 6 5 6v3"]);
export const UtensilsCrossed = kashi("utensils-crossed", ["M6 3v6l2 2v10", "M10 3v6l-2 2", "M8 3v5", "M17 21V3l-3 4v7h3"]);
export const Utensils = kashi("utensils", ["M6 3v6l2 2v10", "M10 3v6l-2 2", "M8 3v5", "M17 21V3l-3 4v7h3"]);
export const ChefHat = kashi("chef-hat", ["M6 14v6h12v-6", "M6 14l-2.5-2.5V8L6 5.5h2.5L10 4h4l1.5 1.5H18L20.5 8v3.5L18 14z", "M6 17h12"]);
export const Coffee = kashi("coffee", ["M5 8h12v8l-3 3H8l-3-3z", "M17 10h2l1.5 1.5v1L19 14h-2", "M8 3.5v2M11 3.5v2M14 3.5v2"]);
export const Wine = kashi("wine", ["M7 3h10l-1 6-4 3-4-3z", "M12 12v8", "M8 21h8"]);
export const ReceiptText = kashi("receipt-text", ["M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z", "M8.5 8h7M8.5 12h7M8.5 16h4"]);
export const Receipt = kashi("receipt", ["M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z", "M8.5 8h7M8.5 12h7"]);
export const Wallet = kashi("wallet", ["M4 8l2-2h12l2 2v10l-2 2H6l-2-2z", "M20 11h-4l-1.5 1.5L16 14h4"]);
export const Phone = kashi("phone", ["M5 4h4l1.5 4.5-2.5 2 5.5 5.5 2-2.5L20 15v4l-1 1h-2L4 7V5z"]);
export const Smartphone = kashi("smartphone", ["M8 2.5h8l1.5 1.5v16L16 21.5H8L6.5 20V4z", "M11 18.5h2"]);
export const ConciergeBell = kashi("concierge-bell", ["M6 18l1-3.5 2.5-2.5h5l2.5 2.5 1 3.5", "M4 18h16", "M12 9.5V8", "M10.5 8h3"]);
export const Bell = kashi("bell", ["M6 17v-6l2-4 2.5-2h3L16 7l2 4v6", "M4 17h16", "M10 20.5h4"]);
export const BellRing = kashi("bell-ring", ["M6 17v-6l2-4 2.5-2h3L16 7l2 4v6", "M4 17h16", "M10 20.5h4", "M2.5 8 4 6M21.5 8 20 6"]);
export const BellOff = kashi("bell-off", ["M6 17v-6l2-4 2.5-2h3L16 7l2 4v6", "M4 17h16", "M10 20.5h4", "M4 4l16 16"]);
export const LayoutGrid = kashi("layout-grid", ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h6v6h-6z"]);
export const LayoutDashboard = kashi("layout-dashboard", ["M4 4h7v9H4z", "M13 4h7v5h-7z", "M13 11h7v9h-7z", "M4 15h7v5H4z"]);
export const MapPin = kashi("map-pin", ["M12 21l-6-8V8l3-4h6l3 4v5z", "M12 8l2 2-2 2-2-2z"]);
export const Printer = kashi("printer", ["M7 8V3.5h10V8", "M5 17H3.5V10l2-2h13l2 2v7H19", "M7 14h10v6.5H7z"]);
export const KeyRound = kashi("key-round", ["M4 9h6v6H4z", "M7 7.8 11.2 12 7 16.2 2.8 12z", "M11 12h10", "M18 12v3M15.5 12v2"]);
export const CalendarDays = kashi("calendar-days", ["M6 5h12l2 2v12l-2 2H6l-2-2V7z", "M4 10h16", "M8 3v4M16 3v4", "M12 13.5l1.5 1.5-1.5 1.5-1.5-1.5z"]);
export const CalendarCheck = kashi("calendar-check", ["M6 5h12l2 2v12l-2 2H6l-2-2V7z", "M4 10h16", "M8 3v4M16 3v4", "M9 15l2 2 4-4"]);
export const CalendarPlus = kashi("calendar-plus", ["M6 5h12l2 2v12l-2 2H6l-2-2V7z", "M4 10h16", "M8 3v4M16 3v4", "M12 13v5M9.5 15.5h5"]);
export const CalendarRange = kashi("calendar-range", ["M6 5h12l2 2v12l-2 2H6l-2-2V7z", "M4 10h16", "M8 3v4M16 3v4", "M7.5 14h9M7.5 17h5"]);
export const CalendarClock = kashi("calendar-clock", ["M6 5h12l2 2v12l-2 2H6l-2-2V7z", "M4 10h16", "M8 3v4M16 3v4", "M12 13v2.5l1.5 1.5"]);
export const Flame = kashi("flame", ["M12 21l-5-3v-5l3-4 1 3 2-3V4l5 6v8z"]);
export const Store = kashi("store", ["M3.5 9 5 4h14l1.5 5", "M3.5 9h17", "M5 9v11h14V9", "M9.5 20v-5h5v5"]);
export const TrendingUp = kashi("trending-up", ["M3 17l6-6 4 4 8-8", "M15 7h6v6"]);
export const TrendingDown = kashi("trending-down", ["M3 7l6 6 4-4 8 8", "M15 17h6v-6"]);
export const CreditCard = kashi("credit-card", ["M4 6h16l1 1v10l-1 1H4l-1-1V7z", "M3 10h18", "M6.5 14.5h4"]);
export const SprayCan = kashi("spray-can", ["M18 3l-7 7", "M11 10l3 3-1 1-4 7-6-6 7-4z", "M6 18l2-2M8.5 20.5l2-2"]);
export const Building2 = kashi("building-2", ["M5 21V5l2-2h7l2 2v16", "M16 9h3l1 1v11", "M3 21h18", "M8.5 7h3M8.5 11h3M8.5 15h3"]);
export const Hotel = kashi("hotel", ["M5 21V5l2-2h10l2 2v16", "M3 21h18", "M10 21v-4h4v4", "M8.5 7h1M14.5 7h1M8.5 11h1M14.5 11h1"]);
export const ShieldCheck = kashi("shield-check", ["M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z", "M8.5 12l2.5 2.5 4.5-4.5"]);
export const Shield = kashi("shield", ["M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z"]);
export const ShieldAlert = kashi("shield-alert", ["M12 3l8 3v6l-3 6-5 3-5-3-3-6V6z", "M12 8v4.5", "M12 15.5v.5"]);
export const Globe = kashi("globe", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M3.5 12h17", "M12 3.5 9 8v8l3 4.5 3-4.5V8z"]);
export const QrCode = kashi("qr-code", ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M17 14l3 3-3 3-3-3z"]);
export const Calculator = kashi("calculator", ["M6 3h12l1 1v16l-1 1H6l-1-1V4z", "M8 6.5h8v3.5H8z", "M8.5 14h1M12 14h1M15 14h.5M8.5 17.5h1M12 17.5h1M15 17.5h.5"]);
export const Percent = kashi("percent", ["M19 5 5 19", "M7 4.5l2.5 2.5L7 9.5 4.5 7z", "M17 14.5l2.5 2.5-2.5 2.5-2.5-2.5z"]);
export const Eye = kashi("eye", ["M2.5 12 7 6.5h10l4.5 5.5-4.5 5.5H7z", "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z"]);
export const EyeOff = kashi("eye-off", ["M2.5 12 7 6.5h10l4.5 5.5-4.5 5.5H7z", "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z", "M4 4l16 16"]);
export const Lock = kashi("lock", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 3v4"]);
export const LockOpen = kashi("lock-open", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 2"]);
export const Unlock = kashi("unlock", ["M6 11h12l1 1v8l-1 1H6l-1-1v-8z", "M8 11V7l2-3h4l2 2"]);
export const ChartColumn = kashi("chart-column", ["M5 20v-7l1.5-1.5L8 13v7", "M10.5 20V8l1.5-1.5L13.5 8v12", "M16 20v-9l1.5-1.5L19 11v9", "M3 20h18"]);
export const BarChart3 = kashi("bar-chart-3", ["M5 20v-7l1.5-1.5L8 13v7", "M10.5 20V8l1.5-1.5L13.5 8v12", "M16 20v-9l1.5-1.5L19 11v9", "M3 20h18"]);
export const ChartSpline = kashi("chart-spline", ["M3 20h18", "M4 16l4-5 4 3 4-6 4-3"]);
export const LogOut = kashi("log-out", ["M10 4H5l-1 1v14l1 1h5", "M9 12h11", "M16 8l4 4-4 4"]);
export const LogIn = kashi("log-in", ["M14 4h5l1 1v14l-1 1h-5", "M4 12h11", "M11 8l4 4-4 4"]);
export const Headset = kashi("headset", ["M4 14v-3l2-5 3-2h6l3 2 2 5v3", "M4 14h3v6H5l-1-1z", "M20 14h-3v6h2l1-1z"]);
export const MessageCircle = kashi("message-circle", ["M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z"]);
export const MessageSquare = kashi("message-square", ["M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z"]);
export const MessageSquareText = kashi("message-square-text", ["M5 5h14l2 2v8l-2 2h-8l-4 3v-3H5l-2-2V7z", "M7.5 9.5h9M7.5 12.5h6"]);
export const MessagesSquare = kashi("messages-square", ["M8 8h12l1.5 1.5v7L20 18h-2v3l-3.5-3H9.5L8 16.5z", "M4 13V4h12"]);
export const Send = kashi("send", ["M21 3 3 10.5l7 3 3 7z", "M10 13.5 21 3"]);
export const SendHorizontal = kashi("send-horizontal", ["M21 3 3 10.5l7 3 3 7z", "M10 13.5 21 3"]);
export const Inbox = kashi("inbox", ["M4 13l3-8h10l3 8v6l-1 1H5l-1-1z", "M4 13h5l1.5 2.5h3L15 13h5"]);
export const Download = kashi("download", ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"]);
export const FileDown = kashi("file-down", ["M6 3h8l5 5v12l-1 1H6l-1-1V4z", "M12 10v7", "M9 14l3 3 3-3"]);
export const ArrowDownToLine = kashi("arrow-down-to-line", ["M12 4v11", "M7 10l5 5 5-5", "M4 20h16"]);
export const Upload = kashi("upload", ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"]);
export const ArrowUpFromLine = kashi("arrow-up-from-line", ["M12 20V9", "M7 14l5-5 5 5", "M4 4h16"]);
export const FileText = kashi("file-text", ["M6 3h8l5 5v12l-1 1H6l-1-1V4z", "M14 3v5h5", "M8.5 13h7M8.5 16.5h5"]);
export const Info = kashi("info", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 11v5.5", "M12 7.5v.5"]);
export const CircleAlert = kashi("circle-alert", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M12 7.5v5.5", "M12 16v.5"]);
export const AlertTriangle = kashi("alert-triangle", ["M12 3.5 21.5 20h-19z", "M12 9.5v5", "M12 17v.5"]);
export const TriangleAlert = kashi("triangle-alert", ["M12 3.5 21.5 20h-19z", "M12 9.5v5", "M12 17v.5"]);
export const CircleCheck = kashi("circle-check", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M8 12.5l2.5 2.5 5.5-5.5"]);
export const CheckCircle2 = kashi("check-circle-2", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M8 12.5l2.5 2.5 5.5-5.5"]);
export const XCircle = kashi("x-circle", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M9 9l6 6M15 9l-6 6"]);
export const Ban = kashi("ban", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M6.5 6.5l11 11"]);
export const CircleOff = kashi("circle-off", ["M8.5 3.5h7l5 5v7l-5 5h-7l-5-5v-7z", "M4 4l16 16"]);
export const Wifi = kashi("wifi", ["M2.5 9l4-3h11l4 3", "M6 12.5l2.5-2h7l2.5 2", "M9.5 16l1-1h3l1 1", "M12 19l.8.8-.8.8-.8-.8z"]);
export const WifiOff = kashi("wifi-off", ["M2.5 9l4-3h11l4 3", "M6 12.5l2.5-2h7l2.5 2", "M9.5 16l1-1h3l1 1", "M12 19l.8.8-.8.8-.8-.8z", "M4 3l16 18"]);
export const Mail = kashi("mail", ["M4 5h16l1 1v12l-1 1H4l-1-1V6z", "M3 6.5l9 6.5 9-6.5"]);
export const Settings = kashi("settings", ["M6 6h12v12H6z", "M12 3.5 20.5 12 12 20.5 3.5 12z", "M12 10l2 2-2 2-2-2z"]);
export const Settings2 = kashi("settings-2", ["M6 6h12v12H6z", "M12 3.5 20.5 12 12 20.5 3.5 12z", "M12 10l2 2-2 2-2-2z"]);
export const Ticket = kashi("ticket", ["M3 6h18v4l-1.5 2L21 14v4H3v-4l1.5-2L3 10z", "M14.5 6v2M14.5 11v2M14.5 16v2"]);
export const Crown = kashi("crown", ["M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"]);
export const Gauge = kashi("gauge", ["M3.5 17v-3.5l2.5-5L9 6h6l3 2.5 2.5 5V17", "M12 17l3.5-6", "M3.5 17h17"]);
export const Banknote = kashi("banknote", ["M3 6h18v12H3z", "M12 9.5l2.5 2.5-2.5 2.5L9.5 12z", "M6 9v6M18 9v6"]);
export const Heart = kashi("heart", ["M12 20 4 12V7.5L7 4.5h2.5L12 7l2.5-2.5H17l3 3V12z"]);
export const ShoppingBag = kashi("shopping-bag", ["M5 8h14l-1 12H6z", "M9 8V6l1.5-2h3L15 6v2"]);
export const Package = kashi("package", ["M12 3l8 4.5v9L12 21l-8-4.5v-9z", "M4 7.5l8 4.5 8-4.5", "M12 12v9"]);
export const Power = kashi("power", ["M12 3v8", "M7 6 4.5 9.5v5l3.5 5h8l3.5-5v-5L17 6"]);
export const Home = kashi("home", ["M4 21V10l8-6 8 6v11z", "M9.5 21v-4l2.5-3 2.5 3v4"]);
export const House = kashi("house", ["M4 21V10l8-6 8 6v11z", "M9.5 21v-4l2.5-3 2.5 3v4"]);
export const Tags = kashi("tags", ["M3.5 3.5H11l9.5 9.5-7.5 7.5L3.5 11z", "M7.5 7l1 1-1 1-1-1z"]);
export const Tag = kashi("tag", ["M3.5 3.5H11l9.5 9.5-7.5 7.5L3.5 11z", "M7.5 7l1 1-1 1-1-1z"]);
export const Bot = kashi("bot", ["M5 9h14l1 1v8l-1 1H5l-1-1v-8z", "M12 9V5", "M10.5 4h3", "M9 13l1 1-1 1-1-1zM15 13l1 1-1 1-1-1z"]);
export const Activity = kashi("activity", ["M3 12h4l3-7 4 14 3-7h4"]);
export const Play = kashi("play", ["M7 4.5l12 7.5-12 7.5z"]);
export const Pause = kashi("pause", ["M7 5h3v14H7z", "M14 5h3v14h-3z"]);
export const ImagePlus = kashi("image-plus", ["M4 5h11", "M4 5v14h16v-6", "M4 16l5-5 4 4 3-3 4 4", "M19 3v6M16 6h6"]);
export const Landmark = kashi("landmark", ["M3 9.5 12 4l9 5.5", "M3.5 20.5h17", "M5.5 10v8M10 10v8M14 10v8M18.5 10v8"]);
export const MoreHorizontal = kashi("more-horizontal", ["M5 11l1 1-1 1-1-1z", "M12 11l1 1-1 1-1-1z", "M19 11l1 1-1 1-1-1z"]);
export const MoreVertical = kashi("more-vertical", ["M12 4l1 1-1 1-1-1z", "M12 11l1 1-1 1-1-1z", "M12 18l1 1-1 1-1-1z"]);
export const Zap = kashi("zap", ["M13 3 5 13h6l-1 8 8-10h-6z"]);
