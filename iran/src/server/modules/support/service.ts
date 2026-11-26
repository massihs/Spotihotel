import { and, asc, count, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  notifications,
  pmsSettings,
  printJobs,
  printers,
  restaurantMembers,
  restaurants,
  supportArticles,
  supportMessages,
  supportThreads,
  users,
  type SupportMessageData,
} from "@/server/db/schema";
import { emit, topics } from "@/server/infra/realtime";
import { processImage } from "@/server/infra/images";
import { storage } from "@/server/infra/storage";
import { notFound, validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { localDay } from "@/lib/period";
import { normalize, rankArticles, wantsHuman } from "@/lib/support-match";
import { DEFAULT_ARTICLES } from "./default-articles";

/**
 * Live support. A conversation opens with the assistant, which answers from the help articles
 * (and, for hotels, a few checks of their own setup); when it cannot help, or when asked, the
 * conversation goes to a person: the hotel's front desk for a guest, the Spotihotel team for staff.
 */

export type Thread = typeof supportThreads.$inferSelect;
export type Message = typeof supportMessages.$inferSelect;
type Audience = "staff" | "guest";

export const messageSchema = z.object({
  body: z.string().trim().max(2000).default(""),
});

/** Articles about something the hotel must do (repair, towels…): answered and handed to the desk. */
const DESK_ACTION = new Set(["guest-reception"]);

const IMAGE_KEY_RE = /^support\/[0-9a-f-]{36}\/[A-Za-z0-9]{16}\.webp$/;

// ─── Articles ───────────────────────────────────────────────────────────────

/** The default help articles, added once (and any new default added later). */
export async function ensureArticles(db: DbOrTx) {
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(supportArticles);
  if (n >= DEFAULT_ARTICLES.length) return;
  await db
    .insert(supportArticles)
    .values(
      DEFAULT_ARTICLES.map((a, i) => ({
        slug: a.slug,
        audience: a.audience,
        title: a.title,
        body: a.body,
        keywords: a.keywords,
        href: a.href,
        sortOrder: i,
      })),
    )
    .onConflictDoNothing({ target: supportArticles.slug });
}

const pick = (m: Record<string, string>, locale: string) =>
  m[locale] || m.fa || m.en || Object.values(m)[0] || "";

async function answerArticles(
  db: DbOrTx,
  audience: Audience,
  question: string,
  locale: string,
  base: string,
) {
  await ensureArticles(db);
  const all = await db
    .select()
    .from(supportArticles)
    .where(and(eq(supportArticles.audience, audience), eq(supportArticles.published, true)));
  const top = rankArticles(question, all).slice(0, 2);
  if (top.length)
    await db
      .update(supportArticles)
      .set({ shown: sql`${supportArticles.shown} + 1` })
      .where(
        inArray(
          supportArticles.id,
          top.map((a) => a.id),
        ),
      );
  return top.map((a) => ({
    slug: a.slug,
    title: pick(a.title, locale),
    body: pick(a.body, locale),
    href: a.href ? a.href.replace("{base}", base) : null,
  }));
}

// ─── Assistant checks ───────────────────────────────────────────────────────

const has = (q: string, words: string) => words.split(",").some((w) => q.includes(normalize(w)));

/** A hotel's own setup, checked when the question is about it (printers, closing the day, QR). */
async function staffChecks(db: DbOrTx, restaurantId: string, timezone: string, question: string) {
  const q = ` ${normalize(question)} `;
  const out: NonNullable<SupportMessageData["checks"]> = [];
  if (has(q, "چاپگر,پرینتر,فیش,printer,print,imprimante,impression,طابعة")) {
    const [p] = await db
      .select({ n: count() })
      .from(printers)
      .where(and(eq(printers.restaurantId, restaurantId), eq(printers.isActive, true)));
    const day = new Date(Date.now() - 86_400_000);
    const [failed] = await db
      .select({ n: count() })
      .from(printJobs)
      .where(
        and(
          eq(printJobs.restaurantId, restaurantId),
          eq(printJobs.status, "failed"),
          gt(printJobs.createdAt, day),
        ),
      );
    const [stuck] = await db
      .select({ n: count() })
      .from(printJobs)
      .where(
        and(
          eq(printJobs.restaurantId, restaurantId),
          eq(printJobs.status, "pending"),
          lt(printJobs.createdAt, new Date(Date.now() - 10 * 60_000)),
        ),
      );
    const n = Number(p?.n ?? 0);
    out.push(n ? { ok: true, code: "printers_ok", values: { n } } : { ok: false, code: "printers_none" });
    if (Number(failed?.n)) out.push({ ok: false, code: "print_failed", values: { n: Number(failed!.n) } });
    if (Number(stuck?.n)) out.push({ ok: false, code: "print_stuck", values: { n: Number(stuck!.n) } });
  }
  if (
    has(
      q,
      "بستن روز,حسابرسی,ممیزی,تاریخ کاری,خروج,تسویه,audit,business date,check out,clôture,audit,départ,التدقيق,إغلاق",
    )
  ) {
    const [s] = await db
      .select({ day: pmsSettings.businessDate })
      .from(pmsSettings)
      .where(eq(pmsSettings.restaurantId, restaurantId));
    const today = localDay(new Date(), timezone);
    if (s?.day && s.day < today) {
      const days = Math.round((Date.parse(today) - Date.parse(s.day)) / 86_400_000);
      out.push({ ok: false, code: "audit_late", values: { days, date: s.day } });
    } else if (s?.day) out.push({ ok: true, code: "audit_ok" });
  }
  if (has(q, "qr,کیوآر,سفارش نمیدهد,نمیتواند سفارش,cannot order,ne peut pas commander,رمز qr")) {
    const [off] = await db
      .select({ n: count() })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, restaurantId),
          eq(diningTables.qrEnabled, false),
          isNull(diningTables.deletedAt),
        ),
      );
    const n = Number(off?.n ?? 0);
    out.push(n ? { ok: false, code: "qr_disabled", values: { n } } : { ok: true, code: "qr_ok" });
  }
  return out;
}

