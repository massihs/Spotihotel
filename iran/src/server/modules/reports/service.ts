import { and, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { auditLogs, expenses, orderItems, orders, payments, purchases, users } from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { productCosts } from "@/server/modules/inventory/service";

export type Range = { from: Date; to: Date };

const num = (s: ReturnType<typeof sql<number>>) => s.mapWith(Number);
const sum = (c: unknown) => num(sql<number>`coalesce(sum(${c}), 0)`);
const count = () => num(sql<number>`count(*)`);

/** Orders that count as sales: placed in the range, not cancelled, not waiting for payment. */
const salesWhere = (rid: string, r: Range) =>
  and(
    eq(orders.restaurantId, rid),
    gte(orders.placedAt, r.from),
    lt(orders.placedAt, r.to),
    notInArray(orders.status, ["cancelled", "pending_payment"]),
  );

/** Sales, payments, products and cost of goods for a period (accrual: by order date). */
export async function salesReport(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const rid = ctx.restaurant.id;
  const tz = ctx.restaurant.timezone;
  const local = sql`(${orders.placedAt} at time zone ${tz})`;
  const where = salesWhere(rid, r);

  const [summary, cancelled, daily, hourly, channels, methods, items, costs] = await Promise.all([
    db
      .select({
        orders: count(),
        subtotalCents: sum(orders.subtotalCents),
        discountCents: sum(orders.discountCents),
        taxCents: sum(orders.taxCents),
        totalCents: sum(orders.totalCents),
        paidCents: sum(sql`case when ${orders.paymentStatus} = 'paid' then ${orders.totalCents} else 0 end`),
      })
      .from(orders)
      .where(where)
      .then((x) => x[0]!),
    db
      .select({ orders: count(), totalCents: sum(orders.totalCents) })
      .from(orders)
      .where(
        and(
          eq(orders.restaurantId, rid),
          gte(orders.placedAt, r.from),
          lt(orders.placedAt, r.to),
          eq(orders.status, "cancelled"),
        ),
      )
      .then((x) => x[0]!),
    db
      .select({
        day: sql<string>`to_char(${local}, 'YYYY-MM-DD')`,
        orders: count(),
        totalCents: sum(orders.totalCents),
      })
      .from(orders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ hour: num(sql<number>`extract(hour from ${local})::int`), orders: count() })
      .from(orders)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        channel: orders.channel,
        pos: sql<boolean>`${orders.createdByUserId} is not null`,
        orders: count(),
        totalCents: sum(orders.totalCents),
      })
      .from(orders)
      .where(where)
      .groupBy(orders.channel, sql`2`),
    db
      .select({
        provider: payments.provider,
        count: count(),
        amountCents: sum(sql`${payments.amountCents} - ${payments.refundedCents}`),
        refundedCents: sum(payments.refundedCents),
      })
      .from(payments)
      .where(
        and(
          eq(payments.restaurantId, rid),
          sql`${payments.status} in ('succeeded', 'partially_refunded', 'refunded')`,
          gte(payments.succeededAt, r.from),
          lt(payments.succeededAt, r.to),
        ),
      )
      .groupBy(payments.provider)
      .orderBy(desc(sql`3`)),
    db
      .select({
        productId: orderItems.productId,
        name: orderItems.productName,
        category: orderItems.categoryName,
        quantity: sum(orderItems.quantity),
        revenueCents: sum(orderItems.lineTotalCents),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(where)
      .groupBy(orderItems.productId, orderItems.productName, orderItems.categoryName)
      .orderBy(desc(sql`5`)),
    productCosts(db, rid),
  ]);

  // Line totals are before the order-level discount: spread it proportionally.
  const linesTotal = items.reduce((s, i) => s + i.revenueCents, 0);
  const ratio = linesTotal > 0 ? summary.totalCents / linesTotal : 1;
  let cogsCents = 0;
  let costedRevenue = 0;
  const products = items.map((i) => {
    const unitCost = i.productId ? costs.get(i.productId) : undefined;
    const cost = unitCost != null ? unitCost * i.quantity : null;
    const revenue = Math.round(i.revenueCents * ratio);
    if (cost != null) {
      cogsCents += cost;
      costedRevenue += revenue;
    }
    return { ...i, revenueCents: revenue, costCents: cost };
  });
  const byCategory = new Map<string, { name: string; quantity: number; revenueCents: number }>();
  for (const p of products) {
    const name = p.category ?? "—";
    const c = byCategory.get(name) ?? { name, quantity: 0, revenueCents: 0 };
    c.quantity += p.quantity;
    c.revenueCents += p.revenueCents;
    byCategory.set(name, c);
  }

  return {
    summary: {
      ...summary,
      netCents: summary.totalCents - summary.taxCents,
      avgTicketCents: summary.orders ? Math.round(summary.totalCents / summary.orders) : 0,
      cancelledOrders: cancelled.orders,
      cancelledCents: cancelled.totalCents,
    },
    daily,
    hourly,
    channels: channels.map((c) => ({
      key: c.pos ? (c.channel === "takeaway" ? "pos_takeaway" : "pos_table") : "qr",
      orders: c.orders,
      totalCents: c.totalCents,
    })),
    methods,
    products,
    categories: [...byCategory.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    cogs: {
      cents: cogsCents,
      /** Share of revenue whose cost is known (dishes with a recipe). */
      coverage: summary.totalCents > 0 ? costedRevenue / summary.totalCents : 0,
    },
  };
}
export type SalesReport = Awaited<ReturnType<typeof salesReport>>;

// ─── Expenses ────────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "rent",
  "salaries",
  "utilities",
  "supplies",
  "marketing",
  "maintenance",
  "taxes",
  "other",
] as const;

