import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { notifications, users } from "@/server/db/schema";
import {
  deskConversation,
  deskInbox,
  deskReply,
  deskUnread,
  guestConversation,
  guestSend,
  guestUnread,
  platformConversation,
  platformInbox,
  platformReply,
  staffFeedback,
  staffSend,
  staffUnread,
} from "@/server/modules/support/service";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext } from "@/server/modules/guest/sessions";
import { createOwnerWithRestaurant } from "../helpers/factories";
import { randomUUID } from "node:crypto";

describe("live support", () => {
  it("staff: the assistant answers from the articles, then hands over to the team, who replies", async () => {
    const { ctx } = await createOwnerWithRestaurant("Support Hotel");
    const first = await staffSend(db, ctx, { body: "چاپگر آشپزخانه چاپ نمی‌کند" }, "fa");
    const bot = first!.messages.at(-1)!;
    expect(bot.author).toBe("bot");
    expect(bot.data?.articles?.[0]?.slug).toBe("printer");
    expect(bot.data?.articles?.[0]?.href).toBe(`/dashboard/${ctx.restaurant.id}/settings#printing`);
    // The hotel's own setup is checked: no printer defined yet.
    expect(bot.data?.checks?.some((c) => c.code === "printers_none")).toBe(true);
    expect(first!.thread.status).toBe("bot");

    const human = await staffFeedback(db, ctx, "human");
    expect(human!.thread.status).toBe("open");
    expect(human!.messages.at(-1)!.data?.code).toBe("handover_team");

    const [admin] = await db
      .update(users)
      .set({ isSuperAdmin: true })
      .where(eq(users.id, ctx.user.id))
      .returning();
    const inbox = await platformInbox(db, admin!);
    const row = inbox.find((r) => r.id === first!.thread.id)!;
    expect(row.unread).toBe(true);
    const file = await platformConversation(db, admin!, row.id);
    expect(file.account.name).toBe("Support Hotel");
    await platformReply(db, admin!, row.id, { body: "سلام، آدرس IP چاپگر را بفرستید." });
    expect(await staffUnread(db, ctx.restaurant.id)).toBe(1);
  });

  it("staff: an unknown question goes straight to a person", async () => {
    const { ctx } = await createOwnerWithRestaurant("Support Hotel 2");
    const v = await staffSend(db, ctx, { body: "blue elephant quantum" }, "en");
    expect(v!.thread.status).toBe("open");
  });

  it("guest: Wi-Fi answered by the hotel's own data; otherwise the desk is told and replies", async () => {
    const { ctx } = await createOwnerWithRestaurant("Guest Support Hotel");
    await bulkCreateTables(db, ctx, { from: 1, to: 1 });
    const [table] = await listTables(db, ctx);
    const device = randomUUID();
    const entry = await enterTableByQr(db, table!.qrToken, device);
    const guest = (await loadGuestContext(db, device, entry!.participant.id))!;

    const a = await guestSend(db, guest, { body: "How do I order?" }, "en");
    expect(a!.messages.at(-1)!.data?.articles?.[0]?.slug).toBe("guest-order");

    const b = await guestSend(db, guest, { body: "the shower is leaking a lot please help" }, "en");
    expect(b!.thread.status).toBe("open");
    const [n] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.restaurantId, ctx.restaurant.id));
    expect(n?.type).toBe("support.guest");
    expect(await deskUnread(db, ctx.restaurant.id)).toBe(1);

    const inbox = await deskInbox(db, ctx);
    expect(inbox[0]!.place).toBe(table!.label);
    await deskConversation(db, ctx, inbox[0]!.id);
    expect(await deskUnread(db, ctx.restaurant.id)).toBe(0);
    await deskReply(db, ctx, inbox[0]!.id, { body: "On arrive tout de suite." });
    expect(await guestUnread(db, guest)).toBe(1);
    await guestConversation(db, guest);
    expect(await guestUnread(db, guest)).toBe(0);

    // Another hotel cannot read or answer it.
    const other = await createOwnerWithRestaurant("Other Hotel");
    await expect(deskConversation(db, other.ctx, inbox[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await deskInbox(db, other.ctx)).toEqual([]);
  });
});