/** What the hotel itself can tell a guest straight away: the Wi-Fi, the check-out time. */
async function guestChecks(db: DbOrTx, restaurantId: string, question: string) {
  const q = ` ${normalize(question)} `;
  const out: NonNullable<SupportMessageData["checks"]> = [];
  const wifi = has(q, "وای فای,وایفای,اینترنت,رمز,wifi,wi fi,internet,password,mot de passe,واي فاي,انترنت");
  const leave = has(q, "ساعت خروج,چک اوت,check out,checkout,départ,مغادرة");
  if (!wifi && !leave) return out;
  const [s] = await db
    .select({ name: pmsSettings.wifiName, password: pmsSettings.wifiPassword, out: pmsSettings.checkOutTime })
    .from(pmsSettings)
    .where(eq(pmsSettings.restaurantId, restaurantId));
  if (wifi && s?.name)
    out.push({ ok: true, code: "wifi", values: { name: s.name, password: s.password ?? "" } });
  if (leave && s?.out) out.push({ ok: true, code: "checkout_time", values: { time: s.out } });
  return out;
}

// ─── Messages ───────────────────────────────────────────────────────────────

async function addMessage(
  db: DbOrTx,
  thread: Thread,
  m: {
    author: Message["author"];
    userId?: string | null;
    body?: string;
    imageKey?: string | null;
    data?: SupportMessageData;
  },
) {
  const [row] = await db
    .insert(supportMessages)
    .values({
      threadId: thread.id,
      author: m.author,
      userId: m.userId ?? null,
      body: m.body ?? "",
      imageKey: m.imageKey ?? null,
      data: m.data ?? null,
    })
    .returning();
  await db
    .update(supportThreads)
    .set({ lastMessageAt: row!.createdAt })
    .where(eq(supportThreads.id, thread.id));
  return row!;
}

