"use server";

import { headers } from "next/headers";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { submitPrecheckin, type precheckinSchema } from "@/server/modules/pms/precheckin";
import type { z } from "zod";

/** The guest sends their registration card (rate limited per address). */
export async function submitPrecheckinAction(code: string, input: z.input<typeof precheckinSchema>) {
  return runAction(async () => {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    await enforceRateLimit("booking", `precheckin:${ip}`);
    return submitPrecheckin(db, code, input);
  });
}
