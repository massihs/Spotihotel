import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { restaurantSettings, restaurants } from "@/server/db/schema";
import { openState, type OpenState } from "@/lib/opening";

/** What the menu hero shows about the place: open now / until when, and where it is. */
export async function getStorefront(
  db: DbOrTx,
  restaurantId: string,
  at = new Date(),
): Promise<{ open: OpenState; address: string | null; phone: string | null }> {
  const [row] = await db
    .select({
      hours: restaurantSettings.openingHours,
      tz: restaurants.timezone,
      line1: restaurants.addressLine1,
      city: restaurants.city,
      phone: restaurants.phone,
    })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(restaurants.id, restaurantId));
  if (!row) return { open: { status: "unknown" }, address: null, phone: null };
  const address = [row.line1, row.city].filter(Boolean).join("، ") || null;
  return { open: openState(row.hours, row.tz, at), address, phone: row.phone };
}