/** Stores a screenshot or photo (re-encoded, metadata stripped), private to the conversation. */
export async function storeImage(threadId: string, file: File | null | undefined) {
  if (!file || file.size === 0) return null;
  const img = await processImage(Buffer.from(await file.arrayBuffer()), [
    { suffix: "full", width: 1600, format: "webp" },
  ]);
  const key = `support/${threadId}/${randomBytes(12)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "x")
    .slice(0, 16)}.webp`;
  await storage().put(key, img.variants[0]!.body, "image/webp");
  return key;
}

/**
 * The assistant's turn after a requester's message: a person asked for → hand over; articles or
 * checks found → answer with them; nothing → hand over at once rather than guess.
 */
async function assistantTurn(
  db: DbOrTx,
  thread: Thread,
  text: string,
  opts: { audience: Audience; locale: string; base: string; timezone: string },
) {
  if (thread.status !== "bot") return { handedOver: false };
  if (text && wantsHuman(text)) return { handedOver: await handOver(db, thread) };
  if (!text) return { handedOver: await handOver(db, thread) }; // a photo alone: a person looks at it
  const [articles, checks] = await Promise.all([
    answerArticles(db, opts.audience, text, opts.locale, opts.base),
    opts.audience === "staff"
      ? staffChecks(db, thread.restaurantId, opts.timezone, text)
      : guestChecks(db, thread.restaurantId, text),
  ]);
  if (!articles.length && !checks.length) return { handedOver: await handOver(db, thread) };
  // Something to fix or bring to the room: the desk must act, so it is told at once.
  const desk = articles.some((a) => DESK_ACTION.has(a.slug));
  await addMessage(db, thread, {
    author: "bot",
    data: { code: "found", articles, checks, offer: desk ? [] : ["helpful", "human"] },
  });
  if (desk) return { handedOver: await handOver(db, thread) };
  return { handedOver: false };
}

/** The conversation goes to a person; the desk (guest) or the platform team (staff) is told. */
async function handOver(db: DbOrTx, thread: Thread) {
  if (thread.status !== "bot") return false;
  await db.update(supportThreads).set({ status: "open" }).where(eq(supportThreads.id, thread.id));
  thread.status = "open";
  await addMessage(db, thread, {
    author: "system",
    data: { code: thread.channel === "guest" ? "handover_desk" : "handover_team" },
  });
  if (thread.channel === "guest") {
    await db.insert(notifications).values({
      restaurantId: thread.restaurantId,
      type: "support.guest",
      payload: { label: thread.place ?? "", name: thread.guestName ?? "" },
    });
    await emit(db, { topic: topics.restaurant(thread.restaurantId), type: "notification.created" });
  }
  return true;
}

const view = async (db: DbOrTx, thread: Thread | null | undefined) =>
  thread
    ? {
        thread,
        messages: await db
          .select()
          .from(supportMessages)
          .where(eq(supportMessages.threadId, thread.id))
          .orderBy(asc(supportMessages.createdAt))
          .limit(300),
      }
    : null;

export type ThreadView = NonNullable<Awaited<ReturnType<typeof view>>>;

// ─── Staff ↔ Spotihotel team ────────────────────────────────────────────────

async function staffThreadRow(db: DbOrTx, restaurantId: string) {
  const [t] = await db
    .select()
    .from(supportThreads)
    .where(
      and(
        eq(supportThreads.restaurantId, restaurantId),
        eq(supportThreads.channel, "platform"),
        ne(supportThreads.status, "closed"),
      ),
    )
    .orderBy(desc(supportThreads.lastMessageAt))
    .limit(1);
  return t ?? null;
}

/** The hotel's current conversation with the Spotihotel team (read now). */
export async function staffConversation(db: DbOrTx, ctx: RestaurantContext) {
  assertCan(ctx, "restaurant.view");
  const t = await staffThreadRow(db, ctx.restaurant.id);
  if (t)
    await db.update(supportThreads).set({ requesterReadAt: new Date() }).where(eq(supportThreads.id, t.id));
  return view(db, t);
}

