type PgError = { code?: string; constraint?: string; cause?: unknown };

function pgError(e: unknown): PgError | null {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === "object"; i++) {
    const err = cur as PgError;
    if (typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code)) return err;
    cur = err.cause;
  }
  return null;
}

export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = pgError(e);
  return !!err && err.code === "23505" && (!constraint || err.constraint === constraint);
}
