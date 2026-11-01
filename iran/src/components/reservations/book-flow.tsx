"use client";

import {
  Briefcase,
  CalendarCheck,
  CalendarDays,
  Clock,
  Gift,
  Heart,
  Loader2,
  MapPin,
  Moon,
  PartyPopper,
  Sun,
  Users,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePref, writePref } from "@/components/ui/use-pref";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { bookAction, slotsAction } from "@/app/[locale]/r/actions";
import { PlaceInitials } from "@/components/ui/place-initials";

const field =
  "h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[16px] focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

const OCCASIONS = [
  { key: "birthday", Icon: PartyPopper },
  { key: "anniversary", Icon: Heart },
  { key: "date", Icon: Gift },
  { key: "business", Icon: Briefcase },
  { key: "family", Icon: Users },
] as const;
type Occasion = (typeof OCCASIONS)[number]["key"];

/** Name and mobile are kept on the device so a second booking is one tap. */
const GUEST_KEY = "sf-guest";

function parseGuest(raw: string): { name: string; phone: string } {
  try {
    const v = JSON.parse(raw) as { name?: unknown; phone?: unknown };
    return {
      name: typeof v.name === "string" ? v.name : "",
      phone: typeof v.phone === "string" ? v.phone : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

type Slot = { time: string; at: string };

export type BookDay = { key: string; weekday: string; label: string; month: string; long: string };

/**
 * The guest's booking in two short steps on one page, OpenTable style: party, day and a time
 * chip, then name and mobile. A summary (side card on laptops, bottom bar on phones) confirms.
 */
export function BookFlow({
  slug,
  place,
  days,
  maxParty,
  areas,
  initial,
}: {
  slug: string;
  place: { name: string; logo: string | null; address: string | null; autoConfirm: boolean };
  days: BookDay[];
  maxParty: number;
  areas: { indoor: boolean; outdoor: boolean };
  initial: { party: number; day: string; time: string | null };
}) {
  const t = useTranslations("booking");
  const tErr = useTranslations("errorCodes");
  const router = useRouter();
  const [day, setDay] = useState(initial.day);
  const [party, setParty] = useState(initial.party);
  const [reload, setReload] = useState(0);
  const key = `${day}|${party}|${reload}`;
  const [loaded, setLoaded] = useState<{ key: string; list: Slot[] } | null>(null);
  const slots = loaded?.key === key ? loaded.list : null;
  const [picked, setPicked] = useState<Slot | null>(null);
  // A time chosen for another day or party is not kept.
  const slot = picked && slots?.some((s) => s.at === picked.at) ? picked : null;
  const [area, setArea] = useState<"any" | "indoor" | "outdoor">("any");
  const saved = parseGuest(usePref(GUEST_KEY, ""));
  const [nameInput, setName] = useState<string | null>(null);
  const [phoneInput, setPhone] = useState<string | null>(null);
  const name = nameInput ?? saved.name;
  const phone = phoneInput ?? saved.phone;
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wanted = useRef(initial.time);
  const timesRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const [d, p] = key.split("|");
    void slotsAction(slug, d!, Number(p)).then((res) => {
      if (!alive) return;
      const list = res?.ok && res.data ? res.data : [];
      setLoaded({ key, list });
      // The time picked in the directory is selected once, then the guest goes on to details.
      const hit = wanted.current ? list.find((s) => s.time === wanted.current) : undefined;
      wanted.current = null;
      if (hit) {
        setPicked(hit);
        detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    return () => {
      alive = false;
    };
  }, [slug, key]);

  const pick = (s: Slot) => {
    setPicked(s);
    setError(null);
    if (!name.trim() || !phone.trim())
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = () => {
    setError(null);
    if (!slot) {
      setError(t("pickTime"));
      timesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!name.trim()) return nameRef.current?.focus();
    if (!phone.trim()) return phoneRef.current?.focus();
    start(async () => {
      const res = await bookAction(slug, {
        name,
        phone,
        partySize: party,
        startsAt: slot.at,
        note,
        area,
        occasion,
      });
      if (res?.ok && res.data) {
        writePref(GUEST_KEY, JSON.stringify({ name: name.trim(), phone: phone.trim() }));
        router.push(`/r/${slug}/b/${res.data.code}`);
        return;
      }
      const code = res && !res.ok ? res.error : "internal";
      setError(tErr.has(code) ? tErr(code) : tErr("internal"));
      // Someone took the slot meanwhile: show what is left.
      if (code === "slot_unavailable" || code === "slot_full") setReload((n) => n + 1);
    });
  };

  const current = days.find((d) => d.key === day) ?? days[0]!;
  const lunch = (slots ?? []).filter((s) => {
    const h = Number(s.time.slice(0, 2));
    return h >= 5 && h < 17;
  });
  const dinner = (slots ?? []).filter((s) => !lunch.includes(s));
  const quick = Array.from({ length: Math.min(8, maxParty) }, (_, i) => i + 1);

  const summaryRows = (
    <dl className="space-y-2.5 text-sm">
      <SummaryRow icon={<CalendarDays className="size-4" />} label={current.long} />
      <SummaryRow
        icon={<Clock className="size-4" />}
        label={slot ? <span dir="ltr">{slot.time}</span> : t("pickTime")}
        muted={!slot}
      />
      <SummaryRow icon={<Users className="size-4" />} label={t("guests", { count: party })} />
      {occasion ? (
        <SummaryRow icon={<PartyPopper className="size-4" />} label={t(`occasion.${occasion}`)} />
      ) : null}
    </dl>
  );

  const confirmButton = (cls?: string) => (
    <button
      type="button"
      disabled={pending}
      onClick={submit}
      className={cn(
        "flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent px-5 text-lg font-bold text-accent-fg shadow-accent transition-opacity disabled:opacity-60",
        cls,
      )}
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : <CalendarCheck className="size-5" />}
      {t("confirmCta")}
    </button>
  );

  return (
    <>
      <div className="relative mx-auto -mt-6 grid max-w-5xl gap-5 px-4 pb-36 lg:grid-cols-[minmax(0,1fr)_21rem] lg:pb-16">
        <div className="min-w-0 space-y-5">
          <section className="space-y-5 rounded-3xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-border sm:p-6">
            <StepTitle n={1}>{t("steps.table")}</StepTitle>

            <div>
              <p className="mb-2 text-sm font-semibold text-fg-muted">{t("people")}</p>
              <div className="flex flex-wrap gap-2">
                {quick.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setParty(n)}
                    aria-pressed={party === n}
                    className={cn(
                      "grid size-11 place-items-center rounded-full text-base font-bold tabular-nums transition-colors",
                      party === n ? "bg-fg text-bg" : "bg-surface-2 text-fg hover:bg-surface-3",
                    )}
                  >
                    {n}
                  </button>
                ))}
                {maxParty > 8 ? (
                  <label
                    className={cn(
                      "relative flex h-11 items-center rounded-full px-4 text-sm font-bold",
                      party > 8 ? "bg-fg text-bg" : "bg-surface-2 hover:bg-surface-3",
                    )}
                  >
                    {party > 8 ? party : `${t("morePeople")} +`}
                    <select
                      aria-label={t("morePeople")}
                      value={party > 8 ? party : ""}
                      onChange={(e) => e.target.value && setParty(Number(e.target.value))}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    >
                      <option value="" disabled>
                        {t("morePeople")}
                      </option>
                      {Array.from({ length: maxParty - 8 }, (_, i) => i + 9).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-fg-muted">{t("day")}</p>
              <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
                {days.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setDay(d.key)}
                    aria-pressed={day === d.key}
                    className={cn(
                      "flex w-[4.25rem] shrink-0 flex-col items-center rounded-2xl py-2 transition-colors",
                      day === d.key
                        ? "bg-accent text-accent-fg shadow-accent"
                        : "bg-surface-2 text-fg hover:bg-surface-3",
                    )}
                  >
                    <span className="text-xs font-medium opacity-80">{d.weekday}</span>
                    <span className="text-xl leading-7 font-black tabular-nums">{d.label}</span>
                    <span className="text-[11px] opacity-70">{d.month}</span>
                  </button>
                ))}
              </div>
            </div>

            <div ref={timesRef} className="scroll-mt-24">
              <p className="mb-2 text-sm font-semibold text-fg-muted">{t("time")}</p>
              {slots === null ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="h-11 animate-pulse rounded-xl bg-surface-2" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-fg-muted">
                  {t("noSlots")}
                </p>
              ) : (
                <div className="space-y-3">
                  {[
                    { key: "lunch", Icon: Sun, list: lunch },
                    { key: "dinner", Icon: Moon, list: dinner },
                  ]
                    .filter((g) => g.list.length)
                    .map(({ key, Icon, list }) => (
                      <div key={key}>
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-fg-subtle">
                          <Icon className="size-3.5" aria-hidden="true" />
                          {t(key as "lunch" | "dinner")}
                        </p>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                          {list.map((s) => (
                            <button
                              key={s.at}
                              type="button"
                              onClick={() => pick(s)}
                              aria-pressed={slot?.at === s.at}
                              className={cn(
                                "h-11 rounded-xl text-sm font-bold tabular-nums transition-colors",
                                slot?.at === s.at
                                  ? "bg-accent text-accent-fg shadow-accent"
                                  : "bg-accent-soft text-accent-text hover:bg-accent hover:text-accent-fg",
                              )}
                              dir="ltr"
                            >
                              {s.time}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {areas.indoor && areas.outdoor ? (
              <div>
                <p className="mb-2 text-sm font-semibold text-fg-muted">{t("area")}</p>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
                  {(["any", "indoor", "outdoor"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setArea(a)}
                      aria-pressed={area === a}
                      className={cn(
                        "h-10 rounded-lg text-sm font-semibold",
                        area === a ? "bg-surface shadow-sm" : "text-fg-muted",
                      )}
                    >
                      {t(`areas.${a}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section
            ref={detailsRef}
            className="scroll-mt-4 space-y-4 rounded-3xl bg-surface p-4 shadow-[var(--shadow-float)] ring-1 ring-border sm:p-6"
          >
            <StepTitle n={2}>{t("steps.details")}</StepTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name")}
                aria-label={t("name")}
                autoComplete="name"
                maxLength={120}
                className={field}
              />
              <div>
                <input
                  ref={phoneRef}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xx xxx xxxx"
                  aria-label={t("phone")}
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  className={cn(field, "text-start")}
                />
                <p className="mt-1 px-1 text-xs text-fg-subtle">{t("phoneHint")}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-fg-muted">{t("occasionTitle")}</p>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map(({ key, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOccasion(occasion === key ? null : key)}
                    aria-pressed={occasion === key}
                    className={cn(
                      "inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
                      occasion === key
                        ? "bg-accent-soft text-accent-text ring-1 ring-accent/50"
                        : "bg-surface-2 text-fg-muted hover:text-fg",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {t(`occasion.${key}`)}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("note")}
              aria-label={t("noteLabel")}
              maxLength={500}
              rows={2}
              className={cn(field, "h-auto min-h-12 resize-none py-3")}
            />
            {error ? (
              <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
            <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
              {place.autoConfirm ? <Zap className="size-3.5 text-success" aria-hidden="true" /> : null}
              {place.autoConfirm ? t("instant") : t("onRequest")}
            </p>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-6 space-y-4 rounded-3xl bg-surface p-5 shadow-[var(--shadow-float)] ring-1 ring-border">
            <div className="flex items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2">
                {place.logo ? (
                  <img src={place.logo} alt="" className="size-full object-contain p-1" />
                ) : (
                  <PlaceInitials name={place.name} className="text-lg" />
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-bold">{place.name}</p>
                {place.address ? (
                  <p className="flex items-center gap-1 truncate text-xs text-fg-muted">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    {place.address}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-bold tracking-wide text-fg-subtle uppercase">{t("summary")}</p>
              {summaryRows}
            </div>
            {confirmButton("w-full")}
            <p className="text-center text-xs text-fg-subtle">
              {place.autoConfirm ? t("instant") : t("onRequest")}
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-bold">
              {current.weekday} {current.label} {current.month}
              {slot ? (
                <>
                  {" · "}
                  <span dir="ltr">{slot.time}</span>
                </>
              ) : null}
            </p>
            <p className="truncate text-xs text-fg-muted">
              {slot ? t("forPeople", { count: party, name: place.name }) : t("pickTime")}
            </p>
          </div>
          {confirmButton("h-12 shrink-0 text-base")}
        </div>
      </div>
    </>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-bold">
      <span className="grid size-7 place-items-center rounded-full bg-fg text-sm text-bg tabular-nums">
        {n}
      </span>
      {children}
    </h2>
  );
}

function SummaryRow({
  icon,
  label,
  muted,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <dt className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted">
        {icon}
      </dt>
      <dd className={cn("font-semibold", muted && "font-normal text-fg-subtle")}>{label}</dd>
    </div>
  );
}