export async function staffSend(
  db: Database,
  ctx: RestaurantContext,
  input: { body?: string; image?: File | null },
  locale: string,
) {
  assertCan(ctx, "restaurant.view");
  const { body } = messageSchema.parse({ body: input.body ?? "" });
  if (!body && !input.image?.size) throw validation("message_empty");
  let thread = await staffThreadRow(db, ctx.restaurant.id);
  if (!thread)
    [thread] = await db
      .insert(supportThreads)
      .values({ restaurantId: ctx.restaurant.id, channel: "platform", requesterUserId: ctx.user.id })
      .returning();
  const imageKey = await storeImage(thread!.id, input.image);
  await addMessage(db, thread!, { author: "requester", userId: ctx.user.id, body, imageKey });
  await db
    .update(supportThreads)
    .set({ requesterReadAt: new Date() })
    .where(eq(supportThreads.id, thread!.id));
  await assistantTurn(db, thread!, body, {
    audience: "staff",
    locale,
    base: `/dashboard/${ctx.restaurant.id}`,
    timezone: ctx.restaurant.timezone,
  });
  return view(db, thread);
}

/** Under an assistant reply: "this helped" (counted) or "talk to a person" (handed over). */
export async function staffFeedback(
  db: Database,
  ctx: RestaurantContext,
  choice: "helpful" | "human",
  slug?: string,
) {
  assertCan(ctx, "restaurant.view");
  const thread = await staffThreadRow(db, ctx.restaurant.id);
  if (!thread) throw notFound();
  await feedback(db, thread, choice, slug);
  return view(db, thread);
}

async function feedback(db: DbOrTx, thread: Thread, choice: "helpful" | "human", slug?: string) {
  if (choice === "human") return handOver(db, thread);
  if (slug)
    await db
      .update(supportArticles)
      .set({ helped: sql`${supportArticles.helped} + 1` })
      .where(eq(supportArticles.slug, slug));
  await addMessage(db, thread, { author: "bot", data: { code: "glad" } });
  return false;
}

/** Messages from the team the hotel has not read yet (sidebar badge). */
export async function staffUnread(db: DbOrTx, restaurantId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(supportMessages)
    .innerJoin(supportThreads, eq(supportThreads.id, supportMessages.threadId))
    .where(
      and(
        eq(supportThreads.restaurantId, restaurantId),
        eq(supportThreads.channel, "platform"),
        eq(supportMessages.author, "agent"),
        or(
          isNull(supportThreads.requesterReadAt),
          gt(supportMessages.createdAt, supportThreads.requesterReadAt),
        ),
      ),
    );
  return Number(r?.n ?? 0);
}

// ─── Guest ↔ front desk ─────────────────────────────────────────────────────

async function guestThreadRow(db: DbOrTx, guest: GuestContext) {
  const [t] = await db
    .select()
    .from(supportThreads)
    .where(
      and(
        eq(supportThreads.restaurantId, guest.restaurant.id),
        eq(supportThreads.channel, "guest"),
        eq(supportThreads.participantId, guest.participant.id),
        ne(supportThreads.status, "closed"),
      ),
    )
    .orderBy(desc(supportThreads.lastMessageAt))
    .limit(1);
  return t ?? null;
}

export async function guestConversation(db: DbOrTx, guest: GuestContext) {
  const t = await guestThreadRow(db, guest);
  if (t)
    await db.update(supportThreads).set({ requesterReadAt: new Date() }).where(eq(supportThreads.id, t.id));
  return view(db, t);
}

export async function guestSend(
  db: Database,
  guest: GuestContext,
  input: { body?: string; image?: File | null },
  locale: string,
) {
  const { body } = messageSchema.parse({ body: input.body ?? "" });
  if (!body && !input.image?.size) throw validation("message_empty");
  let thread = await guestThreadRow(db, guest);
  if (!thread)
    [thread] = await db
      .insert(supportThreads)
      .values({
        restaurantId: guest.restaurant.id,
        channel: "guest",
        guestId: guest.guestId,
        participantId: guest.participant.id,
        place: guest.table.label,
        guestName: guest.participant.displayName ?? null,
      })
      .returning();
  const imageKey = await storeImage(thread!.id, input.image);
  await addMessage(db, thread!, { author: "requester", body, imageKey });
  await db
    .update(supportThreads)
    .set({ requesterReadAt: new Date() })
    .where(eq(supportThreads.id, thread!.id));
  const { handedOver } = await assistantTurn(db, thread!, body, {
    audience: "guest",
    locale,
    base: "",
    timezone: guest.restaurant.timezone,
  });
  // Already with the desk: each new message pings the screens.
  if (!handedOver && thread!.status === "open")
    await emit(db, { topic: topics.restaurant(guest.restaurant.id), type: "notification.created" });
  return view(db, thread);
}

