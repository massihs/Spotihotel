import { describe, expect, it } from "vitest";
import { randomToken } from "@/lib/ids";
import { newSessionToken, sha256, sign, unsign } from "@/server/auth/tokens";
import { slugify } from "@/lib/slug";

describe("tokens", () => {
  it("generates unguessable base62 tokens", () => {
    const tokens = new Set(Array.from({ length: 2000 }, () => randomToken()));
    expect(tokens.size).toBe(2000);
    for (const t of tokens) expect(t).toMatch(/^[0-9A-Za-z]{22}$/);
  });

  it("stores only the hash of session tokens", () => {
    const { token, tokenHash } = newSessionToken();
    expect(tokenHash).toBe(sha256(token));
    expect(tokenHash).not.toContain(token);
  });

  it("signs and verifies cookie values", () => {
    const secret = "x".repeat(40);
    const s = sign("guest-123", secret);
    expect(unsign(s, secret)).toBe("guest-123");
    expect(unsign(s.replace("guest-123", "guest-999"), secret)).toBeNull();
    expect(unsign(s, "y".repeat(40))).toBeNull();
    expect(unsign("garbage", secret)).toBeNull();
  });

  it("slugifies restaurant names", () => {
    expect(slugify("Brasserie Élysée & Co")).toBe("brasserie-elysee-co");
    expect(slugify("  ")).toBe("");
  });
});
