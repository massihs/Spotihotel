import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { GUEST_COOKIE, readSigned, SCAN_COOKIE, SCAN_WINDOW_MS, SEAT_COOKIE } from "./cookies";
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

/** End of the ordering window opened by this phone's last QR scan (ms), or null when none. */
export async function scanWindowEnd(participantId: string): Promise<number | null> {
  const store = await cookies();
  const v = readSigned(store.get(SCAN_COOKIE)?.value);
  const [pid, at] = (v ?? "").split(".");
  if (pid !== participantId || !at || !/^\d+$/.test(at)) return null;
  return Number(at) + SCAN_WINDOW_MS;
}

/** For guest actions that order or charge: the QR code must have been scanned in the last 30 min. */
export async function requireFreshScan(participantId: string) {
  const end = await scanWindowEnd(participantId);
  if (!end || Date.now() > end) throw new AppError("FORBIDDEN", "scan_expired");
}
