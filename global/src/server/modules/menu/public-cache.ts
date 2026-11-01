import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { menuTag } from "./cache";
import { loadPublicMenu } from "./public";

/**
 * Cached public menu. Expired by `updateTag(menuTag(id))` on every menu change in the dashboard,
 * so guests get a fast (no DB hit) and up-to-date menu.
 */
export async function getPublicMenu(restaurantId: string) {
  "use cache";
  cacheTag(menuTag(restaurantId));
  cacheLife("hours");
  return loadPublicMenu(db, restaurantId);
}
