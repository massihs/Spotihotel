import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { isDay } from "@/server/modules/pms/calc";
import { DESK_TABLES, type DeskTableKey } from "@/server/modules/pms/desk-reports";
import { shiftReport } from "@/server/modules/pms/cashier";
import { tableCsv } from "@/components/pms/desk-table";

/**
 * CSV of a front office table (reservations, cashier, reports), with the filters on screen:
 * ?report=<key>&from=YYYY-MM-DD&to=YYYY-MM-DD[&q=…][&method=…][&status=…]. Each report checks
 * its own permission.
 */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "frontdesk.view");
    const sp = new URL(req.url).searchParams;
    const report = sp.get("report") ?? "";
    const from = sp.get("from") ?? "";
    const to = sp.get("to") ?? "";
    if (!isDay(from) || !isDay(to)) return new Response("invalid range", { status: 400 });
    const p = {
      from,
      to,
      q: sp.get("q") ?? undefined,
      method: sp.get("method") || undefined,
      status: sp.get("status") || undefined,
    };
    const table =
      report === "shifts"
        ? await shiftReport(db, ctx, p)
        : report in DESK_TABLES
          ? await DESK_TABLES[report as DeskTableKey](db, ctx, p)
          : null;
    if (!table) return new Response("unknown report", { status: 404 });
    const csv = await tableCsv(table, ctx.restaurant.currency);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${report}_${from}_${to}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