export async function guestFeedback(
  db: Database,
  guest: GuestContext,
  choice: "helpful" | "human",
  slug?: string,
) {
  const thread = await guestThreadRow(db, guest);
  if (!thread) throw notFound();
  await feedback(db, thread, choice, slug);
  return view(db, thread);
}

export async function guestUnread(db: DbOrTx, guest: GuestContext) {
  const t = await guestThreadRow(db, guest);
  if (!t) return 0;
  const [r] = await db
    .select({ n: count() })
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.threadId, t.id),
        eq(supportMessages.author, "agent"),
        t.requesterReadAt ? gt(supportMessages.createdAt, t.requesterReadAt) : undefined,
      ),
    );
  return Number(r?.n ?? 0);
}

// ─── Answering: the desk (guest conversations) and the platform team ───────

const unreadForAgent = sql<boolean>`exists (select 1 from "support_messages" m where m.thread_id = "support_threads"."id" and m.author = 'requester' and ("support_threads"."agent_read_at" is null or m.created_at > "support_threads"."agent_read_at"))`;
const lastText = sql<
  string | null
>`(select m.body from "support_messages" m where m.thread_id = "support_threads"."id" and m.author in ('requester','agent') order by m.created_at desc limit 1)`;

export type InboxRow = {
  id: string;
  status: string;
  place: string | null;
  guestName: string | null;
  restaurant: string;
  restaurantId: string;
  lastMessageAt: Date;
  unread: boolean;
  preview: string | null;
};

/** The guests' conversations with this hotel: those waiting for a person first. */
export async function deskInbox(db: DbOrTx, ctx: RestaurantContext): Promise<InboxRow[]> {
  assertCan(ctx, "restaurant.view");
  const rows = await db
    .select({
      id: supportThreads.id,
      status: supportThreads.status,
      place: supportThreads.place,
      guestName: supportThreads.guestName,
      restaurant: restaurants.name,
      restaurantId: supportThreads.restaurantId,
      lastMessageAt: supportThreads.lastMessageAt,
      unread: unreadForAgent,
      preview: lastText,
    })
    .from(supportThreads)
    .innerJoin(restaurants, eq(restaurants.id, supportThreads.restaurantId))
    .where(and(eq(supportThreads.restaurantId, ctx.restaurant.id), eq(supportThreads.channel, "guest")))
    .orderBy(
      sql`case ${supportThreads.status} when 'open' then 0 when 'bot' then 1 else 2 end`,
      desc(supportThreads.lastMessageAt),
    )
    .limit(100);
  return rows;
}

export async function deskUnread(db: DbOrTx, restaurantId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(supportThreads)
    .where(
      and(
        eq(supportThreads.restaurantId, restaurantId),
        eq(supportThreads.channel, "guest"),
        eq(supportThreads.status, "open"),
        unreadForAgent,
      ),
    );
  return Number(r?.n ?? 0);
}

async function deskThreadRow(db: DbOrTx, ctx: RestaurantContext, id: string) {
  const [t] = await db
    .select()
    .from(supportThreads)
    .where(
      and(
        eq(supportThreads.id, id),
        eq(supportThreads.restaurantId, ctx.restaurant.id),
        eq(supportThreads.channel, "guest"),
      ),
    );
  if (!t) throw notFound();
  return t;
}

export async function deskConversation(db: DbOrTx, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.view");
  const t = await deskThreadRow(db, ctx, id);
  await db.update(supportThreads).set({ agentReadAt: new Date() }).where(eq(supportThreads.id, t.id));
  return view(db, t);
}

