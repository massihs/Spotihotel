"use client";

import { Check, Copy, Flower2, Receipt, Sparkles, UtensilsCrossed, Wifi, Wine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { useDay } from "@/components/pms/kit";
import { WaiterCall, type CallOption } from "./waiter-call";

const TILE =
  "flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-surface p-3.5 text-start font-semibold shadow-[var(--shadow-soft)] transition active:scale-[0.98] hover:border-border-strong";
const ICON = "grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-[18px]";

/**
 * What a guest scanning the QR in their room needs first: the room and the day they leave, then
 * one tap to room service, the minibar, the spa, housekeeping and reception, the bill and the
 * Wi-Fi. The room service menu follows below.
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        {departure ? (
          <p className="text-sm text-fg-muted">
            {t("leaving", {
              day: day(departure, { weekday: "long", day: "numeric", month: "long" }),
              time: checkOutTime,
            })}
          </p>
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
        {wifi ? (
          <button
            type="button"
            onClick={() => setShowWifi((v) => !v)}
            aria-expanded={showWifi}
            className={cn(TILE, showWifi && "border-accent ring-2 ring-accent/30")}
          >
            <span className={ICON}>
              <Wifi />
            </span>
            {t("wifi")}
          </button>
        ) : null}
      </div>
      {wifi && showWifi ? (
        <div className="animate-pop-in rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
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
      <div id="room-service" className="scroll-mt-4" />
    </section>
  );
}

function CopyRow({
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
