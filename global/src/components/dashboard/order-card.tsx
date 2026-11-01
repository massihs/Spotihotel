"use client";

import { useFormatter, useTranslations } from "next-intl";
import { TimeAgo } from "@/components/ui/time-ago";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { nextStatus, type OrderStatus } from "@/server/modules/orders/status";
import { updateOrderStatusAction } from "@/app/[locale]/dashboard/[restaurantId]/orders/actions";

export type OrderCardData = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: string;
  tableLabel: string | null;
  totalCents: number;
  currency: string;
  note: string | null;
  placedAt: Date;
  participantSeq: number | null;
  participantName: string | null;
  items: {
    id: string;
    quantity: number;
    productName: string;
    options: { valueName: string }[];
    note: string | null;
  }[];
};

const TONE: Record<OrderStatus, string> = {
  pending_payment: "border-s-fg-subtle",
  received: "border-s-accent",
  accepted: "border-s-warning",
  preparing: "border-s-warning",
  ready: "border-s-success",
  served: "border-s-border-strong",
  cancelled: "border-s-danger",
};

export function OrderCard({
  restaurantId,
  order: o,
  canUpdate,
  canCancel,
  timeZone,
}: {
  restaurantId: string;
  order: OrderCardData;
  canUpdate: boolean;
  canCancel: boolean;
  timeZone: string;
}) {
  const t = useTranslations();
  const format = useFormatter();
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

  return (
    <Card className={cn("flex flex-col border-s-4", TONE[o.status], pending && "opacity-60")}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <p className="text-lg font-semibold tabular-nums">#{o.number}</p>
          <p className="text-sm text-fg-muted">
            {o.tableLabel ? t("orders.table", { label: o.tableLabel }) : "—"}
            {who ? ` · ${who}` : ""}
          </p>
        </div>
        <div className="text-end">
          <Badge tone={o.status === "ready" ? "success" : o.status === "cancelled" ? "danger" : "accent"}>
            {t(`orderStatus.${o.status}`)}
          </Badge>
          <p className="mt-1 text-xs text-fg-subtle">
            <TimeAgo date={o.placedAt} timeZone={timeZone} />
          </p>
        </div>
      </div>
      <ul className="space-y-1 px-4 py-3 text-sm">
        {o.items.map((i) => (
          <li key={i.id}>
            <span className="font-semibold tabular-nums">{i.quantity}×</span> {i.productName}
            {i.options.length ? (
              <span className="text-fg-muted"> · {i.options.map((x) => x.valueName).join(", ")}</span>
            ) : null}
            {i.note ? <span className="block ps-6 text-xs font-medium text-accent">↳ {i.note}</span> : null}
          </li>
        ))}
      </ul>
      {o.note ? (
        <p className="mx-4 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-sm">
          <span className="font-medium">{t("orders.note")} : </span>
          {o.note}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <p className="text-sm">
          <span className="font-semibold tabular-nums">
            {format.number(o.totalCents / 100, { style: "currency", currency: o.currency })}
          </span>{" "}
          <span className="text-xs text-fg-subtle">
            · {o.paymentStatus === "paid" ? t("orders.paid") : t("orders.unpaid")}
          </span>
        </p>
        <div className="flex gap-2">
          {canCancel && o.status !== "served" && o.status !== "cancelled" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(t("orders.cancelConfirm", { number: o.number }))) return;
                const reason = window.prompt(t("orders.cancelReason")) ?? undefined;
                move("cancelled", reason || undefined);
              }}
            >
              {t("orders.cancel")}
            </Button>
          ) : null}
          {canUpdate && next ? (
            <Button size="sm" disabled={pending} onClick={() => move(next)}>
              {t(`orders.next.${next}`)}
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
