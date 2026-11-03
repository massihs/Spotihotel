import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { syncLedger } from "@/server/modules/ledger/sync";
import { exportFec } from "@/server/modules/ledger/reports";
import { isDay } from "@/server/modules/pms/calc";

/** Journal export (FEC layout, tab-separated) for the accountant: ?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "accounting.manage");
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isDay(from) || !isDay(to) || to < from) return new Response("invalid range", { status: 400 });
    await syncLedger(db, ctx.restaurant);
    // Minor units are hundredths of the legal unit (cents, or rials for IRR).
    const body = await exportFec(db, ctx, from, to, 2);
    return new Response(`﻿${body}`, {
      headers: {
        "content-type": "text/tab-separated-values; charset=utf-8",
        "content-disposition": `attachment; filename="FEC_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.txt"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
