"use client";

import { Check, Minus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { centsToInput, parseMoneyInput } from "@/lib/money";
import {
  cancelServiceTicketAction,
  createServiceTicketAction,
  deleteServiceItemAction,
  saveServiceItemAction,
  saveServicesSettingsAction,
  setServiceTicketStatusAction,
  settleServiceTicketAction,
} from "@/app/[locale]/dashboard/[restaurantId]/services-actions";
import { Empty, FormError, Label, RunButton, inputCls } from "@/components/pms/kit";

export const card = "rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]";
export const toCents = (v: FormDataEntryValue | null, currency: string) =>
  parseMoneyInput(String(v ?? ""), currency) ?? 0;

export type Room = { roomId: string; room: string; stayId: string; guest: string };
type Item = { id: string; name: string; category: string | null; priceCents: number; active: boolean };

// ─── Price list (اطلاعات پایه) ───────────────────────────────────────────────

export function ItemsPanel({
  rid,
  kind,
  currency,
  items,
  canManage,
}: {
  rid: string;
  kind: "laundry" | "damage";
  currency: string;
  items: Item[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const money = useMoney(currency);
  const [edit, setEdit] = useState<Item | "new" | null>(null);
  const r = useRun();
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.category ?? "", [...(m.get(i.category ?? "") ?? []), i]);
    return [...m.entries()];
  }, [items]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{t(`items.hint.${kind}`)}</p>
        {canManage ? (
          <Button onClick={() => setEdit("new")} size="sm">
            <Plus className="size-4" />
            {t("items.add")}
          </Button>
        ) : null}
      </div>
      {!items.length ? <Empty>{t("items.empty")}</Empty> : null}
      {groups.map(([cat, list]) => (
        <section key={cat} className={card}>
          <h3 className="mb-3 text-sm font-bold text-fg-muted">{cat || t("items.noCategory")}</h3>
          <ul className="divide-y divide-border">
            {list.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={cn("min-w-0 flex-1 font-semibold", !i.active && "text-fg-subtle line-through")}
                >
                  {i.name}
                </span>
                <span className="font-bold tabular-nums">{money(i.priceCents)}</span>
                {canManage ? (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
                      aria-label={t("edit")}
                      onClick={() => setEdit(i)}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger-soft"
                      aria-label={t("delete")}
                      onClick={() => {
                        if (window.confirm(t("confirmDelete")))
                          r.run(() => deleteServiceItemAction(rid, i.id));
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <FormError error={r.error} />
      {edit ? (
        <Sheet title={edit === "new" ? t("items.add") : edit.name} onClose={() => setEdit(null)}>
          <ItemForm
            rid={rid}
            kind={kind}
            currency={currency}
            item={edit === "new" ? null : edit}
            categories={[...new Set(items.map((i) => i.category).filter(Boolean) as string[])]}
            onDone={() => setEdit(null)}
          />
        </Sheet>
      ) : null}
    </div>
  );
}

function ItemForm({
  rid,
  kind,
  currency,
  item,
  categories,
  onDone,
}: {
  rid: string;
  kind: "laundry" | "damage";
  currency: string;
  item: Item | null;
  categories: string[];
  onDone: () => void;
}) {
  const t = useTranslations("services");
  const r = useRun();
  const locale = useLocale();
  const listId = `cats-${kind}`;
  return (
    <form
      className="grid gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveServiceItemAction(rid, kind, item?.id ?? null, {
              name: String(fd.get("name")),
              category: String(fd.get("category") ?? ""),
              priceCents: toCents(fd.get("price"), currency),
              active: fd.get("active") === "on",
            }),
          onDone,
        )
      }
    >
      <label>
        <Label>{t("items.name")}</Label>
        <input name="name" required maxLength={80} defaultValue={item?.name} className={inputCls} />
      </label>
      <label>
        <Label>{t("items.category")}</Label>
        <input
          name="category"
          list={listId}
          maxLength={40}
          defaultValue={item?.category ?? ""}
          className={inputCls}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <MoneyField
        name="price"
        label={t("items.price")}
        currency={currency}
        defaultValue={item ? centsToInput(item.priceCents, locale, currency) : undefined}
        required
      />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4" />
        {t("items.active")}
      </label>
      <FormError error={r.error} />
      <Button type="submit" disabled={r.pending}>
        {t("save")}
      </Button>
    </form>
  );
}

// ─── Registration (ثبت خدمات) ────────────────────────────────────────────────

export function TicketForm({
  rid,
  kind,
  currency,
  items,
  rooms,
  defaultToRoom,
  expressPct,
}: {
  rid: string;
  kind: "laundry" | "damage";
  currency: string;
  items: Item[];
  rooms: Room[];
  defaultToRoom: boolean;
  expressPct: number;
}) {
  const t = useTranslations("services");
  const money = useMoney(currency);
  const r = useRun();
  const [walkIn, setWalkIn] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [express, setExpress] = useState(false);
  const [settle, setSettle] = useState<string>(defaultToRoom ? "room" : "pending");
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const active = items.filter((i) => i.active);
  const base = active.reduce((s, i) => s + (qty[i.id] ?? 0) * i.priceCents, 0);
  const total = base + (kind === "laundry" && express ? Math.round((base * expressPct) / 100) : 0);
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const room = rooms.find((x) => x.roomId === roomId);
  const settles = walkIn ? ["cash", "card", "pos", "pending"] : ["room", "cash", "card", "pos", "pending"];
  const add = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(999, (q[id] ?? 0) + d)) }));
  if (!active.length) return <Empty>{t("items.emptyForForm")}</Empty>;
  return (
    <form
      className="grid gap-5 lg:grid-cols-[1fr_20rem]"
      action={(fd) =>
        r.run(async () => {
          const res = await createServiceTicketAction(rid, kind, {
            roomId: walkIn ? null : roomId || null,
            guestName: String(fd.get("guestName") ?? "") || undefined,
            express,
            note: String(fd.get("note") ?? "") || undefined,
            lines,
            settle: (settle === "room" && walkIn ? "pending" : settle) as "room",
          });
          if (res?.ok && res.data) {
            setDoneMsg(t("form.done", { n: res.data.number }));
            setQty({});
            setExpress(false);
          }
          return res;
        })
      }
    >
      <div className="space-y-4">
        <div className={card}>
          <div className="seg mb-4">
            <button
              type="button"
              className="seg-item"
              aria-current={!walkIn ? "true" : undefined}
              onClick={() => setWalkIn(false)}
            >
              {t("form.room")}
            </button>
            <button type="button" className="seg-item" aria-current={walkIn ? "true" : undefined} onClick={() => setWalkIn(true)}>
              {t("form.walkIn")}
            </button>
          </div>
          {walkIn ? (
            <label>
              <Label>{t("form.guestName")}</Label>
              <input name="guestName" required maxLength={120} className={inputCls} />
            </label>
          ) : (
            <label>
              <Label>{t("form.pickRoom")}</Label>
              <select
                required
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className={inputCls}
              >
                <option value="">—</option>
                {rooms.map((x) => (
                  <option key={x.roomId} value={x.roomId}>
                    {x.room} — {x.guest}
                  </option>
                ))}
              </select>
              {!rooms.length ? <p className="mt-1 text-xs text-fg-muted">{t("form.noRooms")}</p> : null}
            </label>
          )}
        </div>
        <div className={card}>
          <h3 className="mb-3 font-bold">{t("form.items")}</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((i) => {
              const q = qty[i.id] ?? 0;
              return (
                <li
                  key={i.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2",
                    q ? "border-brand-300 bg-brand-50" : "border-border",
                  )}
                >
                  <button type="button" onClick={() => add(i.id, 1)} className="min-w-0 flex-1 text-start">
                    <span className="block truncate text-sm font-semibold">{i.name}</span>
                    <span className="text-xs text-fg-muted tabular-nums">{money(i.priceCents)}</span>
                  </button>
                  {q ? (
                    <>
                      <button
                        type="button"
                        aria-label="-"
                        onClick={() => add(i.id, -1)}
                        className="grid size-8 place-items-center rounded-full bg-surface ring-1 ring-border"
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-6 text-center font-bold tabular-nums">{q}</span>
                    </>
                  ) : null}
                  <button
                    type="button"
                    aria-label="+"
                    onClick={() => add(i.id, 1)}
                    className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                  >
                    <Plus className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className={cn(card, "h-fit space-y-4 lg:sticky lg:top-20")}>
        {kind === "laundry" ? (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={express}
              onChange={(e) => setExpress(e.target.checked)}
              className="size-4"
            />
            {t("form.express", { pct: expressPct })}
          </label>
        ) : null}
        <label>
          <Label>{t("form.note")}</Label>
          <textarea name="note" maxLength={500} rows={2} className={cn(inputCls, "h-auto py-2")} />
        </label>
        <div>
          <Label>{t("form.settle")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {settles.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSettle(s)}
                aria-pressed={settle === s}
                disabled={s === "room" && !room}
                className={cn(
                  "h-9 rounded-full px-3 text-sm font-semibold ring-1 disabled:opacity-40",
                  settle === s ? "bg-accent text-accent-fg ring-transparent" : "bg-surface ring-border",
                )}
              >
                {t(`settle.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <p className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-fg-muted">{t("form.total")}</span>
          <span className="text-xl font-bold tabular-nums">{money(total)}</span>
        </p>
        <FormError error={r.error} />
        {doneMsg ? (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">
            <Check className="size-4" />
            {doneMsg}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full"
          disabled={r.pending || !lines.length || (!walkIn && !roomId)}
        >
          {t("form.submit")}
        </Button>
      </div>
    </form>
  );
}

// ─── Tickets (list, workflow, cash desk) ─────────────────────────────────────

export type Ticket = {
  id: string;
  number: number;
  room: string | null;
  stayId: string | null;
  guestName: string | null;
  status: string;
  express: boolean;
  note: string | null;
  totalCents: number;
  settlement: string;
  dueAt: string | null;
  createdAt: string;
  lines: { name: string; quantity: number; amountCents: number; extra: boolean }[];
};
const NEXT: Record<string, string> = { received: "in_progress", in_progress: "ready", ready: "delivered" };

export function TicketList({
  rid,
  kind,
  currency,
  tickets,
  timeZone,
  canAdjust,
}: {
  rid: string;
  kind: "laundry" | "damage";
  currency: string;
  tickets: Ticket[];
  timeZone: string;
  canAdjust: boolean;
}) {
  const t = useTranslations("services");
  const money = useMoney(currency);
  const locale = useLocale();
  const time = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  if (!tickets.length) return <Empty>{t("list.empty")}</Empty>;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {tickets.map((x) => {
        const cancelled = x.status === "cancelled";
        const late =
          x.dueAt &&
          !cancelled &&
          x.status !== "delivered" &&
          x.status !== "ready" &&
          new Date(x.dueAt) < new Date();
        return (
          <li key={x.id} className={cn(card, "flex flex-col gap-3 p-4", cancelled && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">
                  <span className="text-fg-muted tabular-nums">#{x.number}</span>{" "}
                  {x.room ? t("list.room", { room: x.room }) : t("form.walkIn")}
                </p>
                <p className="truncate text-sm text-fg-muted">{x.guestName ?? "—"}</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  cancelled
                    ? "bg-surface-3 text-fg-muted"
                    : x.status === "ready"
                      ? "bg-success-soft text-success"
                      : x.status === "delivered"
                        ? "bg-surface-2 text-fg-muted"
                        : "bg-brand-50 text-brand-700",
                )}
              >
                {t(`status.${x.status}`)}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {x.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {l.extra ? t("express") : l.name}
                    {l.quantity > 1 ? <span className="text-fg-muted"> ×{l.quantity}</span> : null}
                  </span>
                  <span className="tabular-nums">{money(l.amountCents)}</span>
                </li>
              ))}
            </ul>
            {x.note ? <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">{x.note}</p> : null}
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-fg-muted">
                {time.format(new Date(x.createdAt))}
                {x.dueAt && kind === "laundry" && !cancelled ? (
                  <span className={cn("ms-2", late && "font-bold text-danger")}>
                    · {t("list.due", { at: time.format(new Date(x.dueAt)) })}
                  </span>
                ) : null}
              </span>
              <span className="font-bold tabular-nums">{money(x.totalCents)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  x.settlement === "pending" ? "bg-warning-soft text-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                {t(`settle.${x.settlement}`)}
              </span>
              {!cancelled && kind === "laundry" && NEXT[x.status] ? (
                <RunButton
                  size="sm"
                  variant="primary"
                  run={() => setServiceTicketStatusAction(rid, x.id, NEXT[x.status]!)}
                >
                  {t(`next.${NEXT[x.status]}`)}
                </RunButton>
              ) : null}
            </div>
            {!cancelled && x.settlement === "pending" ? (
              <div className="flex flex-wrap gap-1.5">
                {x.stayId ? (
                  <RunButton size="sm" run={() => settleServiceTicketAction(rid, x.id, "room")}>
                    {t("settle.room")}
                  </RunButton>
                ) : null}
                {(["cash", "card", "pos"] as const).map((m) => (
                  <RunButton key={m} size="sm" run={() => settleServiceTicketAction(rid, x.id, m)}>
                    {t(`settle.${m}`)}
                  </RunButton>
                ))}
                {kind === "damage" && canAdjust ? (
                  <RunButton
                    size="sm"
                    variant="ghost"
                    confirm={t("list.confirmWaive")}
                    run={() => settleServiceTicketAction(rid, x.id, "waived")}
                  >
                    {t("settle.waived")}
                  </RunButton>
                ) : null}
              </div>
            ) : null}
            {!cancelled && canAdjust && x.settlement !== "room" ? (
              <RunButton
                size="sm"
                variant="ghost"
                className="text-danger"
                confirm={t("list.confirmCancel")}
                run={() => cancelServiceTicketAction(rid, x.id)}
              >
                <X className="size-4" />
                {t("list.cancel")}
              </RunButton>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CashTotals({
  by,
  currency,
}: {
  by: Record<string, { count: number; cents: number }>;
  currency: string;
}) {
  const t = useTranslations("services");
  const money = useMoney(currency);
  const keys = ["room", "cash", "card", "pos", "pending", "waived"].filter((k) => by[k]);
  if (!keys.length) return null;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {keys.map((k) => (
        <div key={k} className={cn(card, "p-4")}>
          <p className="text-xs text-fg-muted">{t(`settle.${k}`)}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{money(by[k]!.cents)}</p>
          <p className="text-xs text-fg-subtle">{t("count", { n: by[k]!.count })}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Settings (generic) ──────────────────────────────────────────────────────

export type SettingField =
  | { key: string; type: "bool" }
  | { key: string; type: "int"; min: number; max: number; suffix?: string }
  | { key: string; type: "text"; max: number; multiline?: boolean }
  | { key: string; type: "select"; options: { value: string; label: string }[] };

/** A department's settings as a simple form; labels come from `{ns}.settings.{key}`. */
export function SettingsForm({
  rid,
  section,
  ns,
  fields,
  values,
  extra,
}: {
  rid: string;
  section: "laundry" | "damage" | "internet" | "tv" | "housekeeping" | "engineering";
  ns: string;
  fields: SettingField[];
  values: Record<string, unknown>;
  /** Keys kept as they are (edited elsewhere). */
  extra?: Record<string, unknown>;
}) {
  const t = useTranslations(ns as "services");
  const ts = useTranslations("services");
  const r = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className={cn(card, "grid max-w-2xl gap-4")}
      action={(fd) => {
        const out: Record<string, unknown> = { ...values, ...extra };
        for (const f of fields) {
          if (f.type === "bool") out[f.key] = fd.get(f.key) === "on";
          else if (f.type === "int") out[f.key] = Number(fd.get(f.key) || 0);
          else out[f.key] = String(fd.get(f.key) ?? "") || (f.type === "select" ? null : "");
        }
        setSaved(false);
        r.run(
          () => saveServicesSettingsAction(rid, section, out),
          () => setSaved(true),
        );
      }}
    >
      {fields.map((f) =>
        f.type === "bool" ? (
          <label key={f.key} className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name={f.key} defaultChecked={!!values[f.key]} className="mt-0.5 size-4" />
            <span>
              <span className="block font-semibold">{t(`settings.${f.key}` as never)}</span>
              {t.has(`settings.${f.key}Hint` as never) ? (
                <span className="text-fg-muted">{t(`settings.${f.key}Hint` as never)}</span>
              ) : null}
            </span>
          </label>
        ) : (
          <label key={f.key}>
            <Label
              hint={t.has(`settings.${f.key}Hint` as never) ? t(`settings.${f.key}Hint` as never) : undefined}
            >
              {t(`settings.${f.key}` as never)}
            </Label>
            {f.type === "int" ? (
              <input
                type="number"
                name={f.key}
                min={f.min}
                max={f.max}
                defaultValue={Number(values[f.key] ?? 0)}
                className={inputCls}
              />
            ) : f.type === "select" ? (
              <select name={f.key} defaultValue={String(values[f.key] ?? "")} className={inputCls}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.multiline ? (
              <textarea
                name={f.key}
                maxLength={f.max}
                rows={3}
                defaultValue={String(values[f.key] ?? "")}
                className={cn(inputCls, "h-auto py-2")}
              />
            ) : (
              <input
                name={f.key}
                maxLength={f.max}
                defaultValue={String(values[f.key] ?? "")}
                className={inputCls}
              />
            )}
          </label>
        ),
      )}
      <FormError error={r.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={r.pending}>
          {ts("save")}
        </Button>
        {saved ? <span className="text-sm font-semibold text-success">{ts("saved")}</span> : null}
      </div>
    </form>
  );
}
