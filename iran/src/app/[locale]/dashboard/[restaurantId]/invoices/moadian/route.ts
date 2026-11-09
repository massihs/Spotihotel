import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { moadianCsv } from "@/server/modules/pms/invoicing";
import { isDay } from "@/server/modules/pms/calc";
import { localDay } from "@/lib/period";

/** Invoices of a period for the tax system (سامانه مودیان): ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "invoices.view");
    const q = new URL(req.url).searchParams;
    const today = localDay(new Date(), ctx.restaurant.timezone);
    const to = isDay(q.get("to") ?? "") ? q.get("to")! : today;
    const from = isDay(q.get("from") ?? "") ? q.get("from")! : `${today.slice(0, 8)}01`;
    const { csv } = await moadianCsv(db, ctx, from, to);
    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="moadian_${from}_${to}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
