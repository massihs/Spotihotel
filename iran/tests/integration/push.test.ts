import webpush from "web-push";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { pushSubscriptions } from "@/server/db/schema";
import { pushToRestaurant, saveSubscription } from "@/server/modules/push/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

const sub = (n: string) => ({
  endpoint: `https://push.example.test/${n}-${Math.random().toString(36).slice(2)}`,
  keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "authsecret12" },
});

beforeEach(() => {
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
});
afterEach(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  vi.restoreAllMocks();
});

describe("web push", () => {
  it("sends to the team of the restaurant only and drops expired subscriptions", async () => {
    const a = await createOwnerWithRestaurant("PushA");
    const b = await createOwnerWithRestaurant("PushB");
    const live = sub("live");
    const gone = sub("gone");
    await saveSubscription(db, live, { userId: a.user.id, restaurantId: a.restaurant.id });
    await saveSubscription(db, gone, { userId: a.user.id, restaurantId: a.restaurant.id });
    await saveSubscription(db, sub("other"), { userId: b.user.id, restaurantId: b.restaurant.id });
    const sent: string[] = [];
    vi.spyOn(webpush, "sendNotification").mockImplementation(async (s) => {
      if (s.endpoint === gone.endpoint) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push(s.endpoint);
      return { statusCode: 201, body: "", headers: {} };
    });
    expect(await pushToRestaurant(db, a.restaurant.id, { title: "T", body: "B", url: "/" })).toBe(1);
    expect(sent).toEqual([live.endpoint]);
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, gone.endpoint)),
    ).toHaveLength(0);
    // Saving the same browser again moves it, never duplicates it.
    await saveSubscription(db, live, { userId: b.user.id, restaurantId: b.restaurant.id });
    expect(
      await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, live.endpoint)),
    ).toHaveLength(1);
  });

  it("does nothing without VAPID keys", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const spy = vi.spyOn(webpush, "sendNotification");
    const a = await createOwnerWithRestaurant("PushOff");
    expect(await pushToRestaurant(db, a.restaurant.id, { title: "T", body: "B", url: "/" })).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