export const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amountCents: z.coerce.number().int().min(1).max(MAX_AMOUNT_CENTS),
  description: z.string().trim().max(500).default(""),
  method: z.enum(["cash", "card", "transfer"]).default("cash"),
  paidAt: z.coerce.date().optional(),
});

export async function createExpense(
  db: Database,
  ctx: RestaurantContext,
  raw: z.input<typeof expenseSchema>,
) {
  assertCan(ctx, "accounting.manage");
  const input = expenseSchema.parse(raw);
  const [e] = await db
    .insert(expenses)
    .values({
      restaurantId: ctx.restaurant.id,
      category: input.category,
      amountCents: input.amountCents,
      description: input.description || null,
      method: input.method,
      paidAt: input.paidAt ?? new Date(),
      createdByUserId: ctx.user.id,
    })
    .returning();
  await recordAudit(db, {
    action: "expense.created",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "expense",
    entityId: e!.id,
    metadata: { category: e!.category, amountCents: e!.amountCents },
  });
  return e!;
}

export async function deleteExpense(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "accounting.manage");
  if (!isUuid(id)) throw notFound();
  const res = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.restaurantId, ctx.restaurant.id)))
    .returning();
  if (!res.length) throw notFound();
  await recordAudit(db, {
    action: "expense.deleted",
    actorUserId: ctx.user.id,
    restaurantId: ctx.restaurant.id,
    entityType: "expense",
    entityId: id,
    metadata: { category: res[0]!.category, amountCents: res[0]!.amountCents },
  });
}

export async function listExpenses(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.restaurantId, ctx.restaurant.id),
        gte(expenses.paidAt, r.from),
        lt(expenses.paidAt, r.to),
      ),
    )
    .orderBy(desc(expenses.paidAt));
}

// ─── Profit & loss ───────────────────────────────────────────────────────────

/**
 * Simplified P&L: net sales (VAT excluded) − cost of dishes sold (recipes × average cost)
 * − operating expenses. Stock purchases are shown as cash out, not as a cost (the cost is
 * recognised when the dish is sold).
 */
export async function profitAndLoss(db: DbOrTx, ctx: RestaurantContext, r: Range) {
  assertCan(ctx, "accounting.manage");
  const [sales, exp, bought] = await Promise.all([
    salesReport(db, ctx, r),
    listExpenses(db, ctx, r),
    db
      .select({ totalCents: sum(purchases.totalCents), count: count() })
      .from(purchases)
      .where(
        and(
          eq(purchases.restaurantId, ctx.restaurant.id),
          gte(purchases.purchasedAt, r.from),
          lt(purchases.purchasedAt, r.to),
        ),
      )
      .then((x) => x[0]!),
  ]);
  const byCategory = new Map<string, number>();
  for (const e of exp) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  const expensesCents = exp.reduce((s, e) => s + e.amountCents, 0);
  const netSales = sales.summary.totalCents - sales.summary.taxCents;
  const gross = netSales - sales.cogs.cents;
  return {
    sales,
    expenses: exp,
    purchases: bought,
    pnl: {
      revenueCents: sales.summary.totalCents,
      taxCents: sales.summary.taxCents,
      netSalesCents: netSales,
      cogsCents: sales.cogs.cents,
      grossCents: gross,
      expensesCents,
      expensesByCategory: [...byCategory.entries()]
        .map(([category, cents]) => ({ category, cents }))
        .sort((a, b) => b.cents - a.cents),
      netCents: gross - expensesCents,
      marginPct: netSales > 0 ? ((gross - expensesCents) / netSales) * 100 : 0,
    },
  };
}

// ─── Security review (گزارش مرور امنیت) ──────────────────────────────────────

/** Actions a manager reviews: cancellations, discounts, refunds, cash, price and stock edits… */
export const SENSITIVE_ACTIONS = [
  "order.cancelled",
  "order.pos_created",
  "payment.refunded",
  "payment.cancelled",
  "payment.recorded",
  "cash.shift_closed",
  "delivery.courier_settled",
  "customer.credit_limit_set",
  "customer.account_repaid",
  "product.updated",
  "product.deleted",
  "expense.deleted",
  "table_session.moved",
  "member.added",
  "member.removed",
  "member.updated",
  "restaurant.payment_settings_updated",
] as const;

export async function listSecurityEvents(db: DbOrTx, ctx: RestaurantContext, r: Range, action?: string) {
  assertCan(ctx, "audit.view");
  const actions = (SENSITIVE_ACTIONS as readonly string[]).includes(action ?? "")
    ? [action!]
    : [...SENSITIVE_ACTIONS];
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorType: auditLogs.actorType,
      actorName: users.fullName,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.restaurantId, ctx.restaurant.id),
        inArray(auditLogs.action, actions),
        gte(auditLogs.createdAt, r.from),
        lt(auditLogs.createdAt, r.to),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(500);
  // POS sales only matter here when a discount was given.
  return rows.filter((e) => e.action !== "order.pos_created" || Number(e.metadata.discountCents ?? 0) > 0);
}
