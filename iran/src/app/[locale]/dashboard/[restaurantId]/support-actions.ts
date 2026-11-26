"use server";

import { getLocale } from "next-intl/server";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import {
  deskClose,
  deskConversation,
  deskInbox,
  deskReply,
  deskUnread,
  staffConversation,
  staffFeedback,
  staffSend,
  staffUnread,
} from "@/server/modules/support/service";

const file = (fd: FormData) => {
  const f = fd.get("image");
  return f instanceof File && f.size ? f : null;
};

// The hotel's conversation with the Spotihotel team.
export async function staffConversationAction(rid: string) {
  return runAction(async () => staffConversation(db, await actionContext(rid, "restaurant.view")));
}
export async function staffSendAction(rid: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    await enforceRateLimit("guestWrite", ctx.user.id);
    return staffSend(db, ctx, { body: String(fd.get("body") ?? ""), image: file(fd) }, await getLocale());
  });
}
export async function staffFeedbackAction(rid: string, choice: "helpful" | "human", slug?: string) {
  return runAction(async () =>
    staffFeedback(
      db,
      await actionContext(rid, "restaurant.view"),
      choice === "human" ? "human" : "helpful",
      slug,
    ),
  );
}

// The guests' conversations, answered by the front desk.
export async function deskInboxAction(rid: string) {
  return runAction(async () => deskInbox(db, await actionContext(rid, "restaurant.view")));
}
export async function deskConversationAction(rid: string, id: string) {
  return runAction(async () => deskConversation(db, await actionContext(rid, "restaurant.view"), id));
}
export async function deskReplyAction(rid: string, id: string, fd: FormData) {
  return runAction(async () =>
    deskReply(db, await actionContext(rid, "restaurant.view"), id, {
      body: String(fd.get("body") ?? ""),
      image: file(fd),
    }),
  );
}
export async function deskCloseAction(rid: string, id: string) {
  return runAction(async () => deskClose(db, await actionContext(rid, "restaurant.view"), id));
}

/** Badges: unread replies from the team, guest conversations waiting for the desk. */
export async function supportBadgesAction(rid: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.view");
    const [team, desk] = await Promise.all([
      staffUnread(db, ctx.restaurant.id),
      deskUnread(db, ctx.restaurant.id),
    ]);
    return { team, desk };
  });
}
