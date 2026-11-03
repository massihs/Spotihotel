import "server-only";
import { cookies } from "next/headers";
import { db } from "@/server/db/client";
import { requireGuest } from "@/server/modules/guest/current";
import { readSigned } from "@/server/modules/guest/cookies";
import { stayOfGuest } from "./portal";

export const STAY_COOKIE = "sh_stay";

/** The stay this phone proved it belongs to (signed cookie bound to the participant and the stay). */
export async function verifiedStay() {
  const guest = await requireGuest();
  const row = await stayOfGuest(db, guest);
  if (!row) return { guest, stay: null, row: null };
  const store = await cookies();
  const proof = readSigned(store.get(STAY_COOKIE)?.value);
  const ok = proof === `${guest.participant.id}.${row.stay.id}`;
  return { guest, stay: ok ? row.stay : null, row };
}
