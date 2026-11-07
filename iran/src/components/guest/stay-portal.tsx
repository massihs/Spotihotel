"use client";

import {
  BellRing,
  CalendarCheck,
  Flower2,
  KeyRound,
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
  settings: {
    wifiName: string | null;
    wifiPassword: string | null;
    guestInfo: string | null;
    checkOutTime: string;
  };
  services: Service[];
  minibar: { id: string; name: string; priceCents: number }[];
  folios: { id: string; number: number; balanceCents: number; lines: Line[] }[];
  bookings: { id: string; service: string; startsAt: string; people: number; status: string }[];
}) {
  const t = useTranslations("portal");
  const day = useDay();
  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 pt-4 pb-24">
      <header className="overflow-hidden rounded-3xl bg-[var(--sidebar)] p-6 text-[var(--sidebar-fg)]">
        <p className="text-xs tracking-[0.2em] text-[var(--brass)] uppercase">{hotelName}</p>
        <h1 className="mt-1 text-2xl font-bold">
          {stay && verified ? t("hello", { name: stay.firstName || "" }) : t("welcome")}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm opacity-80">
          <KeyRound className="size-4" aria-hidden="true" />
          {t("room", { room })}
          {stay
            ? ` | ${t("departure", { day: day(stay.departure, { weekday: "long", day: "numeric", month: "long" }), time: settings.checkOutTime })}`
            : ""}
        </p>
      </header>

      {stay && !verified ? <Verify /> : null}

      {settings.wifiName ? (
        <Card icon={<Wifi />} title={t("wifi")}>
          <p className="text-sm" dir="ltr">
            <span className="text-fg-muted">SSID</span> <b>{settings.wifiName}</b>
            {settings.wifiPassword ? (
              <>
                {" | "}
                <span className="text-fg-muted">{t("password")}</span>{" "}
                <b className="select-all">{settings.wifiPassword}</b>
              </>
            ) : null}
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/table"
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 font-semibold"
        >
          <UtensilsCrossed className="size-5 text-accent-text" aria-hidden="true" />
          {t("roomService")}
          <span className="text-xs font-normal text-fg-muted">{t("roomServiceHint")}</span>
        </Link>
        <Link
          href={`/r/${slug}/book`}
          className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 font-semibold"
        >
          <CalendarCheck className="size-5 text-accent-text" aria-hidden="true" />
          {t("restaurant")}
          <span className="text-xs font-normal text-fg-muted">{t("restaurantHint")}</span>
        </Link>
        <Link
          href="/table"
          className="col-span-2 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 font-semibold"
        >
          <BellRing className="size-5 text-accent-text" aria-hidden="true" />
          <span className="flex-1">
            {t("requests")}
            <span className="block text-xs font-normal text-fg-muted">{t("requestsHint")}</span>
          </span>
        </Link>
      </div>

      {settings.guestInfo ? (
        <Card icon={<KeyRound />} title={t("info")}>
          <p className="text-sm whitespace-pre-line">{settings.guestInfo}</p>
        </Card>
      ) : null}

      {!stay ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">{t("noStay")}</p>
      ) : !verified ? null : (
        <>
          {services.length ? (
            <Spa
              services={services}
              currency={currency}
              today={today}
              timeZone={timeZone}
              bookings={bookings}
            />
          ) : null}
          {minibar.length ? <Minibar items={minibar} currency={currency} /> : null}
          <Bill folios={folios} currency={currency} />
        </>
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
  id,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent-text [&_svg]:size-4">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Verify() {
  const t = useTranslations("portal");
  const [name, setName] = useState("");
  const r = useRun();
  return (
    <Card id="verify" icon={<KeyRound />} title={t("verifyTitle")}>
      <p className="mb-3 text-sm text-fg-muted">{t("verifyHint")}</p>
      <form className="flex gap-2" action={() => r.run(() => verifyStayAction(name))}>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("lastName")}
          autoComplete="family-name"
          required
        />
        <Button type="submit" disabled={r.pending}>
          {t("verify")}
        </Button>
      </form>
      <div className="mt-2">
        <FormError error={r.error} />
      </div>
    </Card>
  );
}

function Spa({
  services,
  currency,
  today,
  timeZone,
  bookings,
}: {
  services: Service[];
  currency: string;
  today: string;
  timeZone: string;
  bookings: { id: string; service: string; startsAt: string; people: number; status: string }[];
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
    <Card id="spa" icon={<Flower2 />} title={t("spa")}>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setServiceId(s.id);
              setPicked(null);
            }}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ring-1",
              s.id === serviceId ? "bg-accent text-accent-fg ring-accent" : "ring-border",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>
      <p className="mb-3 text-sm text-fg-muted">
        {tKind(svc.kind)} | {t("minutes", { n: svc.durationMin })} ·{" "}
        {svc.priceCents ? t("perPerson", { price: money(svc.priceCents) }) : t("included")}
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
      <div className="mb-3 flex flex-wrap gap-2">
        {slots.map((s) => {
          const off = s.past || s.left < people;
          return (
            <button
              key={s.time}
              type="button"
              disabled={off}
              onClick={() => setPicked(s.time)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold tabular-nums ring-1",
                picked === s.time ? "bg-accent text-accent-fg ring-accent" : "ring-border",
                off && "opacity-30",
              )}
              dir="ltr"
            >
              {s.time}
            </button>
          );
        })}
        {!slots.length ? <p className="text-sm text-fg-muted">{t("noSlots")}</p> : null}
      </div>
      <FormError error={r.error} />
      <Button
        className="w-full"
        disabled={!picked || r.pending}
        onClick={() =>
          picked &&
          r.run(
            () => bookSpaAction(serviceId, day, picked, people),
            () => setDone(!done),
          )
        }
      >
        {picked ? t("bookAt", { time: picked, price: money(svc.priceCents * people) }) : t("pickSlot")}
      </Button>
      {upcoming.length ? (
        <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
          {upcoming.map((b) => (
            <li key={b.id} className="flex items-center gap-2">
              <span className="flex-1">
                <b>{b.service}</b> | {when(b.startsAt)} | {t("peopleN", { n: b.people })}
              </span>
              <CancelSpa id={b.id} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
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

function Minibar({
  items,
  currency,
}: {
  items: { id: string; name: string; priceCents: number }[];
  currency: string;
}) {
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
  return (
    <Card id="minibar" icon={<Wine />} title={t("minibar")}>
      <p className="mb-2 text-sm text-fg-muted">{t("minibarHint")}</p>
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex-1">{i.name}</span>
            <span className="text-fg-muted tabular-nums">{money(i.priceCents)}</span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full ring-1 ring-border"
                onClick={() => setQty({ ...qty, [i.id]: Math.max(0, (qty[i.id] ?? 0) - 1) })}
                aria-label="−"
              >
                −
              </button>
              <span className="w-6 text-center tabular-nums">{qty[i.id] ?? 0}</span>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full ring-1 ring-border"
                onClick={() => setQty({ ...qty, [i.id]: Math.min(50, (qty[i.id] ?? 0) + 1) })}
                aria-label="+"
              >
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
      <FormError error={r.error} />
      {sent ? (
        <p className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{t("minibarThanks")}</p>
      ) : null}
      <Button
        className="mt-3 w-full"
        disabled={!lines.length || r.pending}
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
    </Card>
  );
}

function Bill({
  folios,
  currency,
}: {
  folios: { id: string; number: number; balanceCents: number; lines: Line[] }[];
  currency: string;
}) {
  const t = useTranslations("portal");
  const money = useMoney(currency);
  const day = useDay();
  const label = useLineLabel();
  const balance = folios.reduce((s, f) => s + f.balanceCents, 0);
  return (
    <Card id="bill" icon={<Receipt />} title={t("bill")}>
      {folios.flatMap((f) => f.lines).length ? (
        <ul className="space-y-1.5 text-sm">
          {folios.flatMap((f) =>
            f.lines.map((l) => (
              <li key={l.id} className="flex gap-2">
                <span className="w-14 shrink-0 text-fg-muted">{day(l.businessDate)}</span>
                <span className="flex-1">
                  {label(l)}
                  {l.quantity > 1 ? ` × ${l.quantity}` : ""}
                </span>
                <span className={cn("tabular-nums", l.amountCents < 0 && "text-success")}>
                  {money(l.amountCents)}
                </span>
              </li>
            )),
          )}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("billEmpty")}</p>
      )}
      <p className="mt-3 flex justify-between border-t border-border pt-3 font-bold">
        <span>{t("balance")}</span>
        <span className="tabular-nums">{money(balance)}</span>
      </p>
      <p className="mt-2 text-xs text-fg-muted">{t("billHint")}</p>
    </Card>
  );
}
