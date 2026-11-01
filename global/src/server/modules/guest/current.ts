import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { GUEST_COOKIE, readSigned, SEAT_COOKIE } from "./cookies";
import { loadGuestContext } from "./sessions";

/** Current guest (device + seat at an open table session), or null. Memoized per request. */
export const getGuest = cache(async () => {
  const store = await cookies();
  await connection();
  const guestId = readSigned(store.get(GUEST_COOKIE)?.value);
  const participantId = readSigned(store.get(SEAT_COOKIE)?.value);
  if (!guestId || !participantId) return null;
  return loadGuestContext(db, guestId, participantId);
});

/** For guest server actions: the table session must still be open. */
export async function requireGuest() {
  const guest = await getGuest();
  if (!guest) throw new AppError("UNAUTHENTICATED", "session_expired");
  return guest;
}
