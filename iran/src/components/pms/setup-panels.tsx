"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { EDITION } from "@/config/edition";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import {
  assignRoomTypeAction,
  deleteMinibarItemAction,
  deleteRatePlanAction,
  deleteRoomTypeAction,
  deleteServiceAction,
  deletePricingRuleAction,
  savePricingRuleAction,
  saveAccountAction,
  saveMinibarItemAction,
  savePmsSettingsAction,
  saveRatePlanAction,
  saveRoomTypeAction,
  saveServiceAction,
  setRateRangeAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { Empty, FormError, Label, RunButton, SheetButton, inputCls, useDay } from "./kit";
import { DateInput } from "@/components/ui/date-input";

const CHANNELS =
  EDITION === "iran"
    ? ["snapptrip", "alibaba", "jabama", "eghamat24", "jainjas", "flytoday", "otaghak", "agency"]
    : ["booking", "expedia", "airbnb", "agency"];
const money0 = (v: FormDataEntryValue | null, currency: string) =>
  parseMoneyInput(String(v ?? ""), currency) ?? 0;
const pct = (bps: number) => String(bps / 100);
const toBps = (v: FormDataEntryValue | null) =>
  Math.round(Number(String(v ?? "0").replace(",", ".")) * 100) || 0;

function Row({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </li>
  );
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {children}
    </ul>
  );
}

// ─── Room types ──────────────────────────────────────────────────────────────

type RoomType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  baseOccupancy: number;
  maxOccupancy: number;
  baseRateCents: number;
  extraAdultCents: number;
  overbookLimit: number;
  rooms: number;
};

