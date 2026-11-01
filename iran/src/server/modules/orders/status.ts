/** Kitchen/floor workflow. Payment is tracked separately (orders.payment_status). */
export const KITCHEN_FLOW = ["received", "accepted", "preparing", "ready", "served"] as const;
export type OrderStatus = "pending_payment" | (typeof KITCHEN_FLOW)[number] | "cancelled";

export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  "pending_payment",
  "received",
  "accepted",
  "preparing",
  "ready",
];

/**
 * Allowed moves: forward along the kitchen flow (steps may be skipped, e.g. a drink goes
 * straight from "received" to "served"), cancellation before service, and
 * pending_payment → received once paid.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (to === "cancelled") return from !== "served" && from !== "cancelled";
  if (from === "pending_payment") return to === "received";
  const i = KITCHEN_FLOW.indexOf(from as (typeof KITCHEN_FLOW)[number]);
  const j = KITCHEN_FLOW.indexOf(to as (typeof KITCHEN_FLOW)[number]);
  return i >= 0 && j > i;
}

/** The single "next" action shown on a kitchen card. */
export function nextStatus(from: OrderStatus): OrderStatus | null {
  if (from === "pending_payment") return null;
  const i = KITCHEN_FLOW.indexOf(from as (typeof KITCHEN_FLOW)[number]);
  return i >= 0 && i < KITCHEN_FLOW.length - 1 ? KITCHEN_FLOW[i + 1]! : null;
}

/** Timestamp column set when an order reaches a status. */
export const STATUS_TIMESTAMP = {
  accepted: "acceptedAt",
  preparing: "preparingAt",
  ready: "readyAt",
  served: "servedAt",
  cancelled: "cancelledAt",
} as const;
