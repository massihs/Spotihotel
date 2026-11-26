"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { runAction } from "@/server/actions";
import { requireUser } from "@/server/auth/current";
import { notFound } from "@/server/errors";
import {
  deleteArticle,
  platformClose,
  platformConversation,
  platformInbox,
  platformReply,
  platformUnread,
  saveArticle,
  type articleSchema,
} from "@/server/modules/support/service";

async function admin() {
  const user = await requireUser();
  if (!user.isSuperAdmin) throw notFound();
  return user;
}

export async function platformInboxAction() {
  return runAction(async () => {
    const user = await admin();
    const [rows, unread] = await Promise.all([platformInbox(db, user), platformUnread(db)]);
    return { rows, unread };
  });
}
export async function platformConversationAction(id: string) {
  return runAction(async () => platformConversation(db, await admin(), id));
}
export async function platformReplyAction(id: string, fd: FormData) {
  return runAction(async () => {
    const f = fd.get("image");
    return platformReply(db, await admin(), id, {
      body: String(fd.get("body") ?? ""),
      image: f instanceof File && f.size ? f : null,
    });
  });
}
export async function platformCloseAction(id: string) {
  return runAction(async () => platformClose(db, await admin(), id));
}
export async function saveArticleAction(id: string | null, input: z.input<typeof articleSchema>) {
  return runAction(async () => {
    const row = await saveArticle(db, await admin(), id, input);
    refresh();
    return row.id;
  });
}
export async function deleteArticleAction(id: string) {
  return runAction(async () => {
    await deleteArticle(db, await admin(), id);
    refresh();
  });
}
