"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Headset, MessageCircle, X } from "@/components/icons";
import { cn } from "@/lib/cn";
import { ChatThread, type ChatMessage } from "./chat";
import {
  staffConversationAction,
  staffFeedbackAction,
  staffSendAction,
  supportBadgesAction,
} from "@/app/[locale]/dashboard/[restaurantId]/support-actions";
import {
  guestConversationAction,
  guestFeedbackAction,
  guestSendAction,
  guestUnreadAction,
} from "@/app/[locale]/table/support-actions";

type Conv = { thread: { status: string }; messages: ChatMessage[] } | null;
type Res<T> = { ok: true; data?: T } | { ok: false; error: string } | null;

/** Opens the support chat from anywhere on the page (e.g. the concierge's "talk to the desk"). */
export const openSupport = () => window.dispatchEvent(new Event("support:open"));

function Launcher({
  title,
  agentLabel,
  welcome,
  suggestions,
  load,
  send,
  feedback,
  unread,
  className,
  icon,
}: {
  title: string;
  agentLabel: string;
  welcome: string;
  suggestions: string[];
  load: () => Promise<Res<Conv>>;
  send: (fd: FormData) => Promise<Res<Conv>>;
  feedback: (choice: "helpful" | "human", slug?: string) => Promise<Res<Conv>>;
  unread: () => Promise<number>;
  className?: string;
  icon: React.ReactNode;
}) {
  const t = useTranslations("support");
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<Conv>(null);
  const [badge, setBadge] = useState(0);

  const refresh = useCallback(async () => {
    const r = await load();
    if (r?.ok) setConv(r.data ?? null);
  }, [load]);

  // Open: the conversation, refreshed every 4 s (replies arrive live). Closed: the badge, every 30 s.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (open) await refresh();
      else {
        const n = await unread().catch(() => 0);
        if (alive) setBadge(n);
      }
    };
    const first = setTimeout(tick, open ? 0 : 1500);
    const id = setInterval(tick, open ? 4000 : 30_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [open, refresh, unread]);

  useEffect(() => {
    const show = () => {
      setOpen(true);
      setBadge(0);
    };
    window.addEventListener("support:open", show);
    return () => window.removeEventListener("support:open", show);
  }, []);

  const after = (r: Res<Conv>) => {
    if (r?.ok) setConv(r.data ?? null);
    return r;
  };

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setBadge(0);
          }}
          aria-label={title}
          title={title}
          className={cn(
            "k-cut k-oct fixed z-40 grid size-13 place-items-center bg-brand-700 text-white shadow-[var(--shadow-card)] transition hover:scale-105 hover:bg-brand-800 print:hidden",
            className,
          )}
        >
          {icon}
          {badge ? (
            <span className="k-cut k-sm absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center bg-danger px-1 text-[11px] font-bold text-white tabular-nums">
              {badge}
            </span>
          ) : null}
        </button>
      ) : (
        <section
          role="dialog"
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(85dvh,640px)] flex-col overflow-hidden rounded-t-3xl border border-border bg-bg shadow-[var(--shadow-card)] sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[400px] sm:rounded-3xl print:hidden"
        >
          <header className="flex items-center gap-3 bg-ink px-4 py-3 text-ink-fg">
            <span className="k-cut k-oct grid size-9 place-items-center bg-white/15" aria-hidden="true">
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold">{title}</h2>
              <p className="text-[11px] opacity-75">
                {conv?.thread.status === "open" ? t("withPerson", { who: agentLabel }) : t("withAssistant")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="k-cut k-oct grid size-9 place-items-center hover:bg-white/15"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>
          <ChatThread
            className="flex-1"
            messages={conv?.messages ?? []}
            me="requester"
            status={conv?.thread.status ?? "bot"}
            welcome={welcome}
            suggestions={suggestions}
            agentLabel={agentLabel}
            onSend={async (fd) => after(await send(fd))}
            onFeedback={async (c, s) => after(await feedback(c, s))}
          />
        </section>
      )}
    </>
  );
}

/** Hotel / restaurant staff ↔ the Spotihotel team, on every dashboard page. */
export function StaffSupport({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("support");
  const rid = restaurantId;
  const load = useCallback(() => staffConversationAction(rid) as Promise<Res<Conv>>, [rid]);
  const unread = useCallback(async () => {
    const r = await supportBadgesAction(rid);
    return r?.ok ? (r.data?.team ?? 0) : 0;
  }, [rid]);
  return (
    <Launcher
      title={t("staffTitle")}
      agentLabel={t("team")}
      welcome={t("staffWelcome")}
      suggestions={[t("suggest.audit"), t("suggest.printer"), t("suggest.checkout"), t("suggest.qr")]}
      load={load}
      send={(fd) => staffSendAction(rid, fd) as Promise<Res<Conv>>}
      feedback={(c, s) => staffFeedbackAction(rid, c, s) as Promise<Res<Conv>>}
      unread={unread}
      className="end-4 bottom-20 lg:end-6 lg:bottom-6"
      icon={<Headset className="size-6" aria-hidden="true" />}
    />
  );
}

/** A guest ↔ the front desk, on the guest pages (the stay page has it inside its concierge). */
export function GuestSupport() {
  const t = useTranslations("support");
  const path = usePathname();
  const load = useCallback(() => guestConversationAction() as Promise<Res<Conv>>, []);
  const unread = useCallback(async () => {
    const r = await guestUnreadAction();
    return r?.ok ? (r.data ?? 0) : 0;
  }, []);
  const onStay = /\/table\/stay$/.test(path);
  const inGame = /\/table\/games\//.test(path);
  return (
    <Launcher
      title={t("guestTitle")}
      agentLabel={t("desk")}
      welcome={t("guestWelcome")}
      suggestions={[t("suggest.wifi"), t("suggest.order"), t("suggest.towels"), t("suggest.bill")]}
      load={load}
      send={(fd) => guestSendAction(fd) as Promise<Res<Conv>>}
      feedback={(c, s) => guestFeedbackAction(c, s) as Promise<Res<Conv>>}
      unread={unread}
      // Above the cart bar; hidden as a bubble where another button holds the spot.
      className={cn("end-4 bottom-24", (onStay || inGame) && "hidden")}
      icon={<MessageCircle className="size-6" aria-hidden="true" />}
    />
  );
}
