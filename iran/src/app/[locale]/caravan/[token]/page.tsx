import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BedDouble, CalendarDays, Clock, Moon, Phone, UsersRound } from "@/components/icons";
import { db } from "@/server/db/client";
import { caravanView } from "@/server/modules/pms/caravan";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { cn } from "@/lib/cn";

type Props = PageProps<"/[locale]/caravan/[token]">;

export default function CaravanPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="skeleton mx-auto mt-10 h-96 max-w-xl rounded-3xl" />}>
      <Caravan params={params} />
    </Suspense>
  );
}

const PRAYERS = ["fajr", "dhuhr", "maghrib", "isha"] as const;

/** The caravan leader's page (private link): rooms of the pilgrims, programme, prayer times. */
async function Caravan({ params }: Pick<Props, "params">) {
  await connection();
  const { token } = await params;
  const v = await caravanView(db, token);
  if (!v) notFound();
  const [t, tp, locale] = await Promise.all([
    getTranslations("caravanPage"),
    getTranslations("stayExtras.prayer"),
    getLocale(),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const inHouse = v.pilgrims.filter((p) => p.status === "in_house").length;
  const rooms = new Set(v.pilgrims.map((p) => p.room).filter(Boolean)).size;
  return (
    <div data-brand={v.hotel.brandColor} className="min-h-dvh bg-bg px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="sidebar-shade relative isolate overflow-hidden rounded-2xl bg-[var(--sidebar)] p-6 text-[var(--sidebar-fg)] shadow-[var(--shadow-float)]">
          <span
            aria-hidden="true"
            className="texture-khatam texture-fade-corner [--tex-color:var(--brass)] [--tex-opacity:0.16] [--tex-size:56px]"
          />
          <p className="relative text-xs font-semibold text-[var(--brass)]">{v.hotel.name}</p>
          <h1 className="font-display relative mt-2 text-3xl leading-tight">
            {t("title", { name: v.name })}
          </h1>
          <p className="relative mt-3 flex items-center gap-1.5 text-sm opacity-85">
            <CalendarDays className="size-4 text-[var(--brass)]" aria-hidden="true" />
            {day(v.arrival)} → {day(v.departure)}
          </p>
          <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["pilgrims", v.pilgrims.length],
                ["rooms", rooms],
                ["inHouse", inHouse],
              ] as const
            ).map(([k, n]) => (
              <div key={k} className="rounded-2xl bg-white/10 px-2 py-2.5 ring-1 ring-white/15">
                <p className="text-2xl font-black tabular-nums">{n}</p>
                <p className="text-[11px] opacity-75">{t(k)}</p>
              </div>
            ))}
          </div>
        </header>

        {v.prayer ? (
          <section className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Moon className="size-5 text-accent-text" aria-hidden="true" />
              {tp("title")}
            </h2>
            <ul className="grid grid-cols-4 gap-1.5 text-center">
              {PRAYERS.map((p) => (
                <li key={p} className="shade-soft rounded-xl px-1 py-2.5">
                  <span className="block text-[11px]">{tp(p)}</span>
                  <span className="mt-0.5 block font-bold tabular-nums" dir="ltr">
                    {v.prayer![p]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {v.schedule.length ? (
          <section className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <Clock className="size-5 text-accent-text" aria-hidden="true" />
              {t("schedule")}
            </h2>
            <ol className="relative ms-3 space-y-3 border-s-2 border-border ps-5">
              {v.schedule.map((line, i) => (
                <li key={i} className="relative text-sm leading-6">
                  <span
                    className="shade-fill absolute -start-[1.72rem] top-1.5 size-3 rounded-full"
                    aria-hidden="true"
                  />
                  {line}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)]">
          <h2 className="flex items-center gap-2 border-b border-border px-4 py-3 font-bold">
            <UsersRound className="size-5 text-accent-text" aria-hidden="true" />
            {t("list")}
          </h2>
          <ul className="divide-y divide-border">
            {v.pilgrims.map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid h-9 min-w-12 place-items-center rounded-xl bg-ink px-2 text-sm font-black text-ink-fg tabular-nums">
                  {p.room ?? <BedDouble className="size-4 opacity-60" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1 leading-snug font-semibold">{p.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    p.status === "in_house"
                      ? "bg-success-soft text-success"
                      : p.status === "checked_out"
                        ? "bg-surface-2 text-fg-muted"
                        : "shade-soft",
                  )}
                >
                  {t(`status.${p.status}` as "status.confirmed")}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {v.hotel.phone ? (
          <a
            href={`tel:${v.hotel.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 font-bold text-accent-fg"
          >
            <Phone className="size-5" aria-hidden="true" />
            {t("call")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
