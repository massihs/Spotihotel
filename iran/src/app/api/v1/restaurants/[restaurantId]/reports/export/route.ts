import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { actionContext, errorResponse } from "@/server/actions";
import { routing } from "@/i18n/routing";
import { resolvePeriod } from "@/lib/period";
import { slugify } from "@/lib/slug";
import { profitAndLoss } from "@/server/modules/reports/service";

const KINDS = ["pnl", "sales", "products", "expenses"] as const;

/** Spreadsheet cell: quoted when needed; leading =,+,-,@ neutralized (CSV injection). */
function cell(v: string | number | null | undefined) {
  if (v == null) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * GET /api/v1/restaurants/{restaurantId}/reports/export?kind=pnl|sales|products|expenses&p=30d
 * CSV (UTF-8 with BOM for Excel). Amounts are in major units (tomans for IRR).
 */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/restaurants/[restaurantId]/reports/export">,
) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "accounting.manage");
    const url = new URL(req.url);
    const sp = Object.fromEntries(url.searchParams);
    const kind = (KINDS as readonly string[]).includes(sp.kind ?? "")
      ? (sp.kind as (typeof KINDS)[number])
      : "pnl";
    const locale = (routing.locales as readonly string[]).includes(sp.l ?? "")
      ? sp.l!
      : routing.defaultLocale;
    const t = await getTranslations({ locale, namespace: "reports" });
    const tz = ctx.restaurant.timezone;
    const period = resolvePeriod(sp, tz, ctx.restaurant.currency === "IRR");
    const { sales, pnl, expenses } = await profitAndLoss(db, ctx, period);
    const major = (c: number) =>
      ctx.restaurant.currency === "IRR" ? Math.round(c / 1000) : (c / 100).toFixed(2);

    let rows: (string | number | null)[][];
    if (kind === "sales") {
      rows = [
        [t("date"), t("orders"), t("revenue")],
        ...sales.daily.map((d) => [d.day, d.orders, major(d.totalCents)]),
      ];
    } else if (kind === "products") {
      rows = [
        [t("product"), t("category"), t("qty"), t("revenue"), t("cost")],
        ...sales.products.map((p) => [
          p.name,
          p.category,
          p.quantity,
          major(p.revenueCents),
          p.costCents != null ? major(p.costCents) : null,
        ]),
      ];
    } else if (kind === "expenses") {
      rows = [
        [t("date"), t("categoryLabel"), t("description"), t("method"), t("amount")],
        ...expenses.map((e) => [
          new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(e.paidAt),
          t(`categories.${e.category}`),
          e.description,
          t(`methods.${e.method}`),
          major(e.amountCents),
        ]),
      ];
    } else {
      rows = [
        [t("pnl"), `${period.first} → ${period.last}`],
        [t("revenue"), major(pnl.revenueCents)],
        [t("vat"), major(pnl.taxCents)],
        [t("netSales"), major(pnl.netSalesCents)],
        [t("cogs"), major(pnl.cogsCents)],
        [t("grossMargin"), major(pnl.grossCents)],
        ...pnl.expensesByCategory.map((e) => [t(`categories.${e.category}`), major(e.cents)]),
        [t("totalExpenses"), major(pnl.expensesCents)],
        [t("netProfit"), major(pnl.netCents)],
        [],
        ...sales.methods.map((m) => [
          t.has(`providers.${m.provider}`) ? t(`providers.${m.provider}`) : m.provider,
          major(m.amountCents),
        ]),
      ];
    }
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
    const name = `${slugify(ctx.restaurant.name) || "report"}-${kind}-${period.first}_${period.last}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
