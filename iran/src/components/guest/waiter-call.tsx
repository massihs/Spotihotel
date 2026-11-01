"use client";

import { BellRing, Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { callWaiterAction } from "@/app/[locale]/table/actions";
import { cn } from "@/lib/cn";
import { CALL_ICON, CALL_TONES } from "./call-icons";

export type CallOption = { key: string; label: string | null; icon: string };
const BUILTIN = [
  "waiter",
  "bill",
  "water",
  "housekeeping",
  "towels",
  "reception",
  "laundry",
  "wakeup",
  "minibar",
  "maintenance",
  "luggage",
  "taxi",
];

/**
 * "Call the waiter" bell on the identity card, with the options the restaurant chose. In a hotel
 * room a tap opens a short note first ("2 shirts", "wake me at 7"), then the request is sent.
 */
export function WaiterCall({
  options,
  room = false,
  className,
}: {
  options: CallOption[];
  room?: boolean;
  className?: string;
}) {
  const t = useTranslations("guest.waiter");
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [picked, setPicked] = useState<CallOption | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (key: string, text: string | null) =>
    start(async () => {
      setError(null);
      const res = await callWaiterAction(key, text);
      if (res?.ok) setSent(key);
      else setError(res?.error === "too_soon" ? t("tooSoon") : t("failed"));
    });
  const name = (o: CallOption) => o.label ?? t(`kinds.${o.key as "waiter"}`);
  return (
    <>
      <button
        type="button"
        onClick={() => (setOpen(true), setSent(null), setError(null), setPicked(null), setNote(""))}
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent ps-3.5 pe-4 text-sm font-semibold text-accent-fg shadow-accent",
          "atelier:bg-transparent atelier:text-fg atelier:shadow-none atelier:ring-1 atelier:ring-border-strong nuit:shadow-none",
          className,
        )}
        title={t("call")}
      >
        <BellRing className="size-[18px]" aria-hidden="true" />
        {t("short")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end"
          role="dialog"
          aria-modal="true"
          aria-label={t("call")}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="animate-sheet-up relative w-full rounded-t-3xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-lg font-bold">{t("title")}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full bg-surface-2"
                aria-label={t("close")}
              >
                <X className="size-4" />
              </button>
            </div>
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <span className="grid size-16 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-8" />
                </span>
                <p className="font-bold">{t("sent")}</p>
                <p className="text-sm text-fg-muted">
                  {BUILTIN.includes(sent) ? t(`sentHint.${sent as "waiter"}`) : t("sentHint.custom")}
                </p>
              </div>
            ) : picked ? (
              <div className="space-y-3">
                <p className="font-semibold">{name(picked)}</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("notePlaceholder")}
                  aria-label={t("note")}
                  maxLength={280}
                  rows={2}
                  autoFocus
                  className="w-full resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-[16px] focus-visible:border-accent focus-visible:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPicked(null)}
                    className="h-12 rounded-2xl px-4 font-semibold ring-1 ring-border"
                  >
                    {t("back")}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => send(picked.key, note.trim() || null)}
                    className="h-12 flex-1 rounded-2xl bg-accent font-bold text-accent-fg disabled:opacity-50"
                  >
                    {t("send")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {options.map(({ key, label, icon }, i) => {
                  const Icon = CALL_ICON[icon] ?? BellRing;
                  const tone = CALL_TONES[i % CALL_TONES.length];
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        room ? (setPicked({ key, label, icon }), setNote("")) : send(key, null)
                      }
                      className="flex flex-col items-center gap-2 rounded-2xl border border-border p-4 text-sm font-semibold active:scale-95 disabled:opacity-50"
                    >
                      <span className={cn("grid size-12 place-items-center rounded-2xl", tone)}>
                        <Icon className="size-6" />
                      </span>
                      {name({ key, label, icon })}
                    </button>
                  );
                })}
              </div>
            )}
            {error ? <p className="mt-3 text-center text-sm font-medium text-danger">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
