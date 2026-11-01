import webpush from "web-push";
import { createTranslator } from "next-intl";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { pushSubscriptions, restaurantMembers } from "@/server/db/schema";
import { concerns, sectionsFor } from "@/server/modules/team/sections";

/**
 * Web Push: alerts that reach a phone or a computer even when the page is closed.
 * Off until VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set (generate them once with
 * `npx web-push generate-vapid-keys`). A failed or expired subscription is dropped.
 */
export const pushEnabled = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contact@spotifood.ir",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

export const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export type PushOwner =
  { userId: string; restaurantId: string } | { participantId: string } | { dinerId: string };

export async function saveSubscription(db: DbOrTx, raw: unknown, owner: PushOwner) {
  const sub = subscriptionSchema.parse(raw);
  const who = {
    userId: "userId" in owner ? owner.userId : null,
    restaurantId: "restaurantId" in owner ? owner.restaurantId : null,
    participantId: "participantId" in owner ? owner.participantId : null,
    dinerId: "dinerId" in owner ? owner.dinerId : null,
  };
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...who })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, ...who },
    });
}

export async function removeSubscription(db: DbOrTx, endpoint: string) {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

async function deliver(db: Database, subs: (typeof pushSubscriptions.$inferSelect)[], payload: PushPayload) {
  if (!pushEnabled() || subs.length === 0) return 0;
  configure();
  const body = JSON.stringify(payload);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          {
            TTL: 600,
            timeout: 8000,
          },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("[push] send failed", status ?? (e as Error).message);
      }
    }),
  );
  if (dead.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  return sent;
}

/**
 * The restaurant's team (staff who turned push on). With `sections`, only the owner, members
 * without a section and members of those sections.
 */
export async function pushToRestaurant(
  db: Database,
  restaurantId: string,
  payload: PushPayload,
  sections: string[] | null = null,
) {
  if (!pushEnabled()) return 0;
  const rows = await db
    .select({ sub: pushSubscriptions, role: restaurantMembers.role, mine: restaurantMembers.sectionIds })
    .from(pushSubscriptions)
    .innerJoin(
      restaurantMembers,
      and(
        eq(restaurantMembers.userId, pushSubscriptions.userId),
        eq(restaurantMembers.restaurantId, restaurantId),
      ),
    )
    .where(and(eq(pushSubscriptions.restaurantId, restaurantId), isNotNull(pushSubscriptions.userId)));
  const subs = rows
    .filter((r) => r.role === "owner" || !r.mine.length || concerns(r.mine, sections))
    .map((r) => r.sub);
  return deliver(db, subs, payload);
}

/** A guest: their seat at the table and/or their account. */
export async function pushToGuest(
  db: Database,
  who: { participantId?: string | null; dinerId?: string | null },
  payload: PushPayload,
) {
  if (!pushEnabled()) return 0;
  const subs = [
    ...(who.participantId
      ? await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.participantId, who.participantId))
      : []),
    ...(who.dinerId
      ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.dinerId, who.dinerId))
      : []),
  ];
  return deliver(db, subs, payload);
}

/** A push text in the restaurant's language (messages: push.*). */
export async function pushText(locale: string, key: string, values: Record<string, string | number>) {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const messages = (await import(`../../../../messages/${l}.json`)).default;
  return createTranslator({ locale: l, messages, namespace: "push" })(key, values);
}

/** Fire and forget: a push never delays or breaks the order flow. */
export function notifyNewOrder(
  db: Database,
  restaurant: { id: string; defaultLocale: string },
  order: { id: string; number: string; tableLabel: string | null; room?: boolean },
) {
  if (!pushEnabled()) return;
  void (async () => {
    const sections = await sectionsFor(db, restaurant.id, "order.created", { orderId: order.id });
    const title = await pushText(restaurant.defaultLocale, "newOrderTitle", { number: order.number });
    const body = order.tableLabel
      ? await pushText(restaurant.defaultLocale, order.room ? "newOrderTableRoom" : "newOrderTable", {
          table: order.tableLabel,
        })
      : await pushText(restaurant.defaultLocale, "newOrderOnline", {});
    await pushToRestaurant(
      db,
      restaurant.id,
      {
        title,
        body,
        url: `/dashboard/${restaurant.id}/orders`,
        tag: `order-${order.number}`,
      },
      sections,
    );
  })().catch((e) => console.error("[push] new order", e));
}

export function notifyOrderReady(
  db: Database,
  restaurant: { name: string; slug: string; defaultLocale: string },
  order: { id: string; number: string; participantId: string | null; dinerId: string | null },
) {
  if (!pushEnabled() || (!order.participantId && !order.dinerId)) return;
  void (async () => {
    const body = await pushText(restaurant.defaultLocale, "readyBody", { number: order.number });
    const url = order.participantId ? "/table/orders" : `/r/${restaurant.slug}/o/${order.id}`;
    await pushToGuest(db, order, { title: restaurant.name, body, url, tag: `ready-${order.id}` });
  })().catch((e) => console.error("[push] ready", e));
}
