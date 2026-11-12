"use client";

import {
  Check,
  ConciergeBell,
  Copy,
  Flower2,
  Receipt,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wine,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useDay } from "@/components/pms/kit";
import { WaiterCall, type CallOption } from "./waiter-call";

const TILE =
  "flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-3 text-center text-[13.5px] leading-tight font-semibold shadow-[var(--shadow-soft)] transition active:scale-[0.97] hover:border-border-strong";
const ICON =
  "grid size-10 place-items-center rounded-full bg-[var(--sidebar)] text-[var(--brass)] [&_svg]:size-[18px]";

/**
 * What a guest scanning the QR in their room needs first: the room and the day they leave, the
 * Wi-Fi in one tap, then room service, the minibar, the spa, housekeeping and reception, and the
 * bill. The room service menu follows below.
 */
export function RoomConcierge({
  room,
  departure,
  checkOutTime,
  wifi,
  calls,
}: {
  room: string;
  departure: string | null;
  checkOutTime: string;
  wifi: { name: string; password: string | null } | null;
  calls: CallOption[];
}) {
  const t = useTranslations("concierge");
  const day = useDay();
  const [showWifi, setShowWifi] = useState(false);
  return (
    <section aria-label={t("title")} className="mx-4 mt-3 space-y-3">
      <div className="sidebar-shade relative isolate overflow-hidden rounded-[26px] bg-[var(--sidebar)] p-5 text-[var(--sidebar-fg)] shadow-[var(--shadow-float)]">
        <span
          aria-hidden="true"
          className="texture-khatam texture-fade-corner [--tex-color:var(--brass)] [--tex-opacity:0.16] [--tex-size:56px]"
        />
        <span aria-hidden="true" className="texture-grain [--grain-opacity:0.12]" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -end-14 -top-16 size-48 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brass)_40%,transparent),transparent_70%)]"
        />
        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--brass)] ltr:tracking-[0.18em] ltr:uppercase">
              {t("title")}
            </p>
            <p className="font-display mt-1.5 text-[2.6rem] leading-none tabular-nums">{room}</p>
          </div>
          {departure ? (
            <p className="text-end text-sm leading-5 opacity-85">
              {t("leaving", {
                day: day(departure, { weekday: "long", day: "numeric", month: "long" }),
                time: checkOutTime,
              })}
            </p>
          ) : null}
        </div>
        {wifi ? (
          <button
            type="button"
            onClick={() => setShowWifi((v) => !v)}
            aria-expanded={showWifi}
            className="relative mt-4 flex w-full items-center gap-2.5 rounded-2xl bg-white/10 px-3.5 py-2.5 text-start text-sm ring-1 ring-white/15 transition hover:bg-white/15"
          >
            <Wifi className="size-[18px] shrink-0 text-[var(--brass)]" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-xs opacity-70">{t("wifi")}</span>
              <span className="block truncate font-semibold" dir="ltr">
                {wifi.name}
              </span>
            </span>
            <span className="rounded-full bg-[var(--brass)] px-3 py-1 text-xs font-bold text-[var(--sidebar)]">
              {showWifi ? t("hide") : t("password")}
            </span>
          </button>
        ) : null}
        {wifi && showWifi ? (
          <div className="animate-pop-in relative mt-2 rounded-2xl bg-surface p-3 text-fg">
            <CopyRow label={t("network")} value={wifi.name} copyLabel={t("copy")} copiedLabel={t("copied")} />
            {wifi.password ? (
              <CopyRow
                label={t("password")}
                value={wifi.password}
                copyLabel={t("copy")}
                copiedLabel={t("copied")}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <a href="#room-service" className={TILE}>
          <span className={ICON}>
            <UtensilsCrossed />
          </span>
          {t("roomService")}
        </a>
        <Link href="/table/stay#minibar" className={TILE}>
          <span className={ICON}>
            <Wine />
          </span>
          {t("minibar")}
        </Link>
        <Link href="/table/stay#spa" className={TILE}>
          <span className={ICON}>
            <Flower2 />
          </span>
          {t("spa")}
        </Link>
        {calls.length ? (
          <WaiterCall options={calls} room className={cn(TILE, "w-full")}>
            <span className={ICON}>
              <Sparkles />
            </span>
            {t("requests")}
          </WaiterCall>
        ) : null}
        <Link href="/table/stay#bill" className={TILE}>
          <span className={ICON}>
            <Receipt />
          </span>
          {t("bill")}
        </Link>
        <Link href="/table/stay" className={TILE}>
          <span className={ICON}>
            <ConciergeBell />
          </span>
          {t("myStay")}
        </Link>
      </div>
      <div id="room-service" className="scroll-mt-4" />
    </section>
  );
}

export function CopyRow({
  label,
  value,
  copyLabel,
  copiedLabel,
}: {
  label: string;
  value: string;
  copyLabel: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-fg-muted">{label}</p>
        <p className="truncate font-semibold select-all" dir="ltr">
          {value}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
            .catch(() => {})
        }
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-sm font-semibold ring-1 ring-border"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
