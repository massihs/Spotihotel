import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  billingPayments,
  organizations,
  plans,
  restaurants,
  subscriptions,
  type PlanLimits,
} from "@/server/db/schema";
import { edition } from "@/config/edition";
import { recordAudit } from "@/server/audit";
import { env } from "@/server/env";
import { conflict, notFound, validation } from "@/server/errors";
import { zarinpalProvider } from "@/server/infra/payments/zarinpal";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid } from "@/lib/ids";
import { jalaliYear } from "@/lib/jalali";

/**
 * Spotifood's own subscriptions: restaurants pay the platform for their plan.
 *
 * Off until `BILLING_ZARINPAL_MERCHANT_ID` (Spotifood's Zarinpal merchant) is set: no trial,
 * no checkout, nothing changes for existing restaurants. Once it is set:
 * - a new organization starts a TRIAL_DAYS trial of TRIAL_PLAN;
 * - the owner pays 1, 3 or 12 months (12 = 10 months' price) from the dashboard;
 * - when a paid period or the trial ends, the restaurant keeps working on the Free plan's
 *   limits (soft block) and the dashboard shows a banner until it pays again.
 */
export const TRIAL_DAYS = 14;
export const TRIAL_PLAN = "professional";
export const BILLING_MONTHS = [1, 3, 12] as const;
const DAY = 86_400_000;

export const billingEnabled = () => Boolean(process.env.BILLING_ZARINPAL_MERCHANT_ID);
export const billingCurrency = () => edition.platformCurrency;

/** 12 months for the price of 10. */
export function priceFor(monthly: number, months: number) {
  return monthly * (months === 12 ? 10 : months);
}

export function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

/** Subscription a new organization starts with: a trial when billing is on, else Free. */
export async function startingSubscription(tx: DbOrTx, organizationId: string, now = new Date()) {
  if (billingEnabled()) {
    const [trial] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, TRIAL_PLAN)).limit(1);
    if (trial) {
      await tx.insert(subscriptions).values({
        organizationId,
        planId: trial.id,
        status: "trialing",
        currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * DAY),
      });
      return;
    }
  }
  const [free] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, "free")).limit(1);
  if (free) await tx.insert(subscriptions).values({ organizationId, planId: free.id, status: "active" });
}

type SubRow = {
  id: string;
  status: string;
  currentPeriodEnd: Date | null;
  planId: string;
  planCode: string;
  planName: string;
};

async function latestSubscription(db: DbOrTx, organizationId: string): Promise<SubRow | null> {
  const [row] = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      planId: subscriptions.planId,
      planCode: plans.code,
      planName: plans.name,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.organizationId, organizationId),
        inArray(subscriptions.status, ["trialing", "active", "past_due"]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

export type SubscriptionState =
  | { kind: "free" }
  | { kind: "trial"; planCode: string; planName: string; endsAt: Date; daysLeft: number }
  | { kind: "paid"; planCode: string; planName: string; endsAt: Date | null; daysLeft: number | null }
  | { kind: "expired"; planCode: string; planName: string; endedAt: Date; wasTrial: boolean };

export function stateOf(sub: SubRow | null, now = new Date()): SubscriptionState {
  if (!sub || sub.planCode === "free") return { kind: "free" };
  const end = sub.currentPeriodEnd;
  if (end && end.getTime() <= now.getTime()) {
    return {
      kind: "expired",
      planCode: sub.planCode,
      planName: sub.planName,
      endedAt: end,
      wasTrial: sub.status === "trialing",
    };
  }
  const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY)) : null;
  if (sub.status === "trialing" && end)
    return {
      kind: "trial",
      planCode: sub.planCode,
      planName: sub.planName,
      endsAt: end,
      daysLeft: daysLeft!,
    };
  return { kind: "paid", planCode: sub.planCode, planName: sub.planName, endsAt: end, daysLeft };
}

async function orgOf(db: DbOrTx, restaurantId: string) {
  const [r] = await db
    .select({ organizationId: restaurants.organizationId })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId));
  if (!r) throw notFound();
  return r.organizationId;
}

/** For the dashboard banner: only when something needs the owner's attention. */
export async function getSubscriptionNotice(db: DbOrTx, restaurantId: string, now = new Date()) {
  if (!billingEnabled()) return null;
  const state = stateOf(await latestSubscription(db, await orgOf(db, restaurantId)), now);
  if (state.kind === "expired") return state;
  if (state.kind === "trial") return state;
  if (state.kind === "paid" && state.daysLeft !== null && state.daysLeft <= 7) return state;
  return null;
}

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  priceMonthlyCents: number;
  limits: PlanLimits;
};

