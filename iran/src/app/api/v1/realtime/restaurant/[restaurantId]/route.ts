import { actionContext, errorResponse } from "@/server/actions";
import { topics } from "@/server/infra/realtime";
import { sseResponse } from "@/server/infra/realtime/sse";

/** GET /api/v1/realtime/restaurant/{id} — staff event stream (orders, tables, notifications). */
export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/realtime/restaurant/[restaurantId]">,
) {
  try {
    const { restaurantId } = await params;
    const ctx = await actionContext(restaurantId, "restaurant.view");
    return sseResponse(req, [topics.restaurant(ctx.restaurant.id)]);
  } catch (e) {
    return errorResponse(e);
  }
}
