"use client";

import { Bot, HandCoins, Heart, Mic, Moon, Send, Sparkles, Sunrise, Wallet, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { leaveTipAction } from "@/app/[locale]/table/stay/actions";
import { FormError } from "@/components/pms/kit";
import type { PrayerTimes } from "@/lib/prayer-times";
import { intentOf, type Intent } from "@/lib/concierge";
import { Section } from "./stay-portal";
import { WaiterCall, type CallOption } from "./waiter-call";

export type TipsProps = {
  presets: number[];
  staff: { id: string; name: string; role: string; ownRoom: boolean }[];
};
export type WalletProps = { code: string; depositedForeign: number; remainingForeign: number };
export type ConciergeProps = {
  wifiName: string | null;
  wifiPassword: string | null;
  checkOutTime: string;
  services: string[];
  guestInfo: string | null;
  calls: CallOption[];
};

/** The stay page's own features: tips, prayer times and Ramadan, the traveller's wallet. */
export function StayExtras({
  currency,
  verified,
  tips,
  prayer,
  ramadan,
  wallet,
}: {
  currency: string;
  verified: boolean;
  tips: TipsProps | null;
  prayer: PrayerTimes | null;
  ramadan: boolean;
  wallet: WalletProps | null;
}) {
  return (
    <>
      {wallet ? <WalletCard wallet={wallet} /> : null}
      {prayer ? <Prayer times={prayer} ramadan={ramadan} /> : null}
      {tips && verified && tips.staff.length ? <Tips tips={tips} currency={currency} /> : null}
    </>
  );
}

function WalletCard({ wallet }: { wallet: WalletProps }) {
  const t = useTranslations("stayExtras");
  const locale = useLocale();
  const fmt = (v: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(v / 100) + " " + wallet.code;
  const spent = Math.max(0, wallet.depositedForeign - wallet.remainingForeign);
  const share = wallet.depositedForeign ? Math.min(100, (spent / wallet.depositedForeign) * 100) : 0;
  return (
    <Section id="wallet" icon={<Wallet />} title={t("wallet.title")}>
      <p className="text-sm leading-6 text-fg-muted">{t("wallet.hint", { code: wallet.code })}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["deposited", wallet.depositedForeign],
            ["spent", spent],
            ["left", wallet.remainingForeign],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className={cn("rounded-2xl p-3", k === "left" ? "shade-fill" : "bg-surface-2")}>
            <p className={cn("text-[11px]", k === "left" ? "text-white/80" : "text-fg-muted")}>
              {t(`wallet.${k}`)}
            </p>
            <p className="mt-0.5 text-sm font-bold tabular-nums" dir="ltr">
              {fmt(v)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
        <span className="shade-bar block h-full rounded-full" style={{ width: `${share}%` }} />
      </div>
      <p className="mt-2 text-xs text-fg-muted">{t("wallet.refund", { code: wallet.code })}</p>
    </Section>
  );
}

const PRAYERS = ["fajr", "sunrise", "dhuhr", "maghrib", "isha"] as const;

function Prayer({ times, ramadan }: { times: PrayerTimes; ramadan: boolean }) {
  const t = useTranslations("stayExtras");
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const next = now ? PRAYERS.find((p) => times[p] > now) : null;
  return (
    <Section id="prayer" icon={<Moon />} title={t("prayer.title")}>
      {ramadan ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="shade-fill rounded-2xl p-3">
            <p className="flex items-center gap-1.5 text-xs text-white/80">
              <Sunrise className="size-3.5" aria-hidden="true" />
              {t("prayer.sahari")}
            </p>
            <p className="mt-1 text-xl font-black tabular-nums" dir="ltr">
              {times.fajr}
            </p>
          </div>
          <div className="shade-fill rounded-2xl p-3 [--shade:var(--shade-indigo)]">
            <p className="flex items-center gap-1.5 text-xs text-white/80">
              <Moon className="size-3.5" aria-hidden="true" />
              {t("prayer.iftar")}
            </p>
            <p className="mt-1 text-xl font-black tabular-nums" dir="ltr">
              {times.maghrib}
            </p>
          </div>
          <Link
            href="/table#room-service"
            className="col-span-2 rounded-xl bg-surface-2 px-3 py-2.5 text-center text-sm font-semibold text-accent-text"
          >
            {t("prayer.orderSahari")}
          </Link>
        </div>
      ) : null}
      <ul className="grid grid-cols-5 gap-1.5 text-center">
        {PRAYERS.map((p) => (
          <li key={p} className={cn("rounded-xl px-1 py-2.5", next === p ? "shade-fill" : "bg-surface-2")}>
            <span className={cn("block text-[11px]", next === p ? "text-white/80" : "text-fg-muted")}>
              {t(`prayer.${p}`)}
            </span>
            <span className="mt-0.5 block text-sm font-bold tabular-nums" dir="ltr">
              {times[p]}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Tips({ tips, currency }: { tips: TipsProps; currency: string }) {
  const t = useTranslations("stayExtras");
  const money = useMoney(currency);
  const r = useRun();
  const [staff, setStaff] = useState(tips.staff[0]?.id ?? "");
  const [amount, setAmount] = useState(tips.presets[1] ?? tips.presets[0] ?? 0);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const who = tips.staff.find((s) => s.id === staff);
  if (done)
    return (
      <Section id="tips" icon={<HandCoins />} title={t("tips.title")}>
        <p className="flex items-center gap-2 rounded-2xl bg-success-soft px-4 py-4 text-sm font-semibold text-success">
          <Heart className="size-5 fill-current" aria-hidden="true" />
          {t("tips.thanks", { name: done })}
        </p>
      </Section>
    );
  return (
    <Section id="tips" icon={<HandCoins />} title={t("tips.title")}>
      <p className="text-sm leading-6 text-fg-muted">{t("tips.hint")}</p>
      <div className="-mx-1 mt-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-1 pb-1">
        {tips.staff.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStaff(s.id)}
            aria-pressed={staff === s.id}
            className={cn(
              "flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center ring-1 transition",
              staff === s.id ? "shade-soft ring-[var(--shade)]" : "bg-surface ring-border",
            )}
          >
            <Avatar name={s.name} />
            <span className="line-clamp-2 text-xs leading-4 font-semibold">{s.name}</span>
            {s.ownRoom ? (
              <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-semibold text-success">
                {t("tips.yourRoom")}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tips.presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            aria-pressed={amount === p}
            className={cn(
              "rounded-xl px-2 py-3 text-sm font-bold tabular-nums ring-1",
              amount === p ? "shade-fill ring-transparent" : "bg-surface ring-border",
            )}
          >
            {money(p)}
          </button>
        ))}
      </div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={200}
        placeholder={t("tips.message")}
        className="mt-3 h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm"
      />
      <Button
        className="mt-3 w-full"
        disabled={r.pending || !staff || !amount}
        onClick={() =>
          r.run(async () => {
            const res = await leaveTipAction(staff, amount, message);
            if (res?.ok) setDone(who?.name ?? "");
            return res;
          })
        }
      >
        <HandCoins className="size-4" aria-hidden="true" />
        {t("tips.send", { amount: money(amount) })}
      </Button>
      <p className="mt-2 text-center text-xs text-fg-subtle">{t("tips.onBill")}</p>
      <FormError error={r.error} />
    </Section>
  );
}

// ─── Concierge ───────────────────────────────────────────────────────────────

type Msg = { from: "guest" | "bot"; text: string; intent?: Intent };

/** A concierge in the guest's language: answers from the hotel's own data and acts (no outside AI). */
export function Concierge(props: ConciergeProps) {
  const t = useTranslations("stayExtras.concierge");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const has =
      typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    const id = setTimeout(() => setCanSpeak(has), 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const answer = (intent: Intent): string => {
    switch (intent) {
      case "wifi":
        return props.wifiName
          ? t("a.wifi", { name: props.wifiName, password: props.wifiPassword ?? "—" })
          : t("a.wifiNone");
      case "checkout":
        return t("a.checkout", { time: props.checkOutTime });
      case "spa":
        return props.services.length
          ? t("a.spa", { list: props.services.slice(0, 5).join("، ") })
          : t("a.spaNone");
      default:
        return t(`a.${intent}`);
    }
  };
  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    const intent = intentOf(query);
    setMsgs((m) => [...m, { from: "guest", text: query }, { from: "bot", text: answer(intent), intent }]);
    setText("");
  };
  const listen = () => {
    const W = window as unknown as Record<string, new () => SpeechLike>;
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = locale === "fa" ? "fa-IR" : locale === "ar" ? "ar-IQ" : locale === "fr" ? "fr-FR" : "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => ask(e.results[0]?.[0]?.transcript ?? "");
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const ACTION: Partial<Record<Intent, { href: string; label: string }>> = {
    wifi: { href: "#wifi", label: t("go.wifi") },
    food: { href: "/table#room-service", label: t("go.food") },
    spa: { href: "#spa", label: t("go.spa") },
    minibar: { href: "#minibar", label: t("go.minibar") },
    bill: { href: "#bill", label: t("go.bill") },
    tip: { href: "#tips", label: t("go.tip") },
    prayer: { href: "#prayer", label: t("go.prayer") },
  };
  const go = (href: string) => {
    setOpen(false);
    if (href.startsWith("#")) window.location.hash = href;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shade-fill fixed start-4 bottom-24 z-30 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-[var(--shadow-float)]"
      >
        <Bot className="size-5" aria-hidden="true" />
        {t("open")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
        >
          <button
            type="button"
            className="absolute inset-0 bg-[oklch(0.18_0.04_262/0.45)] backdrop-blur-[3px]"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-[var(--shadow-float)]">
            <header className="shade-wash flex items-center gap-3 border-b border-border px-5 py-4">
              <span className="shade-fill grid size-10 place-items-center rounded-full">
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("title")}</span>
                <span className="block text-xs text-fg-muted">{t("subtitle")}</span>
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
                aria-label={t("close")}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <Bubble from="bot">{t("hello")}</Bubble>
              {msgs.map((m, i) => (
                <div key={i}>
                  <Bubble from={m.from}>{m.text}</Bubble>
                  {m.from === "bot" && m.intent && ACTION[m.intent] ? (
                    <button
                      type="button"
                      onClick={() => go(ACTION[m.intent!]!.href)}
                      className="ms-2 mt-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-text"
                    >
                      {ACTION[m.intent!]!.href.startsWith("/") ? (
                        <Link href={ACTION[m.intent!]!.href}>{ACTION[m.intent!]!.label}</Link>
                      ) : (
                        ACTION[m.intent!]!.label
                      )}
                    </button>
                  ) : null}
                  {m.from === "bot" && m.intent === "clean" && props.calls.length ? (
                    <div className="ms-2 mt-1.5">
                      <WaiterCall options={props.calls} room>
                        <span className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-text">
                          {t("go.clean")}
                        </span>
                      </WaiterCall>
                    </div>
                  ) : null}
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="border-t border-border p-3">
              <div className="-mx-1 mb-2 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-1">
                {(["wifi", "food", "clean", "checkout", "spa"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => ask(t(`chips.${k}`))}
                    className="shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold"
                  >
                    {t(`chips.${k}`)}
                  </button>
                ))}
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(text);
                }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("placeholder")}
                  className="h-11 min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 text-sm"
                />
                {canSpeak ? (
                  <button
                    type="button"
                    onClick={listen}
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-border",
                      listening && "animate-pulse bg-danger text-white ring-transparent",
                    )}
                    aria-label={t("voice")}
                  >
                    <Mic className="size-5" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="shade-fill grid size-11 shrink-0 place-items-center rounded-full"
                  aria-label={t("send")}
                >
                  <Send className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

type SpeechLike = {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void;
  onend: () => void;
  start: () => void;
};

function Bubble({ from, children }: { from: "guest" | "bot"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 whitespace-pre-line",
        from === "bot" ? "bg-surface-2 text-fg" : "shade-fill ms-auto",
      )}
    >
      {children}
    </p>
  );
}
