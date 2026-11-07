"use server";

import { headers } from "next/headers";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import {
  onlineBook,
  onlineOffers,
  type onlineBookSchema,
  type onlineSearchSchema,
} from "@/server/modules/pms/online";

async function ip() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Rooms and prices for the dates, on the hotel's booking page. */
export async function hotelOffersAction(slug: string, q: z.input<typeof onlineSearchSchema>) {
  return runAction(async () => {
    await enforceRateLimit("guestWrite", `hotel-offers:${await ip()}`);
    return onlineOffers(db, slug, q);
  });
}

/** A guest books on the hotel's page (a few bookings per address and per ten minutes). */
export async function hotelBookAction(slug: string, input: z.input<typeof onlineBookSchema>) {
  return runAction(async () => {
    await enforceRateLimit("booking", `hotel:${await ip()}`);
    return onlineBook(db, slug, input);
  });
}
