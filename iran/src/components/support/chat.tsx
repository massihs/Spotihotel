"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Bot,
  CircleAlert,
  CircleCheck,
  ImagePlus,
  LoaderCircle,
  SendHorizontal,
  ThumbsUp,
  UserRound,
  X,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type ChatMessage = {
  id: string;
  author: string;
  body: string;
  imageKey: string | null;
  createdAt: Date | string;
  data: {
    code?: string;
    articles?: { slug: string; title: string; body: string; href: string | null }[];
    checks?: { ok: boolean; code: string; values?: Record<string, string | number> }[];
    offer?: ("helpful" | "human")[];
  } | null;
};

type Result = { ok: boolean; error?: string } | null | undefined;

/**
 * A support conversation: bubbles (mine on the start side), the assistant's answers with their
 * help articles and checks, a composer with a photo / screenshot.
 */
export function ChatThread({
  messages,
  me,
  status,
  onSend,
  onFeedback,
  welcome,
  suggestions,
  agentLabel,
  requesterLabel,
  className,
}: {
  messages: ChatMessage[];
  /** Which author is "me" on this screen. */
  me: "requester" | "agent";
  status: string | null;
  onSend: (fd: FormData) => Promise<Result>;
  onFeedback?: (choice: "helpful" | "human", slug?: string) => Promise<Result>;
  welcome?: ReactNode;
  suggestions?: string[];
  /** The people answering ("Front desk", "Spotihotel team"). */
  agentLabel: string;
  /** Who wrote on the other side ("Guest", or the hotel's name for the team). */
  requesterLabel?: string;
  className?: string;
}) {
  const t = useTranslations("support");
  const end = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);
  const lastBot = [...messages].reverse().find((m) => m.author === "bot" && m.data?.offer?.length);
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
        aria-live="polite"
      >
        {welcome ? (
          <Bubble side="other" icon={<Bot />} who={t("assistant")}>
            {welcome}
          </Bubble>
        ) : null}
        {messages.length === 0 && suggestions?.length && me === "requester" ? (
          <div className="flex flex-wrap gap-1.5 ps-10">
            {suggestions.map((s) => (
              <SuggestionChip key={s} text={s} onSend={onSend} />
            ))}
          </div>
        ) : null}
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            m={m}
            me={me}
            agentLabel={agentLabel}
            requesterLabel={requesterLabel}
            offer={m.id === lastBot?.id && status === "bot" ? onFeedback : undefined}
          />
        ))}
        <div ref={end} />
      </div>
      {status === "closed" && me === "agent" ? (
        <p className="border-t border-border px-4 py-3 text-center text-xs text-fg-muted">
          {t("closedNote")}
        </p>
      ) : (
        <Composer onSend={onSend} />
      )}
    </div>
  );
}

function SuggestionChip({ text, onSend }: { text: string; onSend: (fd: FormData) => Promise<Result> }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const fd = new FormData();
          fd.set("body", text);
          await onSend(fd);
        })
      }
      className="rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-fg-muted ring-1 ring-border hover:bg-surface-2 hover:text-fg disabled:opacity-60"
    >
      {text}
    </button>
  );
}

function Bubble({
  side,
  icon,
  who,
  time,
  children,
  tone,
}: {
  side: "me" | "other";
  icon?: ReactNode;
  who?: string;
  time?: string;
  children: ReactNode;
  tone?: "bot";
}) {
  return (
    <div className={cn("flex items-end gap-2", side === "me" && "flex-row-reverse")}>
      {side === "other" ? (
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4",
            tone === "bot" || !who ? "shade-fill" : "bg-surface-2 text-fg-muted",
          )}
          aria-hidden="true"
        >
          {icon ?? <UserRound />}
        </span>
      ) : null}
      <div className={cn("max-w-[85%] min-w-0", side === "me" && "items-end text-end")}>
        {who ? <p className="mb-1 px-1 text-[11px] font-semibold text-fg-subtle">{who}</p> : null}
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap",
            side === "me"
              ? "rounded-ee-md bg-brand-700 text-white"
              : "rounded-es-md bg-surface text-fg shadow-[var(--shadow-soft)] ring-1 ring-border",
          )}
        >
          {children}
        </div>
        {time ? <p className="mt-1 px-1 text-[10px] text-fg-subtle tabular-nums">{time}</p> : null}
      </div>
    </div>
  );
}

