import { db } from "@/server/db/client";
import { actionContext, errorResponse } from "@/server/actions";
import { notFound as notFoundError } from "@/server/errors";
import { getTablesByIds } from "@/server/modules/tables/service";
import { qrPng, qrSvg, tableUrl } from "@/server/modules/tables/qr";
import { slugify } from "@/lib/slug";

/**
 * GET /api/v1/restaurants/{restaurantId}/tables/{tableId}/qr?format=svg|png&size=1024&download=1
 * Authenticated (session cookie) and tenant-scoped.
 */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/restaurants/[restaurantId]/tables/[tableId]/qr">,
) {
  try {
    const { restaurantId, tableId } = await params;
    const ctx = await actionContext(restaurantId, "tables.view");
    const [table] = await getTablesByIds(db, ctx, [tableId]);
    if (!table) throw notFoundError();

    const url = new URL(req.url);
    const format = url.searchParams.get("format") === "png" ? "png" : "svg";
    const size = Math.min(Math.max(Number(url.searchParams.get("size")) || 1024, 128), 4096);
    const filename = `qr-${slugify(ctx.restaurant.name)}-table-${slugify(table.label) || table.id}.${format}`;
    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=300",
      // The ETag changes when the token is regenerated.
      ETag: `"${table.qrToken}-${format}-${size}"`,
    };
    if (url.searchParams.get("download"))
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;

    const target = tableUrl(table.qrToken);
    if (format === "png") {
      return new Response(new Uint8Array(await qrPng(target, size)), {
        headers: { ...headers, "Content-Type": "image/png" },
      });
    }
    return new Response(await qrSvg(target), {
      headers: { ...headers, "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
