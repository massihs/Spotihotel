import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { appErrors } from "@/server/db/schema";
import { fingerprint, listErrors, recordError, resolveError } from "@/server/modules/ops/errors";

afterEach(() => {
  delete process.env.ALERT_PHONE;
});

describe("server errors", () => {
  it("groups the same error on the same route, ids and numbers aside", () => {
    expect(fingerprint(`order ${randomUUID()} failed after 3 tries`, "/x")).toBe(
      fingerprint(`order ${randomUUID()} failed after 12 tries`, "/x"),
    );
    expect(fingerprint("boom", "/x")).not.toBe(fingerprint("boom", "/y"));
  });

  it("counts repeats, reopens resolved ones and alerts at most once an hour", async () => {
    process.env.ALERT_PHONE = "09120000000";
    const route = `/test/${randomUUID()}`;
    const t0 = new Date("2026-10-01T10:00:00Z");
    await recordError(db, { message: "boom", route, kind: "render" }, t0);
    await recordError(db, { message: "boom", route }, new Date(t0.getTime() + 60_000));
    const fp = fingerprint("boom", route);
    let [row] = await db.select().from(appErrors).where(eq(appErrors.fingerprint, fp));
    expect(row).toMatchObject({ count: 2, kind: "render" });
    expect(row!.alertedAt?.getTime()).toBe(t0.getTime());

    await resolveError(db, row!.id);
    expect((await listErrors(db, { open: true })).some((r) => r.id === row!.id)).toBe(false);
    const later = new Date(t0.getTime() + 2 * 3600_000);
    await recordError(db, { message: "boom", route }, later);
    [row] = await db.select().from(appErrors).where(eq(appErrors.fingerprint, fp));
    expect(row).toMatchObject({ count: 3, resolvedAt: null });
    expect(row!.alertedAt?.getTime()).toBe(later.getTime());
  });

  it("never throws", async () => {
    await expect(recordError(db, { message: "", route: "" })).resolves.toBeUndefined();
  });
});
