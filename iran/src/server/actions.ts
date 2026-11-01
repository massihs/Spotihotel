import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db/client";
import { getCurrentSession } from "@/server/auth/current";
import type { Permission } from "@/server/auth/permissions";
import { AppError, isAppError, unauthenticated } from "@/server/errors";
import { assertCan, loadRestaurantContext, type RestaurantContext } from "@/server/tenancy";

/**
 * Result shape returned by every server action consumed with `useActionState`.
 * Errors are codes (translated on the client), never raw messages.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; at: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; at: number }
  | null;

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "form";
    // Custom messages are already codes ("label_taken"); built-in ones map to a generic code.
    out[key] ??= /^[a-z_]+$/.test(issue.message) ? issue.message : "invalid";
  }
  return out;
}

/** Runs an action body and maps domain/validation errors to an ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data: data ?? undefined, at: Date.now() };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof z.ZodError) {
      return { ok: false, error: "validation", fieldErrors: zodFieldErrors(e), at: Date.now() };
    }
    if (isAppError(e)) {
      const field = typeof e.details?.field === "string" ? e.details.field : undefined;
      return {
        ok: false,
        error: e.message && /^[a-z_]+$/.test(e.message) ? e.message : e.code.toLowerCase(),
        fieldErrors: field ? { [field]: e.message } : undefined,
        at: Date.now(),
      };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, error: "internal", at: Date.now() };
  }
}

/** Tenant context for server actions and route handlers: throws AppErrors instead of redirecting. */
export async function actionContext(
  restaurantId: unknown,
  permission?: Permission,
): Promise<RestaurantContext> {
  const session = await getCurrentSession();
  if (!session) throw unauthenticated();
  const ctx = await loadRestaurantContext(db, session.user, String(restaurantId ?? ""));
  if (permission) assertCan(ctx, permission);
  return ctx;
}

/** Maps an AppError to a JSON Response for route handlers. */
export function errorResponse(e: unknown): Response {
  if (isAppError(e)) {
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  if (e instanceof z.ZodError || e instanceof SyntaxError)
    return Response.json({ error: { code: "VALIDATION", message: "invalid" } }, { status: 400 });
  console.error("[api] unexpected error", e);
  return Response.json({ error: { code: "INTERNAL", message: "Internal error" } }, { status: 500 });
}

export { AppError };
