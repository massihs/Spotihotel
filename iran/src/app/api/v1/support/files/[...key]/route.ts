import type { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { storage } from "@/server/infra/storage";
import { getCurrentSession } from "@/server/auth/current";
import { loadRestaurantContext } from "@/server/tenancy";
import { GUEST_COOKIE, readSigned, SEAT_COOKIE } from "@/server/modules/guest/cookies";
import { imageThread } from "@/server/modules/support/service";

/**
 * GET /api/v1/support/files/{key} — a screenshot or photo sent in a support conversation, only to
 * that conversation's guest (same seat), the hotel's staff, or the platform team.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join("/");
  const thread = await imageThread(db, key);
  const nope = () => new Response("Not found", { status: 404 });
  if (!thread) return nope();
  let allowed = false;
  const seat = readSigned(req.cookies.get(SEAT_COOKIE)?.value);
  const device = readSigned(req.cookies.get(GUEST_COOKIE)?.value);
  if (
    thread.channel === "guest" &&
    seat &&
    device &&
    seat === thread.participantId &&
    device === thread.guestId
  )
    allowed = true;
  if (!allowed) {
    const session = await getCurrentSession();
    if (session?.user.isSuperAdmin && thread.channel === "platform") allowed = true;
    else if (session)
      allowed = await loadRestaurantContext(db, session.user, thread.restaurantId).then(
        () => true,
        () => false,
      );
  }
  if (!allowed) return nope();
  const file = await storage().get(key);
  if (!file) return nope();
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
