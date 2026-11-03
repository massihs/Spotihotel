import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { syncLedger } from "@/server/modules/ledger/sync";
import { exportJournalCsv } from "@/server/modules/ledger/reports";
import { isDay } from "@/server/modules/pms/calc";
import { toJalali } from "@/lib/jalali-calendar";

/** Journal (دفتر روزنامه) as a CSV that Excel opens: ?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "accounting.manage");
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isDay(from) || !isDay(to) || to < from) return new Response("invalid range", { status: 400 });
    await syncLedger(db, ctx.restaurant);
    const body = await exportJournalCsv(db, ctx, from, to);
    const j = (d: string) =>
      Object.values(toJalali(d))
        .map((n) => String(n).padStart(2, "0"))
        .join("");
    return new Response(`﻿${body}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="journal_${j(from)}_${j(to)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