export async function listPublicPlans(db: DbOrTx): Promise<PublicPlan[]> {
  return db
    .select({
      id: plans.id,
      code: plans.code,
      name: plans.name,
      priceMonthlyCents: plans.priceMonthlyCents,
      limits: plans.limits,
    })
    .from(plans)
    .where(eq(plans.isPublic, true))
    .orderBy(asc(plans.sortOrder));
}

export async function getBillingView(db: Database, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const organizationId = await orgOf(db, ctx.restaurant.id);
  const [sub, available, history] = await Promise.all([
    latestSubscription(db, organizationId),
    listPublicPlans(db),
    db
      .select({
        id: billingPayments.id,
        status: billingPayments.status,
        provider: billingPayments.provider,
        months: billingPayments.months,
        amountCents: billingPayments.amountCents,
        currency: billingPayments.currency,
        invoiceNumber: billingPayments.invoiceNumber,
        periodStart: billingPayments.periodStart,
        periodEnd: billingPayments.periodEnd,
        paidAt: billingPayments.paidAt,
        createdAt: billingPayments.createdAt,
        planName: plans.name,
      })
      .from(billingPayments)
      .innerJoin(plans, eq(plans.id, billingPayments.planId))
      .where(and(eq(billingPayments.organizationId, organizationId), ne(billingPayments.status, "pending")))
      .orderBy(desc(billingPayments.createdAt))
      .limit(50),
  ]);
  return {
    enabled: billingEnabled(),
    currency: billingCurrency(),
    state: stateOf(sub),
    plans: available.filter((p) => p.priceMonthlyCents > 0),
    history,
  };
}

const checkoutSchema = z.object({
  planCode: z.string().min(1).max(32),
  months: z.coerce
    .number()
    .pipe(
      z.union(
        BILLING_MONTHS.map((m) => z.literal(m)) as [z.ZodLiteral<1>, z.ZodLiteral<3>, z.ZodLiteral<12>],
      ),
    ),
});

/** Owner starts paying: returns the Zarinpal page to send them to. */
export async function startCheckout(db: Database, ctx: RestaurantContext, raw: unknown) {
  assertCan(ctx, "restaurant.manage");
  if (!billingEnabled()) throw conflict("billing_disabled");
  const input = checkoutSchema.parse(raw);
  const [plan] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.code, input.planCode), eq(plans.isPublic, true)));
  if (!plan || plan.priceMonthlyCents <= 0) throw validation("plan_not_payable");
  const organizationId = await orgOf(db, ctx.restaurant.id);
  const currency = billingCurrency();
  const amountCents = priceFor(plan.priceMonthlyCents, input.months);
  const merchant = process.env.BILLING_ZARINPAL_MERCHANT_ID!;

  const [pay] = await db
    .insert(billingPayments)
    .values({
      organizationId,
      restaurantId: ctx.restaurant.id,
      planId: plan.id,
      months: input.months,
      amountCents,
      currency,
      provider: "zarinpal",
      createdByUserId: ctx.user.id,
    })
    .returning({ id: billingPayments.id });
  const base = env().APP_URL;
  const callback = new URL("/api/v1/billing/return", base);
  callback.searchParams.set("id", pay!.id);
  try {
    const res = await zarinpalProvider.createPayment({
      paymentId: pay!.id,
      amountCents,
      currency,
      description: `Spotifood · ${plan.name} · ${input.months} · ${ctx.restaurant.name}`.slice(0, 250),
      returnUrl: new URL(`/dashboard/${ctx.restaurant.id}/billing`, base).toString(),
      callbackUrl: callback.toString(),
      idempotencyKey: `billing_${pay!.id}`,
      merchantAccount: merchant,
    });
    if (res.status !== "requires_action") throw new Error("unexpected zarinpal result");
    await db
      .update(billingPayments)
      .set({ providerRef: res.providerRef })
      .where(eq(billingPayments.id, pay!.id));
    return { paymentId: pay!.id, redirectUrl: res.redirectUrl };
  } catch (e) {
    await db
      .update(billingPayments)
      .set({ status: "failed", failureReason: String((e as Error).message).slice(0, 200) })
      .where(eq(billingPayments.id, pay!.id));
    throw conflict("billing_provider_error");
  }
}

