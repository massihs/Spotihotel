import { AppError } from "@/server/errors";

/**
 * Rate limiter abstraction. The in-memory implementation is fine for a single instance;
 * swap for a Redis/Postgres implementation when running several app instances.
 */
export interface RateLimiter {
  /** Consumes one token. Returns remaining tokens, or -1 if the limit is exceeded. */
  hit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterMs: number }>;
  reset(key: string): Promise<void>;
}

export class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, number[]>();

  async hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (this.buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      this.buckets.set(key, recent);
      return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
    }
    recent.push(now);
    this.buckets.set(key, recent);
    if (this.buckets.size > 50_000) this.gc(now, windowMs);
    return { ok: true, retryAfterMs: 0 };
  }

  async reset(key: string) {
    this.buckets.delete(key);
  }

  private gc(now: number, windowMs: number) {
    for (const [k, v] of this.buckets) if (v.every((t) => now - t >= windowMs)) this.buckets.delete(k);
  }
}

const globalForRl = globalThis as unknown as { __sfRateLimiter?: RateLimiter };
export const rateLimiter: RateLimiter = (globalForRl.__sfRateLimiter ??= new MemoryRateLimiter());

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  guestWrite: { limit: 60, windowMs: 60_000 },
  qrEntry: { limit: 30, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 10 * 60_000 },
  /** "Call the waiter to pay": a few per guest, so the team is not spammed. */
  paymentRequest: { limit: 3, windowMs: 5 * 60_000 },
} as const;

export async function enforceRateLimit(
  name: keyof typeof RATE_LIMITS,
  key: string,
  limiter: RateLimiter = rateLimiter,
) {
  const { limit, windowMs } = RATE_LIMITS[name];
  const res = await limiter.hit(`${name}:${key}`, limit, windowMs);
  if (!res.ok) {
    throw new AppError("RATE_LIMITED", "Too many attempts, please try again later", {
      retryAfterSeconds: Math.ceil(res.retryAfterMs / 1000),
    });
  }
}
