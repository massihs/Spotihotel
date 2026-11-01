"use server";

import { headers } from "next/headers";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { notFound } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import {
  bookOnline,
  cancelByCode,
  joinQueueOnline,
  OCCASIONS,
  placeBySlug,
  slotsForDay,
} from "@/server/modules/reservations/service";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function slotsAction(slug: string, day: string, partySize: number) {
  return runAction(async () => {
    const place = await placeBySlug(db, slug);
    if (!place?.enabled || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw notFound();
    const slots = await slotsForDay(db, place, day, Math.max(1, Math.min(200, Math.trunc(partySize))));
    return slots.map((s) => ({ time: s.time, at: s.at.toISOString() }));
  });
}

export async function bookAction(
  slug: string,
  input: {
    name: string;
    phone: string;
    partySize: number;
    startsAt: string;
    note: string;
    area: "any" | "indoor" | "outdoor";
    occasion?: (typeof OCCASIONS)[number] | null;
  },
) {
  return runAction(async () => {
    await enforceRateLimit("booking", await ip());
    const r = await bookOnline(db, slug, input);
    return { code: r.code };
  });
}

export async function joinQueueAction(
  slug: string,
  input: { name: string; phone: string; partySize: number },
) {
  return runAction(async () => {
    await enforceRateLimit("booking", await ip());
    const r = await joinQueueOnline(db, slug, input);
    return { code: r.code };
  });
}

export async function cancelBookingAction(slug: string, code: string) {
  return runAction(async () => {
    await cancelByCode(db, slug, code);
  });
}
