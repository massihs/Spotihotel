"use client";

import { formatMoney } from "@/lib/money";
import { useTranslations, useLocale } from "next-intl";
import { TimeAgo } from "@/components/ui/time-ago";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, Ban, Clock, MessageSquareText, Phone, Timer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CollectPaymentDialog } from "@/components/dashboard/payment-dialogs";
import { cn } from "@/lib/cn";
import { nextStatus, type OrderStatus } from "@/server/modules/orders/status";
import { updateOrderStatusAction } from "@/app/[locale]/dashboard/[restaurantId]/orders/actions";
import { blockGuestAction } from "@/app/[locale]/dashboard/[restaurantId]/security-actions";

export type OrderCardData = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: string;
  tableLabel: string | null;
  /** "room" for room service in a hotel. */
  placeKind?: string | null;
  totalCents: number;
  currency: string;
  note: string | null;
  placedAt: Date;
  /** When it was ready / served: the kitchen time is frozen at that moment. */
  readyAt?: Date | null;
  servedAt?: Date | null;
  customerPhone?: string | null;
  participantSeq: number | null;
  participantName: string | null;
  channel?: string;
  items: {
    id: string;
    categoryId?: string | null;
    /** Station the line was sent to (fixed when ordered). */
    stationId?: string | null;
    quantity: number;
    productName: string;
    options: { valueName: string }[];
    note: string | null;
  }[];
};

/** Status → dot colour + soft chip background. */
const TONE: Record<OrderStatus, { dot: string; chip: string }> = {
  pending_payment: { dot: "bg-fg-subtle", chip: "bg-surface-2 text-fg-muted" },
  received: { dot: "bg-accent", chip: "bg-accent-soft text-accent-text" },
  accepted: { dot: "bg-warning", chip: "bg-warning-soft text-fg" },
  preparing: { dot: "bg-warning", chip: "bg-warning-soft text-fg" },
  ready: { dot: "bg-success", chip: "bg-success-soft text-success" },
  served: { dot: "bg-fg-subtle", chip: "bg-surface-2 text-fg-muted" },
  cancelled: { dot: "bg-danger", chip: "bg-danger-soft text-danger" },
};

