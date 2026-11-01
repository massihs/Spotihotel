import type { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { topics } from "@/server/infra/realtime";
import { sseResponse } from "@/server/infra/realtime/sse";
import { GUEST_COOKIE, readSigned, SEAT_COOKIE } from "@/server/modules/guest/cookies";
import { loadGuestContext } from "@/server/modules/guest/sessions";

/** GET /api/v1/realtime/guest — the guest's own order updates, table session closing, games of the restaurant. */
export async function GET(req: NextRequest) {
  const guestId = readSigned(req.cookies.get(GUEST_COOKIE)?.value);
  const participantId = readSigned(req.cookies.get(SEAT_COOKIE)?.value);
  const guest = guestId && participantId ? await loadGuestContext(db, guestId, participantId) : null;
  if (!guest)
    return Response.json({ error: { code: "UNAUTHENTICATED", message: "session_expired" } }, { status: 401 });
  return sseResponse(req, [
    topics.participant(guest.participant.id),
    topics.session(guest.session.id),
    topics.games(guest.restaurant.id),
  ]);
}
