"use server";

import { getLocale } from "next-intl/server";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { requireGuest } from "@/server/modules/guest/current";
import { guestConversation, guestFeedback, guestSend, guestUnread } from "@/server/modules/support/service";

// A guest's conversation with the front desk (help is never limited by the 30-minute scan window).
export async function guestConversationAction() {
  return runAction(async () => guestConversation(db, await requireGuest()));
}
export async function guestSendAction(fd: FormData) {
  return runAction(async () => {
    const guest = await requireGuest();
    await enforceRateLimit("guestWrite", guest.guestId);
    const f = fd.get("image");
    return guestSend(
      db,
      guest,
      { body: String(fd.get("body") ?? ""), image: f instanceof File && f.size ? f : null },
      await getLocale(),
    );
  });
}
export async function guestFeedbackAction(choice: "helpful" | "human", slug?: string) {
  return runAction(async () =>
    guestFeedback(db, await requireGuest(), choice === "human" ? "human" : "helpful", slug),
  );
}
export async function guestUnreadAction() {
  return runAction(async () => guestUnread(db, await requireGuest()));
}
