import { eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/server/db/client";
import { pmsSettings } from "@/server/db/schema";

/** The hotel's own features, kept in pms_settings.extras (one JSON, defaults for what is missing). */
export const featuresSchema = z.object({
  /** Rial shield: indexed room rates follow the currency rates at most this much a day (bps). */
  shield: z
    .object({
      maxDailyChangeBps: z.number().int().min(0).max(10_000).default(1500),
      /** Rial prices rounded to this many rials (×100 cents): 100 000 rials by default. */
      roundCents: z.number().int().min(1).default(10_000_000),
      /** Day the indexed rates were last brought in line (hotel business day). */
      lastRun: z.string().optional(),
    })
    .default({ maxDailyChangeBps: 1500, roundCents: 10_000_000 }),
  /** Ramadan: the guest pages show sahari / iftar times and offer sahari in the room. */
  ramadan: z.object({ from: z.string().optional(), to: z.string().optional() }).default({}),
  /** Early arrivals: a discount at the hotel's café while the room is being prepared. */
  readyOffer: z
    .object({ enabled: z.boolean().default(true), pct: z.number().int().min(0).max(100).default(15) })
    .default({ enabled: true, pct: 15 }),
  /** Tips to a named member of staff, from the guest's phone. */
  tips: z
    .object({
      enabled: z.boolean().default(true),
      /** Suggested amounts (cents). */
      presets: z.array(z.number().int().positive()).default([]),
    })
    .default({ enabled: true, presets: [] }),
  /** Prayer times on the guest pages (the hotel's position from its listing). */
  prayer: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
});
export type Features = z.infer<typeof featuresSchema>;

export function parseFeatures(extras: unknown): Features {
  const r = featuresSchema.safeParse(extras ?? {});
  return r.success ? r.data : featuresSchema.parse({});
}

export async function getFeatures(db: DbOrTx, restaurantId: string): Promise<Features> {
  const [row] = await db
    .select({ extras: pmsSettings.extras })
    .from(pmsSettings)
    .where(eq(pmsSettings.restaurantId, restaurantId));
  return parseFeatures(row?.extras);
}

/** Merges a part of the features into the stored JSON (the rest is kept). */
export async function saveFeatures(db: DbOrTx, restaurantId: string, patch: Partial<Features>) {
  const current = await getFeatures(db, restaurantId);
  const next = featuresSchema.parse({ ...current, ...patch });
  await db.update(pmsSettings).set({ extras: next }).where(eq(pmsSettings.restaurantId, restaurantId));
  return next;
}