function MessageRow({
  m,
  me,
  agentLabel,
  requesterLabel,
  offer,
}: {
  m: ChatMessage;
  me: "requester" | "agent";
  agentLabel: string;
  requesterLabel?: string;
  offer?: (choice: "helpful" | "human", slug?: string) => Promise<Result>;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(
    new Date(m.createdAt),
  );
  if (m.author === "system")
    return (
      <p className="mx-auto w-fit max-w-[90%] rounded-full bg-surface-2 px-3 py-1 text-center text-[11px] font-semibold text-fg-muted">
        {t.has(`system.${m.data?.code}`) ? t(`system.${m.data?.code}` as "system.closed") : m.data?.code}
      </p>
    );
  if (m.author === "bot") return <BotMessage m={m} time={time} offer={offer} />;
  const mine = m.author === me;
  const who = mine ? undefined : m.author === "agent" ? agentLabel : (requesterLabel ?? t("customer"));
  return (
    <Bubble side={mine ? "me" : "other"} who={who} time={time}>
      {m.imageKey ? (
        <a
          href={`/api/v1/support/files/${m.imageKey}`}
          target="_blank"
          rel="noreferrer"
          className="mb-1.5 block"
        >
          <img
            src={`/api/v1/support/files/${m.imageKey}`}
            alt={t("photo")}
            className="max-h-56 rounded-xl object-cover"
            loading="lazy"
          />
        </a>
      ) : null}
      {m.body}
    </Bubble>
  );
}

function BotMessage({
  m,
  time,
  offer,
}: {
  m: ChatMessage;
  time: string;
  offer?: (choice: "helpful" | "human", slug?: string) => Promise<Result>;
}) {
  const t = useTranslations("support");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const d = m.data ?? {};
  return (
    <Bubble side="other" icon={<Bot />} who={t("assistant")} time={time} tone="bot">
      <p>{t.has(`bot.${d.code}`) ? t(`bot.${d.code}` as "bot.found") : ""}</p>
      {d.checks?.length ? (
        <ul className="mt-2 space-y-1.5">
          {d.checks.map((c, i) => (
            <li
              key={i}
              className={cn("flex items-start gap-2 text-[13px]", c.ok ? "text-success" : "text-warning")}
            >
              {c.ok ? (
                <CircleCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <CircleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
              )}
              <span className="text-fg">
                {t.has(`checks.${c.code}`)
                  ? t(`checks.${c.code}` as "checks.audit_ok", checkValues(c.values, locale))
                  : c.code}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {d.articles?.length ? (
        <div className="mt-2.5 space-y-2">
          {d.articles.map((a) => (
            <article key={a.slug} className="rounded-xl bg-surface-2 p-3">
              <h4 className="text-[13px] font-bold">{a.title}</h4>
              <p className="mt-1 text-[13px] leading-6 text-fg-muted">{a.body}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.href ? (
                  <Link
                    href={a.href}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-semibold text-accent-text ring-1 ring-border hover:bg-bg"
                  >
                    {t("openPage")}
                    <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                  </Link>
                ) : null}
                {offer ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => void (await offer("helpful", a.slug)))}
                    className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-xs font-semibold text-fg-muted ring-1 ring-border hover:text-fg disabled:opacity-60"
                  >
                    <ThumbsUp className="size-3.5" aria-hidden="true" />
                    {t("helped")}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {offer ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await offer("human")))}
          className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-brand-700 px-3 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          {t("talkToHuman")}
        </button>
      ) : null}
    </Bubble>
  );
}

function Composer({ onSend }: { onSend: (fd: FormData) => Promise<Result> }) {
  const t = useTranslations("support");
  const tErr = useTranslations("errorCodes");
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const send = () => {
    if (pending || (!text.trim() && !image)) return;
    const fd = new FormData();
    fd.set("body", text.trim());
    if (image) fd.set("image", image);
    start(async () => {
      setError(null);
      const res = await onSend(fd);
      if (res && !res.ok) setError(res.error && tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
      else {
        setText("");
        setImage(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  };
  return (
    <div className="border-t border-border bg-surface px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      {error ? (
        <p role="alert" className="mb-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {image ? (
        <p className="mb-2 flex items-center gap-2 text-xs text-fg-muted">
          <ImagePlus className="size-4" aria-hidden="true" />
          <span className="truncate">{image.name}</span>
          <button
            type="button"
            onClick={() => {
              setImage(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            aria-label={t("removePhoto")}
            className="grid size-6 place-items-center rounded-full hover:bg-surface-2"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("addPhoto")}
          title={t("addPhoto")}
          className="grid size-10 shrink-0 place-items-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
        >
          <ImagePlus className="size-5" aria-hidden="true" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => setImage(e.target.files?.[0] ?? null)}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-2xl bg-surface-2 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || (!text.trim() && !image)}
          aria-label={t("send")}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
        >
          {pending ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : (
            <SendHorizontal className="size-5 rtl:-scale-x-100" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}

/** A check's values for display: a business date (YYYY-MM-DD) in the reader's calendar. */
export function checkValues(values: Record<string, string | number> | undefined, locale: string) {
  const out: Record<string, string | number> = { ...(values ?? {}) };
  if (typeof out.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(out.date))
    out.date = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${out.date}T12:00:00Z`));
  return out;
}
