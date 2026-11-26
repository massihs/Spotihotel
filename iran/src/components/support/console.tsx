"use client";

import { useCallback, useEffect, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, CircleAlert, CircleCheck, Inbox, MessagesSquare } from "@/components/icons";
import { cn } from "@/lib/cn";
import { ChatThread, checkValues, type ChatMessage } from "./chat";

export type InboxItem = {
  id: string;
  status: string;
  place: string | null;
  guestName: string | null;
  restaurant: string;
  lastMessageAt: Date | string;
  unread: boolean;
  preview: string | null;
};
type Conv = { thread: { id: string; status: string }; messages: ChatMessage[] } & Record<string, unknown>;
type Res<T> = { ok: true; data?: T } | { ok: false; error: string } | null;

/**
 * Answering screen: the conversations (waiting for a person first, unread in bold) and the open
 * one, refreshed every few seconds. `side` renders an extra panel (the hotel's file for the team).
 */
export function SupportConsole({
  title,
  loadInbox,
  loadThread,
  reply,
  close,
  rowTitle,
  side,
  agentLabel,
  requesterLabel,
}: {
  title: string;
  loadInbox: () => Promise<Res<InboxItem[]>>;
  loadThread: (id: string) => Promise<Res<Conv>>;
  reply: (id: string, fd: FormData) => Promise<Res<Conv>>;
  close: (id: string) => Promise<Res<unknown>>;
  rowTitle: (r: InboxItem) => string;
  side?: (conv: Conv) => ReactNode;
  agentLabel: string;
  requesterLabel?: (r: InboxItem | null) => string | undefined;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const [rows, setRows] = useState<InboxItem[] | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [conv, setConv] = useState<Conv | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const [pending, start] = useTransition();

  const refreshInbox = useCallback(async () => {
    const r = await loadInbox();
    if (r?.ok) setRows(r.data ?? []);
  }, [loadInbox]);
  const refreshThread = useCallback(async () => {
    if (!current) return;
    const r = await loadThread(current);
    if (r?.ok) setConv(r.data ?? null);
  }, [current, loadThread]);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && void refreshInbox();
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refreshInbox]);
  useEffect(() => {
    if (!current) return;
    let alive = true;
    const tick = () => alive && void refreshThread();
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
    };
  }, [current, refreshThread]);

  const shown = (rows ?? []).filter((r) => filter === "all" || r.status !== "closed");
  const time = (d: Date | string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    }).format(new Date(d));

  return (
    <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={cn("rounded-2xl border border-border bg-surface", current && "max-lg:hidden")}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Inbox className="size-4" aria-hidden="true" />
            {title}
          </h2>
          <div className="flex gap-1 rounded-full bg-surface-2 p-0.5 text-xs font-semibold">
            {(["active", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "rounded-full px-2.5 py-1",
                  filter === f ? "bg-surface shadow-sm" : "text-fg-muted",
                )}
              >
                {t(`filter.${f}`)}
              </button>
            ))}
          </div>
        </div>
        {rows && !shown.length ? (
          <p className="px-4 py-10 text-center text-sm text-fg-muted">{t("inboxEmpty")}</p>
        ) : null}
        <ul className="max-h-[70dvh] divide-y divide-border overflow-y-auto">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  setConv(null);
                  setCurrent(r.id);
                }}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-start hover:bg-surface-2",
                  current === r.id && "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 rounded-full",
                    r.status === "open"
                      ? r.unread
                        ? "bg-danger"
                        : "bg-warning"
                      : r.status === "bot"
                        ? "bg-accent"
                        : "bg-border",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", r.unread ? "font-extrabold" : "font-semibold")}>
                      {rowTitle(r)}
                    </span>
                    <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums">
                      {time(r.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    {r.preview || t(`status.${r.status}`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section
        className={cn(
          "flex min-h-[60dvh] flex-col rounded-2xl border border-border bg-bg",
          !current && "max-lg:hidden",
        )}
      >
        {!current || !conv ? (
          <div className="grid flex-1 place-items-center p-10 text-center text-sm text-fg-muted">
            <span>
              <MessagesSquare className="mx-auto mb-3 size-10 opacity-40" aria-hidden="true" />
              {current ? t("loading") : t("pick")}
            </span>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrent(null)}
                  className="rounded-full px-2 py-1 text-xs font-semibold text-fg-muted ring-1 ring-border lg:hidden"
                >
                  {t("back")}
                </button>
                <h3 className="text-sm font-bold">
                  {rowTitle((rows ?? []).find((r) => r.id === current) ?? ({} as InboxItem))}
                </h3>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                  {t(`status.${conv.thread.status}`)}
                </span>
              </div>
              {conv.thread.status !== "closed" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await close(conv.thread.id);
                      await Promise.all([refreshThread(), refreshInbox()]);
                    })
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-fg-muted ring-1 ring-border hover:text-fg"
                >
                  <CheckCheck className="size-4" aria-hidden="true" />
                  {t("resolve")}
                </button>
              ) : null}
            </header>
            <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
              <ChatThread
                className="min-h-[50dvh] flex-1"
                messages={conv.messages}
                me="agent"
                status={conv.thread.status}
                agentLabel={agentLabel}
                requesterLabel={requesterLabel?.((rows ?? []).find((r) => r.id === current) ?? null)}
                onSend={async (fd) => {
                  const r = await reply(conv.thread.id, fd);
                  if (r?.ok && r.data) setConv(r.data);
                  void refreshInbox();
                  return r;
                }}
              />
              {side ? (
                <div className="border-border max-xl:border-t xl:w-72 xl:border-s">{side(conv)}</div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

/** The checks list (printers, closing the day, QR) shown in the team's account panel. */
export function CheckList({
  checks,
}: {
  checks: { ok: boolean; code: string; values?: Record<string, string | number> }[];
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  return (
    <ul className="space-y-1.5">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-2 text-xs">
          {c.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          )}
          {t.has(`checks.${c.code}`)
            ? t(`checks.${c.code}` as "checks.audit_ok", checkValues(c.values, locale))
            : c.code}
        </li>
      ))}
    </ul>
  );
}
