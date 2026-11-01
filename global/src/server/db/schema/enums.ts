import { pgEnum } from "drizzle-orm/pg-core";

export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const restaurantStatus = pgEnum("restaurant_status", ["active", "suspended"]);
export const memberRole = pgEnum("member_role", ["owner", "admin", "staff"]);
export const memberStatus = pgEnum("member_status", ["active", "invited", "disabled"]);
export const orgRole = pgEnum("org_role", ["owner", "billing", "member"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

export const tableSessionStatus = pgEnum("table_session_status", ["open", "closed"]);

export const orderChannel = pgEnum("order_channel", ["dine_in", "takeaway", "delivery"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "received",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
]);
export const orderPaymentStatus = pgEnum("order_payment_status", [
  "unpaid",
  "pending",
  "paid",
  "partially_refunded",
  "refunded",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);
export const refundStatus = pgEnum("refund_status", ["pending", "succeeded", "failed"]);

export const complaintCategory = pgEnum("complaint_category", [
  "cold_food",
  "wrong_order",
  "service",
  "payment",
  "hygiene",
  "other",
]);
export const complaintStatus = pgEnum("complaint_status", ["new", "in_progress", "resolved", "closed"]);

export const emailStatus = pgEnum("email_status", ["pending", "sending", "sent", "failed"]);
