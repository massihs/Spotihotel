import type { Instrumentation } from "next";

/** Server errors (renders, route handlers, server actions) are stored and alerted: see modules/ops/errors. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const err = error as Error & { digest?: string };
  // Pages not found and redirects are not errors.
  if (err.digest?.startsWith("NEXT_") || err.message === "NEXT_NOT_FOUND") return;
  const [{ db }, { recordError }] = await Promise.all([
    import("@/server/db/client"),
    import("@/server/modules/ops/errors"),
  ]);
  await recordError(db, {
    message: err.message,
    route: context.routePath || request.path.split("?")[0]!,
    method: request.method,
    kind: context.routeType,
    digest: err.digest,
    stack: err.stack,
  });
};
