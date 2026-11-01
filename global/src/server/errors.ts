/** Domain errors. Route handlers and server actions map them to HTTP / form errors. */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "TENANT_SUSPENDED"
  | "PLAN_LIMIT"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TENANT_SUSPENDED: 423,
  PLAN_LIMIT: 402,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
  get status() {
    return HTTP_STATUS[this.code];
  }
}

export const unauthenticated = (m?: string) => new AppError("UNAUTHENTICATED", m);
export const forbidden = (m?: string) => new AppError("FORBIDDEN", m);
export const notFound = (m?: string) => new AppError("NOT_FOUND", m);
export const conflict = (m?: string, d?: Record<string, unknown>) => new AppError("CONFLICT", m, d);
export const validation = (m?: string, d?: Record<string, unknown>) => new AppError("VALIDATION", m, d);

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
