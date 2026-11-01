"use client";

import { Bike, Check, Clock, HandCoins, MapPin, Phone, Plus, Trash2, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Sheet, field, num, useRun } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import {
  createCourierAction,
  deleteCourierAction,
  deleteZoneAction,
  deliveredAction,
  dispatchAction,
  saveZoneAction,
  setCourierActiveAction,
  settleCourierAction,
} from "@/app/[locale]/dashboard/[restaurantId]/delivery/actions";

export type DeliveryCard = {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  totalCents: number;
  address: string | null;
  phone: string | null;
  note: string | null;
  placedAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  courierSettledAt: string | null;
  courierName: string | null;
  zoneName: string | null;
  customerName: string | null;
};
type CourierOpt = { id: string; name: string; isActive: boolean };

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
const mins = (from: string, now: number) => Math.max(0, Math.round((now - Date.parse(from)) / 60_000));

const COLS = {
  toAssign: { tone: "border-tone-amber/40", head: "bg-tone-amber/15 text-tone-amber" },
  onTheRoad: { tone: "border-tone-sky/40", head: "bg-tone-sky/15 text-tone-sky" },
  delivered: { tone: "border-tone-emerald/40", head: "bg-tone-emerald/15 text-tone-emerald" },
} as const;

export function DispatchBoard({
  rid,
  currency,
  board,
  couriers,
}: {
  rid: string;
  currency: string;
  board: Record<keyof typeof COLS, DeliveryCard[]>;
  couriers: CourierOpt[];
}) {
  const t = useTranslations("delivery");
  const money = useMoney(currency);
  const now = useNow();
  const { pending, error, run } = useRun();
  const [pick, setPick] = useState<Record<string, string>>({});
  const active = couriers.filter((c) => c.isActive);
  return (
    <>
      {error ? <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(COLS) as (keyof typeof COLS)[]).map((col) => (
          <section key={col} className={cn("rounded-2xl border bg-surface", COLS[col].tone)}>
            <header
              className={cn("flex items-center justify-between rounded-t-2xl px-4 py-2.5", COLS[col].head)}
            >
              <p className="font-semibold">{t(`cols.${col}`)}</p>
              <span className="rounded-full bg-surface px-2 text-sm font-bold tabular-nums">
                {board[col].length}
              </span>
            </header>
            <ul className="space-y-2 p-2">
              {board[col].length === 0 ? (
                <li className="py-8 text-center text-sm text-fg-subtle">{t("empty")}</li>
              ) : null}
              {board[col].map((o) => {
                const elapsed =
                  col === "toAssign"
                    ? mins(o.placedAt, now)
                    : col === "onTheRoad"
                      ? mins(o.dispatchedAt!, now)
                      : Math.round((Date.parse(o.deliveredAt!) - Date.parse(o.dispatchedAt!)) / 60_000);
                const late = col !== "delivered" && elapsed > (col === "toAssign" ? 25 : 40);
                return (
                  <li key={o.id} className="rounded-xl border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold tabular-nums">{o.number}</p>
                        <p className="truncate text-sm">{o.customerName ?? t("customer")}</p>
                      </div>
                      <div className="text-end">
                        <p className="font-bold tabular-nums">{money(o.totalCents)}</p>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            o.paymentStatus === "paid"
                              ? "bg-success-soft text-success"
                              : "bg-warning-soft text-warning",
                          )}
                        >
                          {o.paymentStatus === "paid" ? t("paid") : t("collect")}
                        </span>
                      </div>
                    </div>
                    {o.address ? (
                      <p className="mt-2 flex gap-1.5 text-sm text-fg-muted">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-tone-rose" />
                        <span className="line-clamp-2">
                          {o.zoneName ? <b className="text-fg">{o.zoneName} · </b> : null}
                          {o.address}
                        </span>
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      {o.phone ? (
                        <a
                          href={`tel:${o.phone}`}
                          dir="ltr"
                          className="inline-flex items-center gap-1 tabular-nums"
                        >
                          <Phone className="size-3.5" />
                          {o.phone}
                        </a>
                      ) : null}
                      <span
                        className={cn("inline-flex items-center gap-1", late && "font-semibold text-danger")}
                      >
                        <Clock className="size-3.5" />
                        {t("minutes", { count: elapsed })}
                      </span>
                      {o.courierName ? (
                        <span className="inline-flex items-center gap-1">
                          <Bike className="size-3.5" />
                          {o.courierName}
                        </span>
                      ) : null}
                    </div>
                    {col === "toAssign" ? (
                      <div className="mt-3 flex gap-2">
                        <select
                          value={pick[o.id] ?? active[0]?.id ?? ""}
                          onChange={(e) => setPick((p) => ({ ...p, [o.id]: e.target.value }))}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm"
                          aria-label={t("courier")}
                        >
                          {active.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={pending || !active.length}
                          onClick={() => run(() => dispatchAction(rid, o.id, pick[o.id] ?? active[0]!.id))}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg disabled:opacity-50"
                        >
                          <Bike className="size-4" />
                          {t("dispatch")}
                        </button>
                      </div>
                    ) : null}
                    {col === "onTheRoad" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => deliveredAction(rid, o.id))}
                        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-tone-emerald px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="size-4" />
                        {t("delivered")}
                      </button>
                    ) : null}
                    {col === "delivered" && o.courierSettledAt ? (
                      <p className="mt-2 text-xs font-semibold text-success">{t("settled")}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {!active.length ? <p className="mt-3 text-sm text-warning">{t("noCouriers")}</p> : null}
    </>
  );
}

export function CourierSettlement({
  rid,
  currency,
  balances,
}: {
  rid: string;
  currency: string;
  balances: {
    courierId: string;
    name: string;
    deliveries: number;
    collectCents: number;
    onTheRoad: number;
  }[];
}) {
  const t = useTranslations("delivery");
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <p className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
        <HandCoins className="size-5 text-tone-amber" />
        {t("settlement")}
      </p>
      {error ? <p className="px-4 pt-3 text-sm text-danger">{error}</p> : null}
      {done ? <p className="px-4 pt-3 text-sm font-semibold text-success">{done}</p> : null}
      <ul className="divide-y divide-border">
        {balances.map((b) => (
          <li key={b.courierId} className="flex items-center gap-3 px-4 py-3">
            <span className="grid size-10 place-items-center rounded-full bg-tone-sky/15 text-tone-sky">
              <Bike className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{b.name}</p>
              <p className="text-xs text-fg-muted">
                {t("toSettle", { count: b.deliveries })}
                {b.onTheRoad ? ` · ${t("onRoadN", { count: b.onTheRoad })}` : ""}
              </p>
            </div>
            <div className="text-end">
              <p className="text-xs text-fg-muted">{t("cashToCollect")}</p>
              <p className="font-bold tabular-nums">{money(b.collectCents)}</p>
            </div>
            <button
              type="button"
              disabled={pending || b.deliveries === 0}
              onClick={() =>
                run(async () => {
                  const res = await settleCourierAction(rid, b.courierId);
                  if (res?.ok && res.data)
                    setDone(t("settledDone", { name: b.name, amount: money(res.data.amountCents) }));
                  return res;
                })
              }
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg disabled:opacity-40"
            >
              <Wallet className="size-4" />
              {t("settle")}
            </button>
          </li>
        ))}
        {!balances.length ? (
          <li className="px-4 py-8 text-center text-sm text-fg-subtle">{t("noCouriers")}</li>
        ) : null}
      </ul>
    </div>
  );
}

export function DeliverySettings({
  rid,
  currency,
  zones,
  couriers,
  canManage,
}: {
  rid: string;
  currency: string;
  zones: {
    id: string;
    name: string;
    feeCents: number;
    minOrderCents: number;
    etaMinutes: number;
    isActive: boolean;
  }[];
  couriers: { id: string; name: string; phone: string | null; isActive: boolean }[];
  canManage: boolean;
}) {
  const t = useTranslations("delivery");
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [zoneEdit, setZoneEdit] = useState<(typeof zones)[number] | "new" | null>(null);
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 font-semibold">
            <MapPin className="size-5 text-tone-rose" />
            {t("zones")}
          </p>
          {canManage ? (
            <button
              type="button"
              onClick={() => setZoneEdit("new")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-accent-fg"
            >
              <Plus className="size-4" />
              {t("newZone")}
            </button>
          ) : null}
        </div>
        <ul className="divide-y divide-border">
          {zones.map((z) => (
            <li key={z.id}>
              <button
                type="button"
                disabled={!canManage}
                onClick={() => setZoneEdit(z)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-2",
                  !z.isActive && "opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{z.name}</span>
                  <span className="block text-xs text-fg-muted">
                    {t("eta", { count: z.etaMinutes })}
                    {z.minOrderCents ? ` · ${t("minOrder", { amount: money(z.minOrderCents) })}` : ""}
                  </span>
                </span>
                <span className="font-bold tabular-nums">{money(z.feeCents)}</span>
              </button>
            </li>
          ))}
          {!zones.length ? (
            <li className="px-4 py-8 text-center text-sm text-fg-subtle">{t("noZones")}</li>
          ) : null}
        </ul>
      </div>
      <div className="rounded-2xl border border-border bg-surface">
        <p className="flex items-center gap-2 border-b border-border px-4 py-3 font-semibold">
          <Bike className="size-5 text-tone-sky" />
          {t("couriers")}
        </p>
        {canManage ? (
          <div className="flex gap-2 border-b border-border p-3">
            <input
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder={t("courierName")}
              className={cn(field, "h-10")}
            />
            <input
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value)}
              placeholder="09…"
              inputMode="tel"
              dir="ltr"
              className={cn(field, "h-10 w-36")}
            />
            <button
              type="button"
              disabled={pending || !cName.trim()}
              onClick={() =>
                run(
                  () => createCourierAction(rid, { name: cName, phone: cPhone }),
                  () => (setCName(""), setCPhone("")),
                )
              }
              className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-50"
              aria-label={t("addCourier")}
            >
              <Plus className="size-5" />
            </button>
          </div>
        ) : null}
        {error ? <p className="px-4 pt-2 text-sm text-danger">{error}</p> : null}
        <ul className="divide-y divide-border">
          {couriers.map((c) => (
            <li key={c.id} className={cn("flex items-center gap-3 px-4 py-2.5", !c.isActive && "opacity-50")}>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name}</span>
                {c.phone ? (
                  <span dir="ltr" className="block text-start text-xs text-fg-muted tabular-nums">
                    {c.phone}
                  </span>
                ) : null}
              </span>
              {canManage ? (
                <>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={c.isActive}
                      onChange={(e) => run(() => setCourierActiveAction(rid, c.id, e.target.checked))}
                      className="size-4 accent-[var(--accent)]"
                    />
                    {t("active")}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      window.confirm(t("deleteCourier")) && run(() => deleteCourierAction(rid, c.id))
                    }
                    className="grid size-8 place-items-center rounded-full text-fg-subtle hover:text-danger"
                    aria-label={t("deleteCourier")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {zoneEdit ? (
        <ZoneForm
          rid={rid}
          currency={currency}
          zone={zoneEdit === "new" ? null : zoneEdit}
          onClose={() => setZoneEdit(null)}
        />
      ) : null}
    </div>
  );
}

function ZoneForm({
  rid,
  currency,
  zone,
  onClose,
}: {
  rid: string;
  currency: string;
  zone: {
    id: string;
    name: string;
    feeCents: number;
    minOrderCents: number;
    etaMinutes: number;
    isActive: boolean;
  } | null;
  onClose: () => void;
}) {
  const t = useTranslations("delivery");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(zone?.name ?? "");
  const [fee, setFee] = useState(zone ? centsToInput(zone.feeCents, "fa", currency) : "");
  const [min, setMin] = useState(zone?.minOrderCents ? centsToInput(zone.minOrderCents, "fa", currency) : "");
  const [eta, setEta] = useState(String(zone?.etaMinutes ?? 45));
  const [active, setActive] = useState(zone?.isActive ?? true);
  return (
    <Sheet title={zone ? t("editZone") : t("newZone")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          {t("zoneName")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("zoneNamePh")}
            className={cn(field, "mt-1")}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block text-sm font-medium">
            {t("fee")}
            <input
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("minOrderLabel")}
            <input
              value={min}
              onChange={(e) => setMin(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
          <label className="block text-sm font-medium">
            {t("etaLabel")}
            <input
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          {t("active")}
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          {zone ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("deleteZone")) && run(() => deleteZoneAction(rid, zone.id), onClose)
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-danger ring-1 ring-danger/30"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () =>
                  saveZoneAction(rid, zone?.id ?? null, {
                    name,
                    feeCents: parseMoneyInput(fee || "0", currency) ?? 0,
                    minOrderCents: parseMoneyInput(min || "0", currency) ?? 0,
                    etaMinutes: Math.trunc(num(eta)) || 45,
                    isActive: active,
                  }),
                onClose,
              )
            }
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