export function RoomTypesPanel({
  restaurantId,
  currency,
  types,
}: {
  restaurantId: string;
  currency: string;
  types: RoomType[];
}) {
  const t = useTranslations("pms.setup");
  const money = useMoney(currency);
  return (
    <div className="space-y-4">
      <SheetButton label={t("addType")} title={t("addType")} variant="primary" size="md">
        {(close) => <RoomTypeForm restaurantId={restaurantId} currency={currency} done={close} />}
      </SheetButton>
      {types.length ? (
        <List>
          {types.map((x) => (
            <Row
              key={x.id}
              actions={
                <>
                  <SheetButton label={t("edit")} title={x.name}>
                    {(close) => (
                      <RoomTypeForm restaurantId={restaurantId} currency={currency} type={x} done={close} />
                    )}
                  </SheetButton>
                  <RunButton
                    variant="ghost"
                    confirm={t("deleteConfirm")}
                    run={() => deleteRoomTypeAction(restaurantId, x.id)}
                  >
                    {t("delete")}
                  </RunButton>
                </>
              }
            >
              <p className="font-semibold">
                <span className="me-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{x.code}</span>
                {x.name}
              </p>
              <p className="text-sm text-fg-muted">
                {t("typeLine", {
                  rooms: x.rooms,
                  base: x.baseOccupancy,
                  max: x.maxOccupancy,
                  rate: money(x.baseRateCents),
                })}
              </p>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noTypes")}</Empty>
      )}
    </div>
  );
}

function RoomTypeForm({
  restaurantId,
  currency,
  type,
  done,
}: {
  restaurantId: string;
  currency: string;
  type?: RoomType;
  done: () => void;
}) {
  const t = useTranslations("pms.setup");
  const locale = useLocale();
  const r = useRun();
  return (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveRoomTypeAction(restaurantId, type?.id ?? null, {
              code: String(fd.get("code")),
              name: String(fd.get("name")),
              description: String(fd.get("description") ?? ""),
              baseOccupancy: Number(fd.get("baseOccupancy")),
              maxOccupancy: Number(fd.get("maxOccupancy")),
              baseRateCents: money0(fd.get("baseRate"), currency),
              extraAdultCents: money0(fd.get("extraAdult"), currency),
              overbookLimit: Number(fd.get("overbookLimit") || 0),
            }),
          done,
        )
      }
    >
      <label>
        <Label>{t("code")}</Label>
        <input
          name="code"
          defaultValue={type?.code}
          className={inputCls}
          required
          maxLength={12}
          placeholder="DBL"
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("name")}</Label>
        <input name="name" defaultValue={type?.name} className={inputCls} required maxLength={80} />
      </label>
      <label>
        <Label>{t("baseOccupancy")}</Label>
        <input
          name="baseOccupancy"
          type="number"
          min={1}
          max={20}
          defaultValue={type?.baseOccupancy ?? 2}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("maxOccupancy")}</Label>
        <input
          name="maxOccupancy"
          type="number"
          min={1}
          max={20}
          defaultValue={type?.maxOccupancy ?? 2}
          className={inputCls}
        />
      </label>
      <MoneyField
        name="baseRate"
        currency={currency}
        label={t("baseRate")}
        required
        defaultValue={centsToInput(type?.baseRateCents, locale, currency)}
      />
      <MoneyField
        name="extraAdult"
        currency={currency}
        label={t("extraAdult")}
        defaultValue={centsToInput(type?.extraAdultCents, locale, currency)}
      />
      <label className="col-span-2">
        <Label hint={t("overbookHint")}>{t("overbook")}</Label>
        <input
          name="overbookLimit"
          type="number"
          min={0}
          max={50}
          defaultValue={type?.overbookLimit ?? 0}
          className={inputCls}
        />
      </label>
      <label className="col-span-2">
        <Label>{t("description")}</Label>
        <textarea
          name="description"
          defaultValue={type?.description ?? ""}
          className={`${inputCls} h-20 py-2`}
          maxLength={2000}
        />
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

// ─── Rooms → types ───────────────────────────────────────────────────────────

export function RoomsPanel({
  restaurantId,
  rooms,
  types,
}: {
  restaurantId: string;
  rooms: { id: string; label: string; roomTypeId: string | null }[];
  types: { id: string; code: string; name: string }[];
}) {
  const t = useTranslations("pms.setup");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(types[0]?.id ?? "");
  const r = useRun();
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  if (!rooms.length) return <Empty>{t("noRooms")}</Empty>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">{t("roomsHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(inputCls, "w-auto")} value={target} onChange={(e) => setTarget(e.target.value)}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} — {x.name}
            </option>
          ))}
        </select>
        <Button
          disabled={!selected.size || !target || r.pending}
          onClick={() =>
            r.run(
              () => assignRoomTypeAction(restaurantId, [...selected], target),
              () => setSelected(new Set()),
            )
          }
        >
          {t("assignSelected", { n: selected.size })}
        </Button>
        <FormError error={r.error} />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {rooms.map((room) => {
          const type = types.find((x) => x.id === room.roomTypeId);
          const on = selected.has(room.id);
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => toggle(room.id)}
              aria-pressed={on}
              className={cn(
                "rounded-xl border px-2 py-3 text-center transition-colors",
                on ? "border-accent bg-accent-soft" : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <span className="block font-bold">{room.label}</span>
              <span className={cn("text-xs", type ? "text-fg-muted" : "font-semibold text-warning")}>
                {type?.code ?? t("noType")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Rate plans ──────────────────────────────────────────────────────────────

type Plan = {
  id: string;
  code: string;
  name: string;
  mealPlan: string;
  adjustBps: number;
  adjustCents: number;
  refundable: boolean;
  cancelHours: number;
  minStay: number;
  isDefault: boolean;
  active: boolean;
  bookableOnline: boolean;
};

export function RatePlansPanel({
  restaurantId,
  currency,
  plans,
}: {
  restaurantId: string;
  currency: string;
  plans: Plan[];
}) {
  const t = useTranslations("pms.setup");
  const tMeal = useTranslations("pms.meal");
  const money = useMoney(currency);
  return (
    <div className="space-y-4">
      <SheetButton label={t("addPlan")} title={t("addPlan")} variant="primary" size="md">
        {(close) => <PlanForm restaurantId={restaurantId} currency={currency} done={close} />}
      </SheetButton>
      {plans.length ? (
        <List>
          {plans.map((p) => (
            <Row
              key={p.id}
              actions={
                <>
                  <SheetButton label={t("edit")} title={p.name}>
                    {(close) => (
                      <PlanForm restaurantId={restaurantId} currency={currency} plan={p} done={close} />
                    )}
                  </SheetButton>
                  <RunButton
                    variant="ghost"
                    confirm={t("deleteConfirm")}
                    run={() => deleteRatePlanAction(restaurantId, p.id)}
                  >
                    {t("delete")}
                  </RunButton>
                </>
              }
            >
              <p className={cn("font-semibold", !p.active && "text-fg-subtle")}>
                <span className="me-2 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{p.code}</span>
                {p.name}{" "}
                {p.isDefault ? (
                  <span className="ms-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text">
                    {t("default")}
                  </span>
                ) : null}
              </p>
              <p className="text-sm text-fg-muted">
                {tMeal(p.mealPlan)} ·{" "}
                {p.adjustBps ? `${p.adjustBps > 0 ? "+" : ""}${p.adjustBps / 100}% ` : ""}
                {p.adjustCents ? `${p.adjustCents > 0 ? "+" : ""}${money(p.adjustCents)} ` : ""}·{" "}
                {p.refundable ? t("refundable", { h: p.cancelHours }) : t("nonRefundable")}
                {p.minStay > 1 ? ` | ${t("minStay", { n: p.minStay })}` : ""}
                {p.bookableOnline ? "" : ` | ${t("notOnline")}`}
              </p>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noPlans")}</Empty>
      )}
    </div>
  );
}

function PlanForm({
  restaurantId,
  currency,
  plan,
  done,
}: {
  restaurantId: string;
  currency: string;
  plan?: Plan;
  done: () => void;
}) {
  const t = useTranslations("pms.setup");
  const tMeal = useTranslations("pms.meal");
  const locale = useLocale();
  const r = useRun();
  return (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) => {
        const raw = String(fd.get("adjustAmount") ?? "").trim();
        const negative = raw.startsWith("-");
        const amount = parseMoneyInput(raw.replace(/^-/, ""), currency) ?? 0;
        r.run(
          () =>
            saveRatePlanAction(restaurantId, plan?.id ?? null, {
              code: String(fd.get("code")),
              name: String(fd.get("name")),
              mealPlan: String(fd.get("mealPlan")) as "RO",
              adjustBps: toBps(fd.get("adjustPct")),
              adjustCents: negative ? -amount : amount,
              refundable: fd.get("refundable") === "on",
              cancelHours: Number(fd.get("cancelHours") || 0),
              minStay: Number(fd.get("minStay") || 1),
              isDefault: fd.get("isDefault") === "on",
              active: fd.get("active") === "on",
              bookableOnline: fd.get("bookableOnline") === "on",
            }),
          done,
        );
      }}
    >
      <label>
        <Label>{t("code")}</Label>
        <input
          name="code"
          defaultValue={plan?.code}
          className={inputCls}
          required
          maxLength={12}
          placeholder="BB"
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("name")}</Label>
        <input name="name" defaultValue={plan?.name} className={inputCls} required maxLength={80} />
      </label>
      <label className="col-span-2">
        <Label>{t("mealPlan")}</Label>
        <select name="mealPlan" defaultValue={plan?.mealPlan ?? "RO"} className={inputCls}>
          {["RO", "BB", "HB", "FB", "AI"].map((m) => (
            <option key={m} value={m}>
              {tMeal(m)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label hint="%">{t("adjustPct")}</Label>
        <input
          name="adjustPct"
          defaultValue={plan ? pct(plan.adjustBps) : "0"}
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("adjustAmount")}</Label>
        <input
          name="adjustAmount"
          defaultValue={
            plan?.adjustCents
              ? (plan.adjustCents < 0 ? "-" : "") + centsToInput(Math.abs(plan.adjustCents), locale, currency)
              : ""
          }
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("cancelHours")}</Label>
        <input
          name="cancelHours"
          type="number"
          min={0}
          defaultValue={plan?.cancelHours ?? 24}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("minStayLabel")}</Label>
        <input
          name="minStay"
          type="number"
          min={1}
          max={60}
          defaultValue={plan?.minStay ?? 1}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="refundable"
          defaultChecked={plan?.refundable ?? true}
          className="size-4"
        />{" "}
        {t("refundableLabel")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isDefault"
          defaultChecked={plan?.isDefault ?? false}
          className="size-4"
        />{" "}
        {t("default")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} className="size-4" />{" "}
        {t("active")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="bookableOnline"
          defaultChecked={plan?.bookableOnline ?? true}
          className="size-4"
        />{" "}
        {t("bookableOnline")}
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

// ─── Rate calendar (yield) ───────────────────────────────────────────────────

export function RatesPanel({
  restaurantId,
  currency,
  from,
  nights,
  types,
}: {
  restaurantId: string;
  currency: string;
  from: string;
  nights: string[];
  types: {
    id: string;
    code: string;
    name: string;
    days: { day: string; rateCents: number; closed: boolean; minStay: number | null; free: number }[];
  }[];
}) {
  const t = useTranslations("pms.setup");
  const money = useMoney(currency);
  const day = useDay();
  const r = useRun();
  const [closed, setClosed] = useState(false);
  return (
    <div className="space-y-5">
      <form
        className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-6"
        action={(fd) => {
          const rate = String(fd.get("rate") ?? "").trim();
          const weekdays = fd.getAll("wd").map(Number);
          r.run(() =>
            setRateRangeAction(restaurantId, {
              roomTypeId: String(fd.get("roomTypeId")),
              from: String(fd.get("from")),
              to: String(fd.get("to")),
              rateCents: rate ? parseMoneyInput(rate, currency) : null,
              closed,
              minStay: fd.get("minStay") ? Number(fd.get("minStay")) : null,
              maxStay: fd.get("maxStay") ? Number(fd.get("maxStay")) : null,
              closedToArrival: fd.get("cta") === "on",
              closedToDeparture: fd.get("ctd") === "on",
              weekdays,
            }),
          );
        }}
      >
        <label className="sm:col-span-2">
          <Label>{t("roomType")}</Label>
          <select name="roomTypeId" className={inputCls}>
            {types.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} — {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>{t("from")}</Label>
          <DateInput name="from" defaultValue={from} className={inputCls} required />
        </label>
        <label>
          <Label>{t("to")}</Label>
          <DateInput name="to" defaultValue={nights[6] ?? from} className={inputCls} required />
        </label>
        <div>
          <MoneyField name="rate" currency={currency} label={t("rate")} hint={t("rateHint")} />
        </div>
        <label>
          <Label>{t("minStayLabel")}</Label>
          <input name="minStay" type="number" min={1} max={60} className={inputCls} />
        </label>
        <label>
          <Label>{t("maxStayLabel")}</Label>
          <input name="maxStay" type="number" min={1} max={365} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="cta" className="size-4" /> {t("closedToArrival")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ctd" className="size-4" /> {t("closedToDeparture")}
        </label>
        <fieldset className="flex flex-wrap items-center gap-3 text-sm sm:col-span-4">
          <legend className="sr-only">{t("weekdays")}</legend>
          {(EDITION === "iran" ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0]).map((d) => (
            <label key={d} className="flex items-center gap-1">
              <input type="checkbox" name="wd" value={d} className="size-4" />
              {day(`2024-01-0${d === 0 ? 7 : d}`, { weekday: "short" })}
            </label>
          ))}
          <span className="text-xs text-fg-muted">{t("weekdaysHint")}</span>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={closed}
            onChange={(e) => setClosed(e.target.checked)}
          />{" "}
          {t("stopSell")}
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={r.pending}>
            {t("apply")}
          </Button>
        </div>
        <div className="sm:col-span-6">
          <FormError error={r.error} />
        </div>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-3 py-2 text-start">{t("roomType")}</th>
              {nights.map((d) => (
                <th key={d} className="px-1 py-2 text-center font-semibold">
                  <span className="block text-fg-muted">{day(d, { weekday: "narrow" })}</span>
                  {day(d, { day: "numeric" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((x) => (
              <tr key={x.id} className="border-t border-border">
                <td className="px-3 py-2 font-semibold">{x.code}</td>
                {x.days.map((d) => (
                  <td
                    key={d.day}
                    className={cn(
                      "px-1 py-2 text-center tabular-nums",
                      d.closed && "bg-danger-soft text-danger",
                    )}
                  >
                    <span className="block font-semibold whitespace-nowrap">
                      {d.closed ? "×" : money(d.rateCents)}
                    </span>
                    <span className="text-fg-muted">
                      {d.free}
                      {d.minStay ? ` | ≥${d.minStay}` : ""}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Wellness services ───────────────────────────────────────────────────────

type Service = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  durationMin: number;
  priceCents: number;
  capacity: number;
  opensAt: string;
  closesAt: string;
  slotStepMin: number;
  guestBookable: boolean;
  active: boolean;
};
const KINDS = ["spa", "sauna", "pool", "massage", "hammam", "gym", "beauty", "tennis", "other"];

export function ServicesPanel({
  restaurantId,
  currency,
  services,
}: {
  restaurantId: string;
  currency: string;
  services: Service[];
}) {
  const t = useTranslations("pms.setup");
  const tKind = useTranslations("pms.serviceKind");
  const money = useMoney(currency);
  return (
    <div className="space-y-4">
      <SheetButton label={t("addService")} title={t("addService")} variant="primary" size="md">
        {(close) => <ServiceForm restaurantId={restaurantId} currency={currency} done={close} />}
      </SheetButton>
      {services.length ? (
        <List>
          {services.map((s) => (
            <Row
              key={s.id}
              actions={
                <>
                  <SheetButton label={t("edit")} title={s.name}>
                    {(close) => (
                      <ServiceForm restaurantId={restaurantId} currency={currency} service={s} done={close} />
                    )}
                  </SheetButton>
                  <RunButton
                    variant="ghost"
                    confirm={t("deleteConfirm")}
                    run={() => deleteServiceAction(restaurantId, s.id)}
                  >
                    {t("delete")}
                  </RunButton>
                </>
              }
            >
              <p className={cn("font-semibold", !s.active && "text-fg-subtle")}>{s.name}</p>
              <p className="text-sm text-fg-muted">
                {tKind(s.kind)} | {s.opensAt}–{s.closesAt} | {t("durationN", { n: s.durationMin })} ·{" "}
                {t("capacityN", { n: s.capacity })} | {s.priceCents ? money(s.priceCents) : t("free")}
                {s.guestBookable ? ` | ${t("guestBookable")}` : ""}
              </p>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noServices")}</Empty>
      )}
    </div>
  );
}

function ServiceForm({
  restaurantId,
  currency,
  service,
  done,
}: {
  restaurantId: string;
  currency: string;
  service?: Service;
  done: () => void;
}) {
  const t = useTranslations("pms.setup");
  const tKind = useTranslations("pms.serviceKind");
  const locale = useLocale();
  const r = useRun();
  return (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveServiceAction(restaurantId, service?.id ?? null, {
              kind: String(fd.get("kind")) as "spa",
              name: String(fd.get("name")),
              description: String(fd.get("description") ?? ""),
              durationMin: Number(fd.get("durationMin")),
              priceCents: money0(fd.get("price"), currency),
              capacity: Number(fd.get("capacity")),
              opensAt: String(fd.get("opensAt")),
              closesAt: String(fd.get("closesAt")),
              slotStepMin: Number(fd.get("slotStepMin")),
              guestBookable: fd.get("guestBookable") === "on",
              active: fd.get("active") === "on",
            }),
          done,
        )
      }
    >
      <label>
        <Label>{t("kind")}</Label>
        <select name="kind" defaultValue={service?.kind ?? "spa"} className={inputCls}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {tKind(k)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("name")}</Label>
        <input name="name" defaultValue={service?.name} className={inputCls} required maxLength={120} />
      </label>
      <label>
        <Label>{t("duration")}</Label>
        <input
          name="durationMin"
          type="number"
          min={5}
          max={600}
          defaultValue={service?.durationMin ?? 60}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("capacity")}</Label>
        <input
          name="capacity"
          type="number"
          min={1}
          max={500}
          defaultValue={service?.capacity ?? 1}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("opensAt")}</Label>
        <input name="opensAt" type="time" defaultValue={service?.opensAt ?? "09:00"} className={inputCls} />
      </label>
      <label>
        <Label>{t("closesAt")}</Label>
        <input name="closesAt" type="time" defaultValue={service?.closesAt ?? "20:00"} className={inputCls} />
      </label>
      <label>
        <Label>{t("slotStep")}</Label>
        <input
          name="slotStepMin"
          type="number"
          min={5}
          max={240}
          defaultValue={service?.slotStepMin ?? 30}
          className={inputCls}
        />
      </label>
      <MoneyField
        name="price"
        currency={currency}
        label={t("pricePerPerson")}
        defaultValue={centsToInput(service?.priceCents ?? null, locale, currency)}
      />
      <label className="col-span-2">
        <Label>{t("description")}</Label>
        <textarea
          name="description"
          defaultValue={service?.description ?? ""}
          className={`${inputCls} h-20 py-2`}
          maxLength={2000}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="guestBookable"
          defaultChecked={service?.guestBookable ?? true}
          className="size-4"
        />{" "}
        {t("guestBookable")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={service?.active ?? true} className="size-4" />{" "}
        {t("active")}
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

// ─── Minibar ─────────────────────────────────────────────────────────────────

type MinibarItem = { id: string; name: string; priceCents: number; parQty: number; active: boolean };

export function MinibarPanel({
  restaurantId,
  currency,
  items,
}: {
  restaurantId: string;
  currency: string;
  items: MinibarItem[];
}) {
  const t = useTranslations("pms.setup");
  const money = useMoney(currency);
  const locale = useLocale();
  const form = (item: MinibarItem | undefined, done: () => void, r: ReturnType<typeof useRun>) => (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveMinibarItemAction(restaurantId, item?.id ?? null, {
              name: String(fd.get("name")),
              priceCents: money0(fd.get("price"), currency),
              parQty: Number(fd.get("parQty") || 1),
              active: fd.get("active") === "on",
            }),
          done,
        )
      }
    >
      <label className="col-span-2">
        <Label>{t("name")}</Label>
        <input name="name" defaultValue={item?.name} className={inputCls} required maxLength={80} />
      </label>
      <MoneyField
        name="price"
        currency={currency}
        label={t("price")}
        required
        defaultValue={centsToInput(item?.priceCents ?? null, locale, currency)}
      />
      <label>
        <Label>{t("parQty")}</Label>
        <input
          name="parQty"
          type="number"
          min={0}
          max={99}
          defaultValue={item?.parQty ?? 1}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4" />{" "}
        {t("active")}
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      <SheetButton label={t("addMinibar")} title={t("addMinibar")} variant="primary" size="md">
        {(close) => <WithRun>{(r) => form(undefined, close, r)}</WithRun>}
      </SheetButton>
      {items.length ? (
        <List>
          {items.map((i) => (
            <Row
              key={i.id}
              actions={
                <>
                  <SheetButton label={t("edit")} title={i.name}>
                    {(close) => <WithRun>{(r) => form(i, close, r)}</WithRun>}
                  </SheetButton>
                  <RunButton
                    variant="ghost"
                    confirm={t("deleteConfirm")}
                    run={() => deleteMinibarItemAction(restaurantId, i.id)}
                  >
                    {t("delete")}
                  </RunButton>
                </>
              }
            >
              <p className={cn("font-semibold", !i.active && "text-fg-subtle")}>{i.name}</p>
              <p className="text-sm text-fg-muted">
                {money(i.priceCents)} | {t("parN", { n: i.parQty })}
              </p>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noMinibar")}</Empty>
      )}
    </div>
  );
}

function WithRun({ children }: { children: (r: ReturnType<typeof useRun>) => React.ReactNode }) {
  const r = useRun();
  return <>{children(r)}</>;
}

// ─── Company accounts ────────────────────────────────────────────────────────

type Account = {
  id: string;
  kind: string;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  creditLimitCents: number;
  paymentTermsDays: number;
  commissionBps: number;
  active: boolean;
  balanceCents: number;
};

export function AccountsPanel({
  restaurantId,
  currency,
  accounts,
  canEdit,
}: {
  restaurantId: string;
  currency: string;
  accounts: Account[];
  canEdit: boolean;
}) {
  const t = useTranslations("pms.setup");
  const tKind = useTranslations("pms.accountKind");
  const money = useMoney(currency);
  const locale = useLocale();
  const form = (a: Account | undefined, done: () => void, r: ReturnType<typeof useRun>) => (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveAccountAction(restaurantId, a?.id ?? null, {
              kind: String(fd.get("kind")) as "company",
              name: String(fd.get("name")),
              taxId: String(fd.get("taxId") ?? ""),
              email: String(fd.get("email") ?? ""),
              phone: String(fd.get("phone") ?? ""),
              address: String(fd.get("address") ?? ""),
              creditLimitCents: money0(fd.get("creditLimit"), currency),
              paymentTermsDays: Number(fd.get("paymentTermsDays") || 30),
              commissionBps: toBps(fd.get("commission")),
              active: fd.get("active") === "on",
            }),
          done,
        )
      }
    >
      <label>
        <Label>{t("kind")}</Label>
        <select name="kind" defaultValue={a?.kind ?? "company"} className={inputCls}>
          {["company", "agency", "ota"].map((k) => (
            <option key={k} value={k}>
              {tKind(k)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("name")}</Label>
        <input name="name" defaultValue={a?.name} className={inputCls} required maxLength={160} />
      </label>
      <label>
        <Label>{t("taxId")}</Label>
        <input name="taxId" defaultValue={a?.taxId ?? ""} className={inputCls} maxLength={40} dir="ltr" />
      </label>
      <label>
        <Label>{t("email")}</Label>
        <input
          name="email"
          type="email"
          defaultValue={a?.email ?? ""}
          className={inputCls}
          maxLength={320}
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("phone")}</Label>
        <input name="phone" defaultValue={a?.phone ?? ""} className={inputCls} maxLength={24} dir="ltr" />
      </label>
      <MoneyField
        name="creditLimit"
        currency={currency}
        label={t("creditLimit")}
        hint={t("creditLimitHint")}
        defaultValue={centsToInput(a?.creditLimitCents || null, locale, currency)}
      />
      <label>
        <Label>{t("paymentTerms")}</Label>
        <input
          name="paymentTermsDays"
          type="number"
          min={0}
          max={365}
          defaultValue={a?.paymentTermsDays ?? 30}
          className={inputCls}
        />
      </label>
      <label>
        <Label hint="%">{t("commission")}</Label>
        <input
          name="commission"
          defaultValue={a ? pct(a.commissionBps) : "0"}
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <label className="col-span-2">
        <Label>{t("address")}</Label>
        <textarea
          name="address"
          defaultValue={a?.address ?? ""}
          className={`${inputCls} h-16 py-2`}
          maxLength={500}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="size-4" />{" "}
        {t("active")}
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      {canEdit ? (
        <SheetButton label={t("addAccount")} title={t("addAccount")} variant="primary" size="md">
          {(close) => <WithRun>{(r) => form(undefined, close, r)}</WithRun>}
        </SheetButton>
      ) : null}
      {accounts.length ? (
        <List>
          {accounts.map((a) => (
            <Row
              key={a.id}
              actions={
                canEdit ? (
                  <SheetButton label={t("edit")} title={a.name}>
                    {(close) => <WithRun>{(r) => form(a, close, r)}</WithRun>}
                  </SheetButton>
                ) : null
              }
            >
              <p className={cn("font-semibold", !a.active && "text-fg-subtle")}>
                {a.name} <span className="text-xs font-normal text-fg-muted">{tKind(a.kind)}</span>
              </p>
              <p className="text-sm text-fg-muted">
                {t("accountLine", { terms: a.paymentTermsDays })} ·{" "}
                {t("owes", { amount: money(a.balanceCents) })}
                {a.creditLimitCents ? ` | ${t("limit", { amount: money(a.creditLimitCents) })}` : ""}
              </p>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noAccounts")}</Empty>
      )}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function PmsSettingsPanel({
  restaurantId,
  currency,
  settings,
}: {
  restaurantId: string;
  currency: string;
  settings: {
    checkInTime: string;
    checkOutTime: string;
    roomTaxBps: number;
    serviceTaxBps: number;
    cityTaxCents: number;
    autoChargeRoomService: boolean;
    minibarSelfService: boolean;
    chargeNoShows: boolean;
    channelCommissions: Record<string, number>;
    wifiName: string | null;
    wifiPassword: string | null;
    guestInfo: string | null;
    businessDate: string;
  };
}) {
  const t = useTranslations("pms.setup");
  const tSrc = useTranslations("pms.source");
  const locale = useLocale();
  const day = useDay();
  const r = useRun();
  const s = settings;
  return (
    <form
      className="grid max-w-3xl gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2"
      action={(fd) =>
        r.run(() =>
          savePmsSettingsAction(restaurantId, {
            checkInTime: String(fd.get("checkInTime")),
            checkOutTime: String(fd.get("checkOutTime")),
            roomTaxBps: toBps(fd.get("roomTax")),
            serviceTaxBps: toBps(fd.get("serviceTax")),
            cityTaxCents: money0(fd.get("cityTax"), currency),
            autoChargeRoomService: fd.get("autoCharge") === "on",
            minibarSelfService: fd.get("minibarSelf") === "on",
            chargeNoShows: fd.get("chargeNoShows") === "on",
            channelCommissions: Object.fromEntries(
              CHANNELS.map((c) => [c, toBps(fd.get(`commission_${c}`))]).filter(([, v]) => Number(v) > 0),
            ),
            wifiName: String(fd.get("wifiName") ?? ""),
            wifiPassword: String(fd.get("wifiPassword") ?? ""),
            guestInfo: String(fd.get("guestInfo") ?? ""),
          }),
        )
      }
    >
      <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm sm:col-span-2">
        {t("businessDate", {
          day: day(s.businessDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        })}
      </p>
      <label>
        <Label>{t("checkInTime")}</Label>
        <input name="checkInTime" type="time" defaultValue={s.checkInTime} className={inputCls} />
      </label>
      <label>
        <Label>{t("checkOutTime")}</Label>
        <input name="checkOutTime" type="time" defaultValue={s.checkOutTime} className={inputCls} />
      </label>
      <label>
        <Label hint="%">{t("roomTax")}</Label>
        <input
          name="roomTax"
          defaultValue={pct(s.roomTaxBps)}
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <label>
        <Label hint="%">{t("serviceTax")}</Label>
        <input
          name="serviceTax"
          defaultValue={pct(s.serviceTaxBps)}
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <MoneyField
        name="cityTax"
        currency={currency}
        label={t("cityTax")}
        hint={t("cityTaxHint")}
        defaultValue={centsToInput(s.cityTaxCents || null, locale, currency)}
      />
      <div />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="autoCharge"
          defaultChecked={s.autoChargeRoomService}
          className="size-4"
        />{" "}
        {t("autoCharge")}
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="minibarSelf" defaultChecked={s.minibarSelfService} className="size-4" />{" "}
        {t("minibarSelf")}
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="chargeNoShows" defaultChecked={s.chargeNoShows} className="size-4" />{" "}
        {t("chargeNoShows")}
      </label>
      <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-border p-3 sm:col-span-2 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">{t("commissions")}</legend>
        {CHANNELS.map((c) => (
          <label key={c} className="text-sm">
            <span className="mb-1 block text-fg-muted">{tSrc(c)} %</span>
            <input
              name={`commission_${c}`}
              defaultValue={s.channelCommissions[c] ? pct(s.channelCommissions[c]!) : ""}
              className={`${inputCls} h-9`}
              inputMode="decimal"
              dir="ltr"
            />
          </label>
        ))}
      </fieldset>
      <label>
        <Label>{t("wifiName")}</Label>
        <input
          name="wifiName"
          defaultValue={s.wifiName ?? ""}
          className={inputCls}
          maxLength={64}
          dir="ltr"
        />
      </label>
      <label>
        <Label>{t("wifiPassword")}</Label>
        <input
          name="wifiPassword"
          defaultValue={s.wifiPassword ?? ""}
          className={inputCls}
          maxLength={64}
          dir="ltr"
        />
      </label>
      <label className="sm:col-span-2">
        <Label>{t("guestInfo")}</Label>
        <textarea
          name="guestInfo"
          defaultValue={s.guestInfo ?? ""}
          className={`${inputCls} h-32 py-2`}
          maxLength={4000}
          placeholder={t("guestInfoHint")}
        />
      </label>
      <div className="space-y-2 sm:col-span-2">
        <FormError error={r.error} />
        <Button type="submit" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

// ─── Dynamic pricing (revenue management) ────────────────────────────────────

type Rule = {
  id: string;
  roomTypeId: string | null;
  typeCode: string | null;
  minOccupancyPct: number;
  withinDays: number | null;
  adjustBps: number;
  active: boolean;
};

export function PricingPanel({
  restaurantId,
  rules,
  types,
}: {
  restaurantId: string;
  rules: Rule[];
  types: { id: string; code: string }[];
}) {
  const t = useTranslations("pms.setup");
  const form = (rule: Rule | undefined, done: () => void, r: ReturnType<typeof useRun>) => (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            savePricingRuleAction(restaurantId, rule?.id ?? null, {
              roomTypeId: String(fd.get("roomTypeId") ?? "") || null,
              minOccupancyPct: Number(fd.get("minOccupancyPct") || 0),
              withinDays: fd.get("withinDays") ? Number(fd.get("withinDays")) : null,
              adjustBps: toBps(fd.get("adjust")),
              active: fd.get("active") === "on",
            }),
          done,
        )
      }
    >
      <label className="col-span-2">
        <Label>{t("roomType")}</Label>
        <select name="roomTypeId" defaultValue={rule?.roomTypeId ?? ""} className={inputCls}>
          <option value="">{t("allTypes")}</option>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label hint="%">{t("fromOccupancy")}</Label>
        <input
          name="minOccupancyPct"
          type="number"
          min={0}
          max={100}
          defaultValue={rule?.minOccupancyPct ?? 70}
          className={inputCls}
        />
      </label>
      <label>
        <Label hint="%">{t("priceChange")}</Label>
        <input
          name="adjust"
          defaultValue={rule ? pct(rule.adjustBps) : "10"}
          className={inputCls}
          inputMode="decimal"
          dir="ltr"
        />
      </label>
      <label className="col-span-2">
        <Label hint={t("withinDaysHint")}>{t("withinDays")}</Label>
        <input
          name="withinDays"
          type="number"
          min={0}
          max={365}
          defaultValue={rule?.withinDays ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} className="size-4" />{" "}
        {t("active")}
      </label>
      <div className="col-span-2 space-y-2">
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-fg-muted">{t("pricingHint")}</p>
      <SheetButton label={t("addRule")} title={t("addRule")} variant="primary" size="md">
        {(close) => <WithRun>{(r) => form(undefined, close, r)}</WithRun>}
      </SheetButton>
      {rules.length ? (
        <List>
          {rules.map((rule) => (
            <Row
              key={rule.id}
              actions={
                <>
                  <SheetButton label={t("edit")} title={t("addRule")}>
                    {(close) => <WithRun>{(r) => form(rule, close, r)}</WithRun>}
                  </SheetButton>
                  <RunButton
                    variant="ghost"
                    confirm={t("deleteConfirm")}
                    run={() => deletePricingRuleAction(restaurantId, rule.id)}
                  >
                    {t("delete")}
                  </RunButton>
                </>
              }
            >
              <p className={cn("font-semibold", !rule.active && "text-fg-subtle")}>
                {t("ruleLine", {
                  type: rule.typeCode ?? t("allTypes"),
                  occ: rule.minOccupancyPct,
                  change: `${rule.adjustBps > 0 ? "+" : ""}${rule.adjustBps / 100}`,
                })}
              </p>
              {rule.withinDays != null ? (
                <p className="text-sm text-fg-muted">{t("ruleWithin", { n: rule.withinDays })}</p>
              ) : null}
            </Row>
          ))}
        </List>
      ) : (
        <Empty>{t("noRules")}</Empty>
      )}
    </div>
  );
}
