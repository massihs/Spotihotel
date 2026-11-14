"use client";

import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Check,
  Flower2,
  Info,
  KeyRound,
  Lock,
  Minus,
  Plus,
  Receipt,
  UtensilsCrossed,
  Wifi,
  Wine,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { minibarImage, spaImage } from "@/lib/guest-images";
import {
  bookSpaAction,
  cancelSpaAction,
  declareMinibarAction,
  slotsAction,
  verifyStayAction,
} from "@/app/[locale]/table/stay/actions";
import { useLineLabel } from "@/components/pms/folio-panel";
import { FormError, inputCls, useDay } from "@/components/pms/kit";
import { DateInput } from "@/components/ui/date-input";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { CopyRow } from "./room-concierge";
import { WaiterCall, type CallOption } from "./waiter-call";

type Service = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
};
type Line = {
  id: string;
  businessDate: string;
  description: string;
  department: string;
  method: string | null;
  amountCents: number;
  quantity: number;
};

export function StayPortal({
  hotelName,
  slug,
  room,
  currency,
  timeZone,
  today,
  stay,
  verified,
  calls,
  settings,
  services,
  minibar,
  folios,
  bookings,
}: {
  hotelName: string;
  slug: string;
  room: string;
  currency: string;
  timeZone: string;
  today: string;
  stay: { firstName: string; departure: string } | null;
  verified: boolean;
  calls: CallOption[];
  settings: {
    wifiName: string | null;
    wifiPassword: string | null;
    guestInfo: string | null;
    checkOutTime: string;
    minibarSelfService: boolean;
  };
  services: Service[];
  minibar: { id: string; name: string; priceCents: number }[];
  folios: { id: string; number: number; balanceCents: number; lines: Line[] }[];
  bookings: { id: string; service: string; startsAt: string; people: number; status: string }[];
}) {
  const t = useTranslations("portal");
  const tc = useTranslations("concierge");
  const day = useDay();
  // Charging the room (spa, minibar) and the bill: the guest's name first, asked where it is needed.
  const access: Access = !stay ? "none" : verified ? "open" : "locked";
  // Arriving from a tile of the menu page (#minibar, #spa, #bill): bring that part into view
  // (the browser cannot, the page being drawn after the navigation) and mark it a moment.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-accent");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1800);
    };
    const t = window.setTimeout(go, 60);
    window.addEventListener("hashchange", go);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", go);
    };
  }, []);
  return (
    <div className="mx-auto max-w-xl px-4 pt-4 pb-28">
      <Link
        href="/table"
        className="mb-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold shadow-[var(--shadow-soft)] ring-1 ring-border"
      >
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
        {t("backToMenu")}
      </Link>

      <header className="sidebar-shade relative isolate overflow-hidden rounded-[28px] bg-[var(--sidebar)] px-6 pt-6 pb-5 text-[var(--sidebar-fg)] shadow-[var(--shadow-float)]">
        <span
          aria-hidden="true"
          className="texture-khatam texture-fade-corner [--tex-color:var(--brass)] [--tex-opacity:0.16] [--tex-size:56px]"
        />
        <span aria-hidden="true" className="texture-grain [--grain-opacity:0.12]" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -end-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--brass)_45%,transparent),transparent_70%)]"
        />
        <p className="relative text-xs font-semibold text-[var(--brass)] ltr:tracking-[0.18em]">
          {hotelName}
        </p>
        <h1 className="font-display relative mt-2 text-[2.1rem] leading-tight">
          {stay && verified && stay.firstName ? t("hello", { name: stay.firstName }) : t("welcome")}
        </h1>
        <div className="relative mt-4 flex flex-wrap gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-semibold ring-1 ring-white/15">
            <KeyRound className="size-4 text-[var(--brass)]" aria-hidden="true" />
            {t("room", { room })}
          </span>
          {stay ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15">
              <CalendarCheck className="size-4 text-[var(--brass)]" aria-hidden="true" />
              {t("departure", {
                day: day(stay.departure, { weekday: "long", day: "numeric", month: "long" }),
                time: settings.checkOutTime,
              })}
            </span>
          ) : null}
        </div>
      </header>

      <nav className="mt-4 grid grid-cols-3 gap-2.5" aria-label={t("quick")}>
        <Link href="/table#room-service" className={QUICK}>
          <span className={cn(QUICK_ICON, "shade-royal")}>
            <UtensilsCrossed />
          </span>
          {t("roomService")}
        </Link>
        {calls.length ? (
          <WaiterCall options={calls} room className={cn(QUICK, "w-full")}>
            <span className={cn(QUICK_ICON, "shade-azure")}>
              <BellRing />
            </span>
            {t("reception")}
          </WaiterCall>
        ) : null}
        <Link href={`/r/${slug}/book`} className={QUICK}>
          <span className={cn(QUICK_ICON, "shade-periwinkle")}>
            <CalendarCheck />
          </span>
          {t("restaurant")}
        </Link>
      </nav>

      <div className="mt-4 space-y-4">
        {settings.wifiName ? (
          <Section id="wifi" icon={<Wifi />} title={t("wifi")}>
            <CopyRow
              label={tc("network")}
              value={settings.wifiName}
              copyLabel={tc("copy")}
              copiedLabel={tc("copied")}
            />
            {settings.wifiPassword ? (
              <CopyRow
                label={tc("password")}
                value={settings.wifiPassword}
                copyLabel={tc("copy")}
                copiedLabel={tc("copied")}
              />
            ) : null}
          </Section>
        ) : null}

        {!stay ? (
          <p className="rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-fg-muted">{t("noStay")}</p>
        ) : null}

        {services.length ? (
          <Spa
            services={services}
            currency={currency}
            today={today}
            timeZone={timeZone}
            bookings={bookings}
            access={access}
          />
        ) : (
          <Section id="spa" icon={<Flower2 />} title={t("spa")}>
            <p className="text-sm leading-6 text-fg-muted">{t("spaEmpty")}</p>
          </Section>
        )}
        <Minibar
          items={minibar}
          currency={currency}
          access={access}
          selfService={settings.minibarSelfService}
        />
        {stay ? (
          <Bill folios={folios} currency={currency} access={access} />
        ) : (
          <Section id="bill" icon={<Receipt />} title={t("bill")}>
            <p className="text-sm leading-6 text-fg-muted">{t("billNoStay")}</p>
          </Section>
        )}

        {settings.guestInfo ? (
          <Section icon={<Info />} title={t("info")}>
            <p className="text-sm leading-7 whitespace-pre-line text-fg-muted">{settings.guestInfo}</p>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

/** "open": verified; "locked": the guest's name is asked where needed; "none": no stay in the room. */
type Access = "open" | "locked" | "none";

const QUICK =
  "flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface p-3 text-center text-sm font-semibold shadow-[var(--shadow-soft)] transition active:scale-[0.98]";
const QUICK_ICON = "shade-fill grid size-10 place-items-center rounded-full [&_svg]:size-[18px]";

/** Each part of the stay page in its own blue. */
const SECTION_SHADE: Record<string, string> = {
  wifi: "shade-azure",
  spa: "shade-periwinkle",
  minibar: "shade-cyan",
  bill: "shade-royal",
};

function Section({
  icon,
  title,
  aside,
  children,
  id,
}: {
  icon: React.ReactNode;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-4 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5"
    >
      <h2 className="mb-3 flex items-center gap-2.5 text-[17px] font-bold">
        <span
          className={cn(
            "shade-fill grid size-9 place-items-center rounded-full [&_svg]:size-[17px]",
            SECTION_SHADE[id ?? ""] ?? "shade-sky",
          )}
        >
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        {aside}
      </h2>
      {children}
    </section>
  );
}

/** Asked only when the guest charges the room or opens the bill; remembered for the stay. */
function Unlock({ reason }: { reason: string }) {
  const t = useTranslations("portal");
  const [name, setName] = useState("");
  const r = useRun();
  return (
    <div className="rounded-2xl bg-[color-mix(in_oklch,var(--brass)_12%,var(--surface))] p-3.5 ring-1 ring-[color-mix(in_oklch,var(--brass)_35%,transparent)]">
      <p className="mb-2.5 flex items-start gap-2 text-sm leading-6">
        <Lock className="mt-0.5 size-4 shrink-0 text-[var(--brass)]" aria-hidden="true" />
        {reason}
      </p>
      <form className="flex gap-2" action={() => r.run(() => verifyStayAction(name))}>
        <input
          className={cn(inputCls, "bg-surface")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("lastName")}
          autoComplete="family-name"
          required
        />
        <Button type="submit" disabled={r.pending || name.trim().length < 2}>
          {t("verify")}
        </Button>
      </form>
      <div className="mt-2">
        <FormError error={r.error} />
      </div>
    </div>
  );
}

function Spa({
  services,
  currency,
  today,
  timeZone,
  bookings,
  access,
}: {
  services: Service[];
  currency: string;
  today: string;
  timeZone: string;
  bookings: { id: string; service: string; startsAt: string; people: number; status: string }[];
  access: Access;
}) {
  const t = useTranslations("portal");
  const tKind = useTranslations("pms.serviceKind");
  const money = useMoney(currency);
  const locale = useLocale();
  const when = (iso: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      weekday: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  const [serviceId, setServiceId] = useState(services[0]!.id);
  const [day, setDay] = useState(today);
  const [people, setPeople] = useState(1);
  const [slots, setSlots] = useState<{ time: string; left: number; past: boolean }[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const r = useRun();
  useEffect(() => {
    let live = true;
    slotsAction(serviceId, day).then((res) => live && setSlots(res?.ok && res.data ? res.data : []));
    return () => {
      live = false;
    };
  }, [serviceId, day, done]);
  const svc = services.find((s) => s.id === serviceId)!;
  const upcoming = bookings.filter((b) => b.status === "booked");
  return (
    <Section id="spa" icon={<Flower2 />} title={t("spa")}>
      <div className="-mx-1 mb-3 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setServiceId(s.id);
              setPicked(null);
            }}
            aria-pressed={s.id === serviceId}
            className={cn(
              "flex w-44 shrink-0 snap-start flex-col items-start gap-1 overflow-hidden rounded-2xl p-3 text-start ring-1 transition",
              s.id === serviceId
                ? "bg-[var(--sidebar)] text-[var(--sidebar-fg)] ring-[var(--sidebar)]"
                : "bg-surface-2 ring-border",
            )}
          >
            {spaImage(s.kind) ? (
              <Photo src={spaImage(s.kind)!} className="-mx-3 -mt-3 mb-1.5 h-24 w-[calc(100%+1.5rem)]" />
            ) : null}
            <span className="line-clamp-2 text-sm leading-snug font-bold">{s.name}</span>
            <span className={cn("text-xs", s.id === serviceId ? "text-[var(--brass)]" : "text-fg-muted")}>
              {t("minutes", { n: s.durationMin })} | {s.priceCents ? money(s.priceCents) : t("included")}
            </span>
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm leading-6 text-fg-muted">
        {tKind(svc.kind)}
        {svc.priceCents ? ` | ${t("perPerson", { price: money(svc.priceCents) })}` : ""}
        {svc.description ? <span className="mt-1 block">{svc.description}</span> : null}
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <DateInput
          className={inputCls}
          min={today}
          value={day}
          onChange={(v) => {
            setDay(v);
            setPicked(null);
          }}
          aria-label={t("day")}
        />
        <select
          className={inputCls}
          value={people}
          onChange={(e) => setPeople(Number(e.target.value))}
          aria-label={t("people")}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {t("peopleN", { n })}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {slots.map((s) => {
          const off = s.past || s.left < people;
          return (
            <button
              key={s.time}
              type="button"
              disabled={off}
              onClick={() => setPicked(s.time)}
              className={cn(
                "h-10 rounded-xl text-sm font-semibold tabular-nums ring-1 transition",
                picked === s.time ? "bg-accent text-accent-fg ring-accent" : "bg-surface ring-border",
                off && "opacity-30",
              )}
              dir="ltr"
            >
              {s.time}
            </button>
          );
        })}
      </div>
      {!slots.length ? <p className="mb-3 text-sm text-fg-muted">{t("noSlots")}</p> : null}
      {access === "locked" && picked ? (
        <Unlock reason={t("unlockSpa")} />
      ) : access === "none" ? null : (
        <>
          <FormError error={r.error} />
          <Button
            className="h-12 w-full rounded-2xl text-[15px]"
            disabled={!picked || r.pending}
            onClick={() =>
              picked &&
              r.run(
                () => bookSpaAction(serviceId, day, picked, people),
                () => {
                  setPicked(null);
                  setDone(!done);
                },
              )
            }
          >
            {picked ? t("bookAt", { time: picked, price: money(svc.priceCents * people) }) : t("pickSlot")}
          </Button>
        </>
      )}
      {upcoming.length ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          {upcoming.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2">
              <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              <span className="flex-1">
                <b>{b.service}</b> | {when(b.startsAt)} | {t("peopleN", { n: b.people })}
              </span>
              <CancelSpa id={b.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

function CancelSpa({ id }: { id: string }) {
  const t = useTranslations("portal");
  const r = useRun();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={r.pending}
      onClick={() => window.confirm(t("cancelConfirm")) && r.run(() => cancelSpaAction(id))}
    >
      {t("cancel")}
    </Button>
  );
}

/** A decorative photo that disappears, with its room, if the file cannot be loaded. */
function Photo({ src, className }: { src: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </span>
  );
}

const MINIBAR_SHADES = ["shade-cyan", "shade-azure", "shade-periwinkle", "shade-royal"];

function Minibar({
  items,
  currency,
  access: rawAccess,
  selfService,
}: {
  items: { id: string; name: string; priceCents: number }[];
  currency: string;
  access: Access;
  /** Guests may declare what they took; otherwise the list is for information. */
  selfService: boolean;
}) {
  const access: Access = selfService ? rawAccess : "none";
  const t = useTranslations("portal");
  const money = useMoney(currency);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sent, setSent] = useState(false);
  const r = useRun();
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const total = lines.reduce(
    (s, l) => s + l.quantity * (items.find((i) => i.id === l.itemId)?.priceCents ?? 0),
    0,
  );
  const step = (id: string, d: number) => {
    setSent(false);
    setQty({ ...qty, [id]: Math.min(50, Math.max(0, (qty[id] ?? 0) + d)) });
  };
  return (
    <Section id="minibar" icon={<Wine />} title={t("minibar")}>
      <p className="mb-3 text-sm leading-6 text-fg-muted">
        {!items.length ? t("minibarEmpty") : selfService ? t("minibarHint") : t("minibarCounted")}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((i, k) => {
          const n = qty[i.id] ?? 0;
          return (
            <li
              key={i.id}
              className={cn(
                "flex flex-col justify-between gap-2 overflow-hidden rounded-2xl p-3 ring-1 transition",
                MINIBAR_SHADES[k % MINIBAR_SHADES.length],
                n ? "shade-soft ring-transparent" : "bg-surface-2 ring-border",
              )}
            >
              <Photo src={minibarImage(i.name)} className="-mx-3 -mt-3 mb-0.5 aspect-[4/3]" />
              <span className="line-clamp-2 text-sm leading-snug font-semibold">{i.name}</span>
              <span className="flex items-center justify-between gap-1">
                <span className="text-xs text-fg-muted tabular-nums">{money(i.priceCents)}</span>
                {access === "none" ? null : (
                  <span className="flex items-center gap-1">
                    {n ? (
                      <>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-full bg-surface ring-1 ring-border"
                          onClick={() => step(i.id, -1)}
                          aria-label={t("less", { name: i.name })}
                        >
                          <Minus className="size-3.5" aria-hidden="true" />
                        </button>
                        <span className="w-5 text-center text-sm font-bold tabular-nums">{n}</span>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="shade-fill grid size-8 place-items-center rounded-full"
                      onClick={() => step(i.id, 1)}
                      aria-label={t("more", { name: i.name })}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {sent ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          <Check className="size-4" aria-hidden="true" />
          {t("minibarThanks")}
        </p>
      ) : null}
      {lines.length ? (
        access === "locked" ? (
          <div className="mt-3">
            <Unlock reason={t("unlockMinibar")} />
          </div>
        ) : (
          <>
            <FormError error={r.error} />
            <Button
              className="mt-3 h-12 w-full rounded-2xl text-[15px]"
              disabled={r.pending}
              onClick={() =>
                r.run(
                  () => declareMinibarAction(lines),
                  () => {
                    setQty({});
                    setSent(true);
                  },
                )
              }
            >
              {t("minibarSend", { total: money(total) })}
            </Button>
          </>
        )
      ) : null}
    </Section>
  );
}

function Bill({
  folios,
  currency,
  access,
}: {
  folios: { id: string; number: number; balanceCents: number; lines: Line[] }[];
  currency: string;
  access: Access;
}) {
  const t = useTranslations("portal");
  const money = useMoney(currency);
  const day = useDay();
  const label = useLineLabel();
  const balance = folios.reduce((s, f) => s + f.balanceCents, 0);
  const lines = folios.flatMap((f) => f.lines);
  if (access !== "open")
    return (
      <Section id="bill" icon={<Receipt />} title={t("bill")}>
        <Unlock reason={t("unlockBill")} />
      </Section>
    );
  return (
    <Section id="bill" icon={<Receipt />} title={t("bill")}>
      <div className="mb-3 flex items-end justify-between rounded-2xl bg-[var(--sidebar)] px-4 py-3.5 text-[var(--sidebar-fg)]">
        <span className="text-sm opacity-80">{balance < 0 ? t("credit") : t("balance")}</span>
        <span className={cn("text-xl font-bold tabular-nums", balance < 0 && "text-[var(--brass)]")}>
          {money(Math.abs(balance))}
        </span>
      </div>
      {lines.length ? (
        <ul className="divide-y divide-border text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2.5">
              <span className="w-14 shrink-0 text-xs text-fg-muted">{day(l.businessDate)}</span>
              <span className="flex-1">
                {label(l)}
                {l.quantity > 1 ? ` × ${l.quantity}` : ""}
              </span>
              <span className={cn("font-semibold tabular-nums", l.amountCents < 0 && "text-success")}>
                {money(l.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("billEmpty")}</p>
      )}
      <p className="mt-3 text-xs leading-5 text-fg-muted">{t("billHint")}</p>
    </Section>
  );
}