export function OrderCard({
  restaurantId,
  order: o,
  canUpdate,
  canCancel,
  timeZone,
  compact = false,
  collectMethods,
}: {
  restaurantId: string;
  order: OrderCardData;
  canUpdate: boolean;
  canCancel: boolean;
  timeZone: string;
  /** Payment methods the staff can collect with (orders page): unpaid orders get a "Collect" button. */
  collectMethods?: string[];
  /** Kitchen columns: the column already names the status, so drop the chip. */
  compact?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = nextStatus(o.status);
  const who = o.participantName ?? (o.participantSeq ? t("orders.client", { n: o.participantSeq }) : null);

  const move = (to: OrderStatus, reason?: string) =>
    startTransition(async () => {
      const res = await updateOrderStatusAction(restaurantId, o.id, to, reason);
      if (res && !res.ok) {
        setError(t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"));
        if (res.error === "status_changed" || res.error === "invalid_transition") router.refresh();
      } else setError(null);
    });

  const block = () => {
    if (!window.confirm(t("orders.blockConfirm", { number: o.number }))) return;
    const reason = window.prompt(t("orders.blockReason")) ?? "";
    startTransition(async () => {
      const res = await blockGuestAction(restaurantId, { orderId: o.id }, reason);
      if (res && !res.ok) {
        setError(t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"));
      } else setError(null);
      router.refresh();
    });
  };

  const tone = TONE[o.status];
  const isNew = o.status === "received" || o.status === "pending_payment";
  const [now, setNow] = useState(() => Date.now());
  // The kitchen screen shows a running stopwatch (every second); other screens update each 30 s.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), compact ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [compact]);
  // Waiting time while the order is still in the works: green, then orange after 10 min, red after 20.
  const active = ["received", "accepted", "preparing", "pending_payment"].includes(o.status);
  const finishedAt = o.readyAt ?? o.servedAt;
  const end = active || !finishedAt ? now : new Date(finishedAt).getTime();
  const elapsed = Math.max(0, end - new Date(o.placedAt).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  const urgency = !active ? null : minutes >= 20 ? "late" : minutes >= 10 ? "warn" : "ok";
  const paid = o.paymentStatus === "paid";
  // The kitchen reads the card from a distance and does not care about money.
  const kitchen = compact;
  const clock = (() => {
    const total = Math.floor(elapsed / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (h >= 10) return `${h}h`;
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  })();
  const timer = kitchen ? (
    active ? (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-black whitespace-nowrap tabular-nums",
          urgency === "late"
            ? "animate-pulse bg-danger text-white"
            : urgency === "warn"
              ? "bg-warning text-white"
              : "bg-success text-white",
        )}
        title={t("kitchen.sincePlaced")}
      >
        <Timer className="size-4" aria-hidden="true" />
        <bdi dir="ltr" suppressHydrationWarning>
          {clock}
        </bdi>
      </span>
    ) : finishedAt && (o.status === "ready" || o.status === "served") ? (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold whitespace-nowrap text-fg-muted tabular-nums"
        title={t("kitchen.totalTime")}
      >
        <Timer className="size-3.5" aria-hidden="true" />
        {t("kitchen.readyIn")}{" "}
        <bdi dir="ltr" suppressHydrationWarning>
          {clock}
        </bdi>
      </span>
    ) : null
  ) : urgency && minutes < 100 ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap tabular-nums",
        urgency === "late"
          ? "bg-danger text-white"
          : urgency === "warn"
            ? "bg-warning-soft text-warning"
            : "bg-success-soft text-success",
      )}
    >
      <Clock className="size-3" aria-hidden="true" />
      {/* Minutes since the order: the server's and the browser's clocks may differ by one. */}
      <span suppressHydrationWarning>{t("kitchen.waiting", { min: minutes })}</span>
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs whitespace-nowrap text-fg-subtle">
      <Clock className="size-3" aria-hidden="true" />
      <TimeAgo date={o.placedAt} timeZone={timeZone} />
    </span>
  );

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden transition-opacity",
        isNew && "border-accent ring-4 ring-accent/15",
        pending && "opacity-60",
      )}
    >
      {urgency ? (
        <span
          aria-hidden="true"
          className={cn(
            "h-1 w-full",
            urgency === "late" ? "bg-danger" : urgency === "warn" ? "bg-warning" : "bg-success",
          )}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid shrink-0 place-items-center overflow-hidden rounded-xl bg-accent-soft px-1 font-bold text-accent-text tabular-nums",
              kitchen ? "size-14" : "size-12",
              (o.tableLabel?.length ?? 0) > 3
                ? "text-[10px] leading-tight break-all"
                : kitchen
                  ? "text-2xl"
                  : "text-lg",
            )}
            aria-hidden="true"
          >
            {o.tableLabel ?? "—"}
          </span>
          <div className="min-w-0">
            <p className="text-lg leading-tight font-bold whitespace-nowrap tabular-nums">
              <bdi dir="ltr">#{o.number}</bdi>
            </p>
            <p className="truncate text-xs text-fg-muted">
              {o.tableLabel
                ? t(o.placeKind === "room" ? "orders.tableRoom" : "orders.table", { label: o.tableLabel })
                : "—"}
              {who ? ` · ${who}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {compact ? null : (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
                tone.chip,
              )}
            >
              <span className={cn("size-1.5 rounded-full", tone.dot)} aria-hidden="true" />
              {t(`orderStatus.${o.status}`)}
            </span>
          )}
          {isNew ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-0.5 text-[11px] font-bold text-white">
              <span className="size-1.5 animate-ping rounded-full bg-white" aria-hidden="true" />
              {t("orders.new")}
            </span>
          ) : null}
          {kitchen ? null : timer}
        </div>
      </div>
      {kitchen && timer ? <div className="flex items-center gap-2 px-4 pb-3">{timer}</div> : null}
      <ul
        className={cn(
          "mx-4 divide-y divide-border rounded-2xl bg-surface-2/70",
          kitchen ? "text-base" : "text-sm",
        )}
      >
        {o.items.map((i) => (
          <li key={i.id} className={cn("flex gap-3 px-3", kitchen ? "py-3" : "py-2.5")}>
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-lg bg-surface px-1 font-black tabular-nums shadow-[var(--shadow-soft)]",
                kitchen ? "h-8 min-w-8 text-base" : "h-6 min-w-6 text-xs",
                i.quantity > 1 && "bg-fg text-bg",
              )}
            >
              {i.quantity}
            </span>
            <span className="min-w-0 flex-1">
              <span className={kitchen ? "font-bold" : "font-semibold"}>{i.productName}</span>
              {i.options.length ? (
                <span className={cn("block text-fg-muted", kitchen ? "text-sm" : "text-xs")}>
                  {i.options.map((x) => x.valueName).join(" · ")}
                </span>
              ) : null}
              {i.note ? (
                <span
                  className={cn(
                    "mt-1 block w-fit rounded-md bg-warning-soft px-1.5 font-bold text-warning",
                    kitchen ? "text-sm" : "text-xs",
                  )}
                >
                  ↳ {i.note}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {o.customerPhone && !kitchen ? (
        <a
          href={`tel:${o.customerPhone}`}
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          className="mx-4 mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted"
        >
          <Phone className="size-3.5" aria-hidden="true" />
          {o.customerPhone}
        </a>
      ) : null}
      {o.note ? (
        <p className="mx-4 mt-2 flex gap-2 rounded-2xl bg-warning-soft px-3 py-2 text-sm">
          <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-bold">{t("orders.note")} : </span>
            {o.note}
          </span>
        </p>
      ) : null}
      {!kitchen ? (
        <div className="mt-auto flex items-center justify-between gap-2 px-4 pt-3">
          <p className="font-bold tabular-nums">{formatMoney(o.totalCents, o.currency, locale)}</p>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-bold",
              paid ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
            )}
          >
            {paid ? t("orders.paid") : t("orders.unpaid")}
          </span>
        </div>
      ) : null}
      {!kitchen && !paid && o.status !== "cancelled" && collectMethods?.length && o.totalCents > 0 ? (
        <div className="px-4 pt-3">
          <CollectPaymentDialog
            restaurantId={restaurantId}
            tableSessionId={null}
            participantId={null}
            orderId={o.id}
            amountCents={o.totalCents}
            currency={o.currency}
            methods={collectMethods}
            title={t("payments.collectOrder", { number: o.number })}
            variant="secondary"
            size="md"
          />
        </div>
      ) : null}
      <div className={cn("flex gap-2 p-4 pt-3", kitchen && "mt-auto")}>
        {canCancel && o.status !== "served" && o.status !== "cancelled" ? (
          <Button
            variant="secondary"
            size="md"
            disabled={pending}
            aria-label={t("orders.cancel")}
            title={t("orders.cancel")}
            className="shrink-0 px-3.5"
            onClick={() => {
              if (!window.confirm(t("orders.cancelConfirm", { number: o.number }))) return;
              const reason = window.prompt(t("orders.cancelReason")) ?? undefined;
              move("cancelled", reason || undefined);
            }}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {canCancel && !kitchen && o.participantSeq != null && isNew ? (
          <Button
            variant="secondary"
            size="md"
            disabled={pending}
            aria-label={t("orders.block")}
            title={t("orders.block")}
            className="shrink-0 px-3.5 text-danger"
            onClick={block}
          >
            <Ban className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
        {canUpdate && next ? (
          <Button
            size={kitchen ? "lg" : "md"}
            variant={next === "ready" ? "accent" : "primary"}
            disabled={pending}
            className="flex-1"
            onClick={() => move(next)}
          >
            {t(`orders.next.${next}`)}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