export async function deskReply(
  db: Database,
  ctx: RestaurantContext,
  id: string,
  input: { body?: string; image?: File | null },
) {
  assertCan(ctx, "restaurant.view");
  const t = await deskThreadRow(db, ctx, id);
  return reply(db, t, ctx.user.id, input);
}

export async function deskClose(db: DbOrTx, ctx: RestaurantContext, id: string) {
  assertCan(ctx, "restaurant.view");
  const t = await deskThreadRow(db, ctx, id);
  return close(db, t, ctx.user.id);
}

async function reply(db: Database, t: Thread, userId: string, input: { body?: string; image?: File | null }) {
  const { body } = messageSchema.parse({ body: input.body ?? "" });
  if (!body && !input.image?.size) throw validation("message_empty");
  const imageKey = await storeImage(t.id, input.image);
  if (t.status !== "open")
    await db
      .update(supportThreads)
      .set({ status: "open", closedAt: null })
      .where(eq(supportThreads.id, t.id));
  await addMessage(db, t, { author: "agent", userId, body, imageKey });
  await db
    .update(supportThreads)
    .set({ agentReadAt: new Date(), assigneeUserId: userId })
    .where(eq(supportThreads.id, t.id));
  if (t.channel === "platform")
    await emit(db, { topic: topics.restaurant(t.restaurantId), type: "notification.created" });
  return view(db, { ...t, status: "open" });
}

async function close(db: DbOrTx, t: Thread, userId: string) {
  await db
    .update(supportThreads)
    .set({ status: "closed", closedAt: new Date(), agentReadAt: new Date() })
    .where(eq(supportThreads.id, t.id));
  await addMessage(db, t, { author: "system", userId, data: { code: "closed" } });
  return { ok: true };
}

function assertPlatform(user: { isSuperAdmin: boolean }) {
  if (!user.isSuperAdmin) throw notFound();
}

/** Every hotel's conversation with the team: waiting for a person first. */
export async function platformInbox(db: DbOrTx, user: { isSuperAdmin: boolean }): Promise<InboxRow[]> {
  assertPlatform(user);
  return db
    .select({
      id: supportThreads.id,
      status: supportThreads.status,
      place: supportThreads.place,
      guestName: users.fullName,
      restaurant: restaurants.name,
      restaurantId: supportThreads.restaurantId,
      lastMessageAt: supportThreads.lastMessageAt,
      unread: unreadForAgent,
      preview: lastText,
    })
    .from(supportThreads)
    .innerJoin(restaurants, eq(restaurants.id, supportThreads.restaurantId))
    .leftJoin(users, eq(users.id, supportThreads.requesterUserId))
    .where(eq(supportThreads.channel, "platform"))
    .orderBy(
      sql`case ${supportThreads.status} when 'open' then 0 when 'bot' then 1 else 2 end`,
      desc(supportThreads.lastMessageAt),
    )
    .limit(200);
}

export async function platformUnread(db: DbOrTx) {
  const [r] = await db
    .select({ n: count() })
    .from(supportThreads)
    .where(and(eq(supportThreads.channel, "platform"), eq(supportThreads.status, "open"), unreadForAgent));
  return Number(r?.n ?? 0);
}

async function platformThreadRow(db: DbOrTx, id: string) {
  const [t] = await db
    .select()
    .from(supportThreads)
    .where(and(eq(supportThreads.id, id), eq(supportThreads.channel, "platform")));
  if (!t) throw notFound();
  return t;
}

