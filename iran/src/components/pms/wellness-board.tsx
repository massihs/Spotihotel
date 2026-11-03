"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  bookServiceAction,
  cancelServiceBookingAction,
  serviceBookingStatusAction,
  serviceDayAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { Empty, FormError, Label, RunButton, StatusPill, inputCls, useTime } from "./kit";
import { DateInput } from "@/components/ui/date-input";

type Service = {
  id: string;
  kind: string;
  name: string;
  durationMin: number;
  priceCents: number;
  capacity: number;
  active: boolean;
};
type Booking = {
  id: string;
  serviceId: string;
  guestName: string;
  roomLabel: string | null;
  startsAt: string;
  people: number;
  status: string;
  staffName: string | null;
  priceCents: number;
};
type InHouse = { id: string; label: string };

export function WellnessBoard({
  restaurantId,
  currency,
  timeZone,
  day,
  services,
  bookings,
  inHouse,
  preselectStay,
  canManage,
}: {
  restaurantId: string;
  currency: string;
  timeZone: string;
  day: string;
  services: Service[];
  bookings: Booking[];
  inHouse: InHouse[];
  preselectStay: string | null;
  canManage: boolean;
}) {
  const t = useTranslations("pms.wellness");
  const tKind = useTranslations("pms.serviceKind");
  const money = useMoney(currency);
  const time = useTime(timeZone);
  const router = useRouter();
  const active = services.filter((s) => s.active);
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <DateInput
            className={cn(inputCls, "w-auto")}
            value={day}
            onChange={(v) => v && router.push(`/dashboard/${restaurantId}/wellness?day=${v}`)}
            aria-label={t("day")}
          />
        </div>
        {active.length ? (
          active.map((s) => {
            const list = bookings.filter((b) => b.serviceId === s.id);
            return (
              <section key={s.id} className="rounded-2xl border border-border bg-surface p-4">
                <h2 className="mb-2 flex flex-wrap items-baseline gap-2 font-semibold">
                  {s.name}
                  <span className="text-xs font-normal text-fg-muted">
                    {tKind(s.kind)} · {t("duration", { n: s.durationMin })} ·{" "}
                    {t("capacity", { n: s.capacity })} · {money(s.priceCents)}
                  </span>
                </h2>
                {list.length ? (
                  <ul className="divide-y divide-border">
                    {list.map((b) => (
                      <li
                        key={b.id}
                        className={cn(
                          "flex flex-wrap items-center gap-3 py-2.5 text-sm",
                          b.status === "cancelled" && "opacity-50",
                        )}
                      >
                        <span className="w-14 font-bold tabular-nums">{time(b.startsAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{b.guestName}</span>
                          {b.roomLabel ? (
                            <span className="text-fg-muted"> · {t("room", { room: b.roomLabel })}</span>
                          ) : null}
                          <span className="text-fg-muted"> · {b.people} 👤</span>
                          {b.staffName ? <span className="text-fg-muted"> · {b.staffName}</span> : null}
                        </span>
                        <StatusPill status={b.status} />
                        {canManage && b.status === "booked" ? (
                          <span className="flex gap-1">
                            <RunButton run={() => serviceBookingStatusAction(restaurantId, b.id, "done")}>
                              {t("done")}
                            </RunButton>
                            <RunButton
                              variant="ghost"
                              run={() => serviceBookingStatusAction(restaurantId, b.id, "no_show")}
                            >
                              {t("noShow")}
                            </RunButton>
                            <RunButton
                              variant="ghost"
                              confirm={t("cancelConfirm")}
                              run={() => cancelServiceBookingAction(restaurantId, b.id)}
                            >
                              {t("cancel")}
                            </RunButton>
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-fg-muted">{t("none")}</p>
                )}
              </section>
            );
          })
        ) : (
          <Empty>{t("noServices")}</Empty>
        )}
      </div>
      {canManage && active.length ? (
        <BookForm
          restaurantId={restaurantId}
          day={day}
          services={active}
          inHouse={inHouse}
          preselectStay={preselectStay}
        />
      ) : null}
    </div>
  );
}

function BookForm({
  restaurantId,
  day,
  services,
  inHouse,
  preselectStay,
}: {
  restaurantId: string;
  day: string;
  services: Service[];
  inHouse: InHouse[];
  preselectStay: string | null;
}) {
  const t = useTranslations("pms.wellness");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState(day);
  const [slots, setSlots] = useState<{ time: string; left: number; past: boolean }[]>([]);
  const [stayId, setStayId] = useState(preselectStay ?? "");
  const r = useRun();
  useEffect(() => {
    let live = true;
    serviceDayAction(restaurantId, serviceId, date).then((res) => {
      if (live) setSlots(res?.ok && res.data ? res.data : []);
    });
    return () => {
      live = false;
    };
  }, [restaurantId, serviceId, date, r.pending]);
  return (
    <form
      className="h-fit space-y-4 rounded-2xl border border-border bg-surface p-5 xl:sticky xl:top-20"
      action={(fd) =>
        r.run(() =>
          bookServiceAction(restaurantId, {
            serviceId,
            day: date,
            time: String(fd.get("time")),
            people: Number(fd.get("people") || 1),
            stayId: stayId || null,
            guestName: String(fd.get("guestName") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            staffName: String(fd.get("staffName") ?? ""),
            note: String(fd.get("note") ?? ""),
          }),
        )
      }
    >
      <h2 className="font-bold">{t("book")}</h2>
      <label className="block">
        <Label>{t("service")}</Label>
        <select className={inputCls} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <Label>{t("day")}</Label>
          <DateInput className={inputCls} value={date} onChange={(v) => setDate(v)} />
        </label>
        <label>
          <Label>{t("people")}</Label>
          <input name="people" type="number" min={1} max={50} defaultValue={1} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <Label>{t("time")}</Label>
        <select name="time" className={inputCls} required>
          {slots.map((s) => (
            <option key={s.time} value={s.time} disabled={s.past || s.left <= 0}>
              {s.time} · {s.past ? t("past") : s.left > 0 ? t("left", { n: s.left }) : t("full")}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <Label>{t("guest")}</Label>
        <select className={inputCls} value={stayId} onChange={(e) => setStayId(e.target.value)}>
          <option value="">{t("visitor")}</option>
          {inHouse.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {!stayId ? (
        <div className="grid grid-cols-2 gap-3">
          <label>
            <Label>{t("name")}</Label>
            <input name="guestName" className={inputCls} required maxLength={120} />
          </label>
          <label>
            <Label>{t("phone")}</Label>
            <input name="phone" type="tel" className={inputCls} maxLength={24} dir="ltr" />
          </label>
        </div>
      ) : (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">{t("chargedToRoom")}</p>
      )}
      <label className="block">
        <Label>{t("staff")}</Label>
        <input name="staffName" className={inputCls} maxLength={80} />
      </label>
      <label className="block">
        <Label>{t("note")}</Label>
        <input name="note" className={inputCls} maxLength={300} />
      </label>
      <FormError error={r.error} />
      <Button
        type="submit"
        className="w-full"
        disabled={r.pending || !slots.some((s) => !s.past && s.left > 0)}
      >
        {t("confirm")}
      </Button>
    </form>
  );
}
