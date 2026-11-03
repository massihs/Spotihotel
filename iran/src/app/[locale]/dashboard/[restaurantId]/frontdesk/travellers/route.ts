import { actionContext, errorResponse } from "@/server/actions";
import { db } from "@/server/db/client";
import { travellersCsv } from "@/server/modules/pms/travellers";
import { getPmsSettings } from "@/server/modules/pms/setup";
import { isDay } from "@/server/modules/pms/calc";
import { toJalali } from "@/lib/jalali-calendar";

/** Travellers of a night for the police (اماکن): ?day=YYYY-MM-DD (default: the business day). */
export async function GET(req: Request, { params }: { params: Promise<{ restaurantId: string }> }) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "frontdesk.view");
    const asked = new URL(req.url).searchParams.get("day") ?? "";
    const day = isDay(asked)
      ? asked
      : (await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone)).businessDate;
    const { csv } = await travellersCsv(db, ctx, day);
    const j = Object.values(toJalali(day))
      .map((n) => String(n).padStart(2, "0"))
      .join("");
    return new Response(`﻿${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="travellers_${j}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