/** A conversation with the hotel's file beside it, so the team need not ask. */
export async function platformConversation(db: DbOrTx, user: { isSuperAdmin: boolean }, id: string) {
  assertPlatform(user);
  const t = await platformThreadRow(db, id);
  await db.update(supportThreads).set({ agentReadAt: new Date() }).where(eq(supportThreads.id, t.id));
  const [r] = await db
    .select({
      id: restaurants.id,
      name: restaurants.name,
      kind: restaurants.kind,
      status: restaurants.status,
      phone: restaurants.phone,
      timezone: restaurants.timezone,
      createdAt: restaurants.createdAt,
    })
    .from(restaurants)
    .where(eq(restaurants.id, t.restaurantId));
  const [[requester], [members], [rooms], [settings], checks] = await Promise.all([
    t.requesterUserId
      ? db
          .select({ name: users.fullName, email: users.email })
          .from(users)
          .where(eq(users.id, t.requesterUserId))
      : Promise.resolve([null]),
    db
      .select({ n: count() })
      .from(restaurantMembers)
      .where(and(eq(restaurantMembers.restaurantId, t.restaurantId), eq(restaurantMembers.status, "active"))),
    db
      .select({ n: count() })
      .from(diningTables)
      .where(and(eq(diningTables.restaurantId, t.restaurantId), isNull(diningTables.deletedAt))),
    db
      .select({ day: pmsSettings.businessDate })
      .from(pmsSettings)
      .where(eq(pmsSettings.restaurantId, t.restaurantId)),
    staffChecks(db, t.restaurantId, r?.timezone ?? "Asia/Tehran", "printer audit qr"),
  ]);
  return {
    ...(await view(db, t))!,
    account: {
      ...r!,
      requester: requester ?? null,
      members: Number(members?.n ?? 0),
      places: Number(rooms?.n ?? 0),
      businessDate: settings?.day ?? null,
      checks,
    },
  };
}

export async function platformReply(
  db: Database,
  user: { id: string; isSuperAdmin: boolean },
  id: string,
  input: { body?: string; image?: File | null },
) {
  assertPlatform(user);
  return reply(db, await platformThreadRow(db, id), user.id, input);
}

export async function platformClose(db: DbOrTx, user: { id: string; isSuperAdmin: boolean }, id: string) {
  assertPlatform(user);
  return close(db, await platformThreadRow(db, id), user.id);
}

// ─── Articles editing (platform team) ───────────────────────────────────────

const langs = z.object({
  fa: z.string().trim().max(2000),
  en: z.string().trim().max(2000),
  fr: z.string().trim().max(2000),
  ar: z.string().trim().max(2000),
});
export const articleSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,60}$/),
  audience: z.enum(["staff", "guest"]),
  title: langs,
  body: langs,
  keywords: z.string().trim().max(2000),
  href: z.string().trim().max(200).optional(),
  published: z.boolean(),
});

export async function listArticles(db: DbOrTx, user: { isSuperAdmin: boolean }) {
  assertPlatform(user);
  await ensureArticles(db);
  return db
    .select()
    .from(supportArticles)
    .orderBy(asc(supportArticles.audience), asc(supportArticles.sortOrder));
}

export async function saveArticle(
  db: DbOrTx,
  user: { isSuperAdmin: boolean },
  id: string | null,
  raw: z.input<typeof articleSchema>,
) {
  assertPlatform(user);
  const v = articleSchema.parse(raw);
  if (!v.title.fa && !v.title.en) throw validation("title_required");
  const values = { ...v, href: v.href || null };
  if (id) {
    const [row] = await db.update(supportArticles).set(values).where(eq(supportArticles.id, id)).returning();
    if (!row) throw notFound();
    return row;
  }
  const [row] = await db
    .insert(supportArticles)
    .values({ ...values, sortOrder: 1000 })
    .returning();
  return row!;
}

export async function deleteArticle(db: DbOrTx, user: { isSuperAdmin: boolean }, id: string) {
  assertPlatform(user);
  await db.delete(supportArticles).where(eq(supportArticles.id, id));
}

// ─── Private images ─────────────────────────────────────────────────────────

/**
 * Who may see a conversation's image: its guest (same seat), the hotel's staff, the platform team
 * (its own channel). Returns the thread or null.
 */
export async function imageThread(db: DbOrTx, key: string) {
  if (!IMAGE_KEY_RE.test(key)) return null;
  const [row] = await db
    .select({ thread: supportThreads })
    .from(supportMessages)
    .innerJoin(supportThreads, eq(supportThreads.id, supportMessages.threadId))
    .where(eq(supportMessages.imageKey, key))
    .limit(1);
  return row?.thread ?? null;
}