/** Next invoice number of the (Jalali) year: SF-1405-000001. Run inside the paying transaction. */
async function nextInvoiceNumber(tx: DbOrTx, now: Date) {
  const year = jalaliYear(now);
  const prefix = `SF-${year}-`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`);
  const [r] = await tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(billingPayments)
    .where(sql`${billingPayments.invoiceNumber} like ${prefix + "%"}`);
  return `${prefix}${String((r?.n ?? 0) + 1).padStart(6, "0")}`;
}

/**
 * Pays a period: extends the current paid period of the same plan, else starts now; the
 * subscription becomes active on that plan. Shared by Zarinpal and the admin's manual grant.
 */
async function applyPaidPeriod(
  tx: DbOrTx,
  pay: { id: string; organizationId: string; planId: string; months: number },
  now: Date,
  extra: Partial<typeof billingPayments.$inferInsert> = {},
) {
  const sub = await latestSubscription(tx, pay.organizationId);
  const running =
    sub?.status === "active" &&
    sub.planId === pay.planId &&
    sub.currentPeriodEnd &&
    sub.currentPeriodEnd > now;
  const start = running ? sub!.currentPeriodEnd! : now;
  const end = addMonths(start, pay.months);
  if (sub) {
    await tx
      .update(subscriptions)
      .set({
        planId: pay.planId,
        status: "active",
        currentPeriodEnd: end,
        provider: extra.provider ?? "zarinpal",
      })
      .where(eq(subscriptions.id, sub.id));
  } else {
    await tx.insert(subscriptions).values({
      organizationId: pay.organizationId,
      planId: pay.planId,
      status: "active",
      currentPeriodEnd: end,
      provider: extra.provider ?? "zarinpal",
    });
  }
  const invoiceNumber = await nextInvoiceNumber(tx, now);
  await tx
    .update(billingPayments)
    .set({ ...extra, status: "paid", paidAt: now, periodStart: start, periodEnd: end, invoiceNumber })
    .where(eq(billingPayments.id, pay.id));
  return { start, end, invoiceNumber };
}

/** Zarinpal sends the owner back here: verify server-to-server, then extend the plan. */
export async function completeCheckout(db: Database, id: string, query: URLSearchParams, now = new Date()) {
  if (!isUuid(id)) return null;
  const [pay] = await db.select().from(billingPayments).where(eq(billingPayments.id, id));
  if (!pay) return null;
  if (pay.status !== "pending") return { restaurantId: pay.restaurantId, paid: pay.status === "paid" };
  const event = await zarinpalProvider.verifyReturn!({
    query,
    payment: {
      id: pay.id,
      amountCents: pay.amountCents,
      currency: pay.currency,
      providerRef: pay.providerRef,
      merchantAccount: process.env.BILLING_ZARINPAL_MERCHANT_ID ?? null,
    },
  });
  if (event.type === "ignored") return { restaurantId: pay.restaurantId, paid: false };
  return db.transaction(async (tx) => {
    // Lock the row: a double return applies the period once.
    const [locked] = await tx
      .select({ status: billingPayments.status })
      .from(billingPayments)
      .where(eq(billingPayments.id, id))
      .for("update");
    if (locked?.status !== "pending")
      return { restaurantId: pay.restaurantId, paid: locked?.status === "paid" };
    if (event.type === "payment.failed") {
      await tx
        .update(billingPayments)
        .set({ status: "failed", failureReason: event.reason?.slice(0, 200) ?? null })
        .where(eq(billingPayments.id, id));
      return { restaurantId: pay.restaurantId, paid: false };
    }
    const res = await applyPaidPeriod(tx, pay, now, {
      refId: event.extra?.refId?.slice(0, 64) || null,
      cardPan: event.extra?.cardPan?.slice(0, 32) || null,
    });
    await recordAudit(tx, {
      action: "billing.paid",
      actorUserId: pay.createdByUserId,
      restaurantId: pay.restaurantId,
      entityType: "billing_payment",
      entityId: pay.id,
      metadata: { invoice: res.invoiceNumber, months: pay.months, amount: pay.amountCents },
    });
    return { restaurantId: pay.restaurantId, paid: true };
  });
}

/** One paid period, for the printable invoice. */
export async function getBillingInvoice(db: Database, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.view");
  if (!isUuid(id)) throw notFound();
  const organizationId = await orgOf(db, ctx.restaurant.id);
  const [row] = await db
    .select({
      pay: billingPayments,
      planName: plans.name,
      orgName: organizations.name,
      billingEmail: organizations.billingEmail,
    })
    .from(billingPayments)
    .innerJoin(plans, eq(plans.id, billingPayments.planId))
    .innerJoin(organizations, eq(organizations.id, billingPayments.organizationId))
    .where(
      and(
        eq(billingPayments.id, id),
        eq(billingPayments.organizationId, organizationId),
        eq(billingPayments.status, "paid"),
      ),
    );
  if (!row) throw notFound();
  return row;
}

// ── Admin ─────────────────────────────────────────────────────────────────────

const planSchema = z.object({
  name: z.string().trim().min(1).max(64),
  priceMonthlyCents: z.coerce.number().int().min(0).max(1e15),
  isPublic: z.boolean(),
  maxTables: z.number().int().min(0).nullable(),
  maxStaff: z.number().int().min(0).nullable(),
  maxRestaurants: z.number().int().min(0).nullable(),
  maxOrdersPerMonth: z.number().int().min(0).nullable(),
});

export async function adminListPlans(db: DbOrTx) {
  return db.select().from(plans).orderBy(asc(plans.sortOrder));
}

export async function adminUpdatePlan(db: Database, adminId: string, planId: string, raw: unknown) {
  if (!isUuid(planId)) throw notFound();
  const input = planSchema.parse(raw);
  const [current] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!current) throw notFound();
  await db
    .update(plans)
    .set({
      name: input.name,
      priceMonthlyCents: input.priceMonthlyCents,
      isPublic: input.isPublic,
      currency: billingCurrency(),
      limits: {
        ...current.limits,
        maxTables: input.maxTables,
        maxStaff: input.maxStaff,
        maxRestaurants: input.maxRestaurants,
        maxOrdersPerMonth: input.maxOrdersPerMonth,
      },
    })
    .where(eq(plans.id, planId));
  await recordAudit(db, {
    action: "admin.plan_updated",
    actorUserId: adminId,
    entityType: "plan",
    entityId: planId,
    metadata: { ...input },
  });
}

/**
 * The admin sets a restaurant's plan by hand (cash or bank transfer, gesture, fix):
 * `months` > 0 records a paid period with an invoice; 0 switches plan with no end (or Free).
 */
export async function adminGrantPlan(
  db: Database,
  adminId: string,
  input: { restaurantId: string; planCode: string; months: number; amountCents?: number },
  now = new Date(),
) {
  if (!isUuid(input.restaurantId)) throw notFound();
  const [plan] = await db.select().from(plans).where(eq(plans.code, input.planCode));
  if (!plan) throw validation("plan_not_found");
  const organizationId = await orgOf(db, input.restaurantId);
  const months = Math.max(0, Math.min(36, Math.trunc(input.months)));
  return db.transaction(async (tx) => {
    let result: { end: Date | null; invoiceNumber: string | null };
    if (months === 0) {
      const sub = await latestSubscription(tx, organizationId);
      if (sub)
        await tx
          .update(subscriptions)
          .set({ planId: plan.id, status: "active", currentPeriodEnd: null, provider: "manual" })
          .where(eq(subscriptions.id, sub.id));
      else
        await tx
          .insert(subscriptions)
          .values({ organizationId, planId: plan.id, status: "active", provider: "manual" });
      result = { end: null, invoiceNumber: null };
    } else {
      const [pay] = await tx
        .insert(billingPayments)
        .values({
          organizationId,
          restaurantId: input.restaurantId,
          planId: plan.id,
          months,
          amountCents: Math.max(0, Math.trunc(input.amountCents ?? 0)),
          currency: billingCurrency(),
          provider: "manual",
          createdByUserId: adminId,
        })
        .returning();
      const r = await applyPaidPeriod(tx, pay!, now, { provider: "manual" });
      result = { end: r.end, invoiceNumber: r.invoiceNumber };
    }
    await recordAudit(tx, {
      action: "admin.plan_granted",
      actorUserId: adminId,
      restaurantId: input.restaurantId,
      entityType: "organization",
      entityId: organizationId,
      metadata: { plan: plan.code, months, invoice: result.invoiceNumber },
    });
    return result;
  });
}

/** Plan and end date of each organization, for the admin's restaurant list. */
export async function subscriptionsByOrganization(db: DbOrTx, organizationIds: string[]) {
  const out = new Map<string, SubscriptionState>();
  for (const id of new Set(organizationIds)) out.set(id, stateOf(await latestSubscription(db, id)));
  return out;
}
