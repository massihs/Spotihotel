import { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, errorResponse } from "@/server/actions";
import { createDevice } from "@/server/modules/offline/service";

const body = z.object({ restaurantId: z.uuid(), name: z.string().trim().min(1).max(60) });

/**
 * POST /api/v1/offline/devices — links the desktop app the manager is signed in on. Session
 * cookie auth (restaurant.manage); returns the device token once.
 */
export async function POST(req: Request) {
  try {
    const input = body.parse(await req.json());
    const ctx = await actionContext(input.restaurantId, "restaurant.manage");
    const device = await createDevice(db, ctx, input.name);
    return Response.json(
      { device, restaurant: { id: ctx.restaurant.id, name: ctx.restaurant.name } },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
