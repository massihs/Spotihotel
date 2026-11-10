"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { requireGuest } from "@/server/modules/guest/current";
import { signValue } from "@/server/modules/guest/cookies";
import { STAY_COOKIE, verifiedStay } from "@/server/modules/pms/portal-session";
import { nameMatches, stayOfGuest } from "@/server/modules/pms/portal";
import { bookServiceAsGuest, cancelServiceBooking, serviceDay } from "@/server/modules/pms/wellness";
import { declareMinibar } from "@/server/modules/pms/minibar";

async function requireStay() {
  const v = await verifiedStay();
  if (!v.stay) throw new AppError("FORBIDDEN", "stay_not_verified");
  await enforceRateLimit("guestWrite", v.guest.guestId);
  return { guest: v.guest, stay: v.stay };
}

/** The guest types their name once; the phone then sees the bill and can charge the room. */
export async function verifyStayAction(lastName: string) {
  return runAction(async () => {
    const guest = await requireGuest();
    await enforceRateLimit("dinerVerify", guest.guestId);
    const row = await stayOfGuest(db, guest);
    if (!row || !nameMatches(lastName, row.guest)) throw new AppError("VALIDATION", "name_mismatch");
    const store = await cookies();
    store.set(STAY_COOKIE, signValue(`${guest.participant.id}.${row.stay.id}`), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    refresh();
  });
}

export async function slotsAction(serviceId: string, day: string) {
  return runAction(async () => {
    const guest = await requireGuest();
    return (await serviceDay(db, guest.restaurant, serviceId, day)).slots;
  });
}

export async function bookSpaAction(serviceId: string, day: string, time: string, people: number) {
  return runAction(async () => {
    const { guest, stay } = await requireStay();
    await bookServiceAsGuest(db, guest.restaurant, stay.id, { serviceId, day, time, people });
    refresh();
  });
}

export async function cancelSpaAction(bookingId: string) {
  return runAction(async () => {
    const { guest, stay } = await requireStay();
    await cancelServiceBooking(db, guest.restaurant, bookingId, { userId: null, stayId: stay.id });
    refresh();
  });
}

export async function declareMinibarAction(lines: { itemId: string; quantity: number }[]) {
  return runAction(async () => {
    const { guest, stay } = await requireStay();
    const total = await declareMinibar(db, guest.restaurant, stay.id, lines);
    refresh();
    return total;
  });
}
