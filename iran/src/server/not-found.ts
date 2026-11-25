import "server-only";
import { notFound } from "next/navigation";
import { isAppError } from "@/server/errors";

/** Postgres "invalid text representation" (22P02): an id in the address that is not even a UUID. */
function invalidId(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  if ("code" in e && e.code === "22P02") return true;
  return "cause" in e && invalidId(e.cause);
}

/**
 * Wraps a detail page's loader: an unknown id (deleted, from another hotel, mistyped, or not an id
 * at all) shows the "page not found" screen with a 404, instead of the generic error screen.
 */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (e) {
    if ((isAppError(e) && e.code === "NOT_FOUND") || invalidId(e)) notFound();
    throw e;
  }
}
