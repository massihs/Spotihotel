"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { SupportConsole, type InboxItem } from "./console";
import {
  deskCloseAction,
  deskConversationAction,
  deskInboxAction,
  deskReplyAction,
} from "@/app/[locale]/dashboard/[restaurantId]/support-actions";

type Res<T> = { ok: true; data?: T } | { ok: false; error: string } | null;

/** The front desk answering the guests' conversations. */
export function DeskConsole({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("support");
  const rid = restaurantId;
  const loadInbox = useCallback(() => deskInboxAction(rid) as Promise<Res<InboxItem[]>>, [rid]);
  const loadThread = useCallback((id: string) => deskConversationAction(rid, id) as never, [rid]);
  return (
    <SupportConsole
      title={t("guestsInbox")}
      loadInbox={loadInbox}
      loadThread={loadThread}
      reply={(id, fd) => deskReplyAction(rid, id, fd) as never}
      close={(id) => deskCloseAction(rid, id) as never}
      rowTitle={(r) =>
        [r.place ? t("place", { place: r.place }) : null, r.guestName].filter(Boolean).join(" · ") ||
        t("customer")
      }
      agentLabel={t("desk")}
    />
  );
}
