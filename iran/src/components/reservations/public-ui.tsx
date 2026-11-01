"use client";

import { Minus, Plus, Ticket } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { cancelBookingAction, joinQueueAction } from "@/app/[locale]/r/actions";

const field =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[16px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

function Party({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const t = useTranslations("booking");
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
      <span className="font-semibold">{t("people")}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="grid size-10 place-items-center rounded-full bg-surface-2"
          aria-label="-"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center text-xl font-bold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid size-10 place-items-center rounded-full bg-surface-2"
          aria-label="+"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function QueueForm({ slug }: { slug: string }) {
  const t = useTranslations("booking");
  const tErr = useTranslations("errorCodes");
  const router = useRouter();
  const [party, setParty] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <Party value={party} onChange={setParty} max={50} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("name")}
        className={field}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="09xx xxx xxxx"
        inputMode="tel"
        dir="ltr"
        className={cn(field, "text-start")}
      />
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !name.trim() || !phone.trim()}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await joinQueueAction(slug, { name, phone, partySize: party });
            if (res?.ok && res.data) router.push(`/r/${slug}/b/${res.data.code}`);
            else setError(res && !res.ok && tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-bold text-accent-fg shadow-accent disabled:opacity-40"
      >
        <Ticket className="size-5" />
        {t("takeTicket")}
      </button>
    </div>
  );
}

export function CancelBooking({ slug, code }: { slug: string; code: string }) {
  const t = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        window.confirm(t("cancelConfirm")) &&
        start(async () => {
          await cancelBookingAction(slug, code);
          router.refresh();
        })
      }
      className="h-12 w-full rounded-2xl font-semibold text-danger ring-1 ring-danger/30"
    >
      {t("cancel")}
    </button>
  );
}

/** Queue status page refreshes itself while waiting. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
