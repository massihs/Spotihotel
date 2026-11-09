import { getTranslations } from "next-intl/server";
import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { reportCsv } from "@/server/modules/pms/reports";
import { isDay } from "@/server/modules/pms/calc";

/** CSV of a hotel report: ?report=occupancy|segments&from=YYYY-MM-DD&to=YYYY-MM-DD. */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "analytics.view");
    const q = new URL(req.url).searchParams;
    const report = q.get("report") === "segments" ? "segments" : "occupancy";
    const from = q.get("from") ?? "";
    const to = q.get("to") ?? "";
    if (!isDay(from) || !isDay(to)) return new Response("invalid range", { status: 400 });
    const tSource = await getTranslations("pms.source");
    const labels = Object.fromEntries(
      [
        "direct",
        "phone",
        "walk_in",
        "website",
        "email",
        "agency",
        "snapptrip",
        "alibaba",
        "jabama",
        "eghamat24",
        "flytoday",
        "booking",
        "other",
      ]
        .filter((k) => tSource.has(k as "direct"))
        .map((k) => [k, tSource(k as "direct")]),
    );
    const csv = await reportCsv(db, ctx, report, from, to, labels);
    return new Response(`﻿${csv}`, {
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
