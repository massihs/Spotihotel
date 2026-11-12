"use client";

import { Copy, KeyRound, MessageSquare, Pencil, Plus, Power, Trash2, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { DateInput } from "@/components/ui/date-input";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import { centsToInput } from "@/lib/money";
import {
  addLogEntryAction,
  closeLogEntryAction,
  createInternetAccountAction,
  deleteEquipmentAction,
  deleteInternetAccountAction,
  deleteInternetProfileAction,
  markServicedAction,
  runHkOperationAction,
  saveEquipmentAction,
  saveInternetProfileAction,
  saveMinibarSettingsAction,
  saveServicesSettingsAction,
  sendTvMessageAction,
  setInternetAccountStatusAction,
  setRoomTvAction,
  updateInternetAccountAction,
} from "@/app/[locale]/dashboard/[restaurantId]/services-actions";
import { chargeMinibarAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { Empty, FormError, Label, RunButton, inputCls, useDay } from "@/components/pms/kit";
import { card, toCents, type Room } from "./services-ui";

const iconBtn = "grid size-8 place-items-center rounded-lg hover:bg-surface-2";

function useStamp(timeZone: string) {
  const locale = useLocale();
  const f = new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  return (iso: string | null) => (iso ? f.format(new Date(iso)) : "—");
}

// ─── Internet ────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  name: string;
  downKbps: number;
  upKbps: number;
  quotaMb: number | null;
  days: number | null;
  devices: number;
  priceCents: number;
  active: boolean;
};

export function ProfilesPanel({
  rid,
  currency,
  profiles,
  canManage,
}: {
  rid: string;
  currency: string;
  profiles: Profile[];
  canManage: boolean;
}) {
  const t = useTranslations("internet");
  const money = useMoney(currency);
  const locale = useLocale();
  const [edit, setEdit] = useState<Profile | "new" | null>(null);
  const r = useRun();
  const speed = (k: number) => (k >= 1024 ? `${Math.round(k / 102.4) / 10} Mb/s` : `${k} kb/s`);
  return (
    <div className="space-y-4">
      {canManage ? (
        <Button size="sm" onClick={() => setEdit("new")}>
          <Plus className="size-4" />
          {t("profiles.add")}
        </Button>
      ) : null}
      {!profiles.length ? <Empty>{t("profiles.empty")}</Empty> : null}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {profiles.map((p) => (
          <li key={p.id} className={cn(card, "space-y-2", !p.active && "opacity-60")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-xl">{p.name}</p>
              <p className="font-bold tabular-nums">
                {p.priceCents ? money(p.priceCents) : t("profiles.free")}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-fg-muted">{t("profiles.down")}</dt>
                <dd dir="ltr" className="text-start">
                  {p.downKbps ? speed(p.downKbps) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">{t("profiles.up")}</dt>
                <dd dir="ltr" className="text-start">
                  {p.upKbps ? speed(p.upKbps) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">{t("profiles.quota")}</dt>
                <dd>
                  {p.quotaMb
                    ? `${(p.quotaMb / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`
                    : t("profiles.unlimited")}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">{t("profiles.days")}</dt>
                <dd>{p.days ? t("profiles.daysN", { n: p.days }) : t("profiles.untilCheckout")}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-muted">{t("profiles.devices")}</dt>
                <dd>{p.devices}</dd>
              </div>
            </dl>
            {canManage ? (
              <div className="flex gap-1 border-t border-border pt-2">
                <button type="button" className={iconBtn} aria-label={t("edit")} onClick={() => setEdit(p)}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  className={cn(iconBtn, "text-danger")}
                  aria-label={t("delete")}
                  onClick={() =>
                    window.confirm(t("confirmDelete")) && r.run(() => deleteInternetProfileAction(rid, p.id))
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <FormError error={r.error} />
      {edit ? (
        <Sheet title={edit === "new" ? t("profiles.add") : edit.name} onClose={() => setEdit(null)}>
          <ProfileForm
            rid={rid}
            currency={currency}
            p={edit === "new" ? null : edit}
            locale={locale}
            onDone={() => setEdit(null)}
          />
        </Sheet>
      ) : null}
    </div>
  );
}

function ProfileForm({
  rid,
  currency,
  p,
  locale,
  onDone,
}: {
  rid: string;
  currency: string;
  p: Profile | null;
  locale: string;
  onDone: () => void;
}) {
  const t = useTranslations("internet");
  const r = useRun();
  const n = (fd: FormData, k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
  return (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveInternetProfileAction(rid, p?.id ?? null, {
              name: String(fd.get("name")),
              downKbps: Math.round((n(fd, "down") ?? 0) * 1024),
              upKbps: Math.round((n(fd, "up") ?? 0) * 1024),
              quotaMb: n(fd, "quota") ? Math.round(n(fd, "quota")! * 1024) : null,
              days: n(fd, "days"),
              devices: n(fd, "devices") ?? 1,
              priceCents: toCents(fd.get("price"), currency),
              active: fd.get("active") === "on",
            }),
          onDone,
        )
      }
    >
      <label className="col-span-2">
        <Label>{t("profiles.name")}</Label>
        <input name="name" required maxLength={60} defaultValue={p?.name} className={inputCls} />
      </label>
      <label>
        <Label hint="Mb/s">{t("profiles.down")}</Label>
        <input
          name="down"
          type="number"
          step="0.1"
          min={0}
          defaultValue={p ? p.downKbps / 1024 : 10}
          className={inputCls}
        />
      </label>
      <label>
        <Label hint="Mb/s">{t("profiles.up")}</Label>
        <input
          name="up"
          type="number"
          step="0.1"
          min={0}
          defaultValue={p ? p.upKbps / 1024 : 2}
          className={inputCls}
        />
      </label>
      <label>
        <Label hint="GB">{t("profiles.quota")}</Label>
        <input
          name="quota"
          type="number"
          step="0.5"
          min={0}
          defaultValue={p?.quotaMb ? p.quotaMb / 1024 : ""}
          placeholder={t("profiles.unlimited")}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("profiles.days")}</Label>
        <input
          name="days"
          type="number"
          min={1}
          max={365}
          defaultValue={p?.days ?? ""}
          placeholder={t("profiles.untilCheckout")}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("profiles.devices")}</Label>
        <input
          name="devices"
          type="number"
          min={1}
          max={20}
          defaultValue={p?.devices ?? 2}
          className={inputCls}
        />
      </label>
      <MoneyField
        name="price"
        label={t("profiles.price")}
        currency={currency}
        defaultValue={centsToInput(p?.priceCents ?? 0, locale, currency)}
      />
      <label className="col-span-2 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="active" defaultChecked={p?.active ?? true} className="size-4" />
        {t("profiles.active")}
      </label>
      <div className="col-span-2">
        <FormError error={r.error} />
      </div>
      <Button type="submit" className="col-span-2" disabled={r.pending}>
        {t("save")}
      </Button>
    </form>
  );
}

type Account = {
  id: string;
  username: string;
  password: string;
  status: string;
  validUntil: string | null;
  usedMb: number;
  guestName: string | null;
  room: string | null;
  profile: string | null;
  quotaMb: number | null;
};

export function AccountsPanel({
  rid,
  accounts,
  profiles,
  rooms,
  timeZone,
  canAdjust,
}: {
  rid: string;
  accounts: Account[];
  profiles: { id: string; name: string }[];
  rooms: Room[];
  timeZone: string;
  canAdjust: boolean;
}) {
  const t = useTranslations("internet");
  const stamp = useStamp(timeZone);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);
  const r = useRun();
  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => setAdding(true)} disabled={!profiles.length}>
        <Plus className="size-4" />
        {t("accounts.add")}
      </Button>
      {!profiles.length ? <p className="text-sm text-fg-muted">{t("accounts.needProfile")}</p> : null}
      {created ? (
        <div className={cn(card, "flex flex-wrap items-center gap-4 border-success bg-success-soft")}>
          <KeyRound className="size-5 text-success" />
          <p className="text-sm font-semibold">{t("accounts.created")}</p>
          <code dir="ltr" className="latin-digits rounded-lg bg-surface px-3 py-1 font-bold">
            {created.username}
          </code>
          <code dir="ltr" className="latin-digits rounded-lg bg-surface px-3 py-1 font-bold">
            {created.password}
          </code>
        </div>
      ) : null}
      {!accounts.length ? <Empty>{t("accounts.empty")}</Empty> : null}
      {accounts.length ? (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-xs text-fg-muted">
              <tr>
                {["username", "password", "room", "guest", "profile", "validUntil", "status", ""].map((k) => (
                  <th key={k} className="px-3 py-2.5 text-start font-semibold">
                    {k ? t(`accounts.${k}`) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <code dir="ltr" className="latin-digits font-bold">
                      {a.username}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <code dir="ltr" className="latin-digits">
                        {a.password}
                      </code>
                      <button
                        type="button"
                        className={iconBtn}
                        aria-label={t("copy")}
                        onClick={() => navigator.clipboard?.writeText(`${a.username} / ${a.password}`)}
                      >
                        <Copy className="size-3.5" />
                      </button>
                    </span>
                  </td>
                  <td className="px-3 py-2">{a.room ?? "—"}</td>
                  <td className="px-3 py-2">{a.guestName ?? "—"}</td>
                  <td className="px-3 py-2">{a.profile ?? "—"}</td>
                  <td className="px-3 py-2">{stamp(a.validUntil)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        a.status === "active" ? "bg-success-soft text-success" : "bg-surface-2 text-fg-muted",
                      )}
                    >
                      {t(`status.${a.status}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      <RunButton
                        size="sm"
                        variant="ghost"
                        run={() =>
                          setInternetAccountStatusAction(
                            rid,
                            a.id,
                            a.status === "active" ? "disabled" : "active",
                          )
                        }
                      >
                        <Power className="size-3.5" />
                        {a.status === "active" ? t("accounts.disable") : t("accounts.enable")}
                      </RunButton>
                      <RunButton
                        size="sm"
                        variant="ghost"
                        run={() => updateInternetAccountAction(rid, a.id, { extendDays: 1 })}
                      >
                        {t("accounts.extend")}
                      </RunButton>
                      <RunButton
                        size="sm"
                        variant="ghost"
                        run={() => updateInternetAccountAction(rid, a.id, { resetPassword: true })}
                      >
                        {t("accounts.reset")}
                      </RunButton>
                      {canAdjust ? (
                        <RunButton
                          size="sm"
                          variant="ghost"
                          className="text-danger"
                          confirm={t("confirmDelete")}
                          run={() => deleteInternetAccountAction(rid, a.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </RunButton>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <FormError error={r.error} />
      {adding ? (
        <Sheet title={t("accounts.add")} onClose={() => setAdding(false)}>
          <form
            className="grid gap-4"
            action={(fd) =>
              r.run(async () => {
                const res = await createInternetAccountAction(rid, {
                  profileId: String(fd.get("profileId")),
                  roomId: String(fd.get("roomId") ?? "") || null,
                  guestName: String(fd.get("guestName") ?? "") || undefined,
                  username: String(fd.get("username") ?? "") || undefined,
                  password: String(fd.get("password") ?? "") || undefined,
                  charge: fd.get("charge") === "on",
                });
                if (res?.ok && res.data) {
                  setCreated(res.data);
                  setAdding(false);
                }
                return res;
              })
            }
          >
            <label>
              <Label>{t("accounts.profile")}</Label>
              <select name="profileId" required className={inputCls}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>{t("accounts.room")}</Label>
              <select name="roomId" className={inputCls}>
                <option value="">—</option>
                {rooms.map((x) => (
                  <option key={x.roomId} value={x.roomId}>
                    {x.room} — {x.guest}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Label>{t("accounts.guest")}</Label>
              <input name="guestName" maxLength={120} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <Label hint={t("accounts.auto")}>{t("accounts.username")}</Label>
                <input
                  name="username"
                  dir="ltr"
                  pattern="[A-Za-z0-9._\-]*"
                  maxLength={40}
                  className={inputCls}
                />
              </label>
              <label>
                <Label hint={t("accounts.auto")}>{t("accounts.password")}</Label>
                <input name="password" dir="ltr" maxLength={40} className={inputCls} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" name="charge" defaultChecked className="size-4" />
              {t("accounts.charge")}
            </label>
            <FormError error={r.error} />
            <Button type="submit" disabled={r.pending}>
              {t("accounts.add")}
            </Button>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}

// ─── TV ──────────────────────────────────────────────────────────────────────

type TvRoom = {
  roomId: string;
  room: string;
  active: boolean;
  package: string | null;
  message: string | null;
  guest: string | null;
};

export function TvBoard({ rid, rooms, packages }: { rid: string; rooms: TvRoom[]; packages: string[] }) {
  const t = useTranslations("tv");
  const r = useRun();
  const [msgFor, setMsgFor] = useState<TvRoom | "all" | null>(null);
  const on = rooms.filter((x) => x.active).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-fg-muted">{t("board.count", { on, total: rooms.length })}</p>
        <Button size="sm" variant="secondary" onClick={() => setMsgFor("all")}>
          <MessageSquare className="size-4" />
          {t("board.sendAll")}
        </Button>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {rooms.map((x) => (
          <li
            key={x.roomId}
            className={cn(
              "rounded-xl border p-3",
              x.active ? "border-brand-300 bg-brand-50" : "border-border bg-surface",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold tabular-nums">{x.room}</p>
              <button
                type="button"
                aria-pressed={x.active}
                aria-label={x.active ? t("board.off") : t("board.on")}
                onClick={() =>
                  r.run(() => setRoomTvAction(rid, x.roomId, { active: !x.active, package: x.package }))
                }
                className={cn(
                  "grid size-8 place-items-center rounded-full",
                  x.active ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-muted",
                )}
              >
                <Power className="size-4" />
              </button>
            </div>
            <p className="mt-1 truncate text-xs text-fg-muted">{x.guest ?? t("board.vacant")}</p>
            {packages.length ? (
              <select
                value={x.package ?? ""}
                onChange={(e) =>
                  r.run(() =>
                    setRoomTvAction(rid, x.roomId, { active: x.active, package: e.target.value || null }),
                  )
                }
                className="mt-2 h-8 w-full rounded-lg border border-border bg-surface px-2 text-xs"
                aria-label={t("board.package")}
              >
                <option value="">{t("board.noPackage")}</option>
                {packages.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => setMsgFor(x)}
              className="mt-2 flex w-full items-center gap-1 truncate text-start text-xs text-accent-text"
            >
              <MessageSquare className="size-3.5 shrink-0" />
              <span className="truncate">{x.message ?? t("board.message")}</span>
            </button>
          </li>
        ))}
      </ul>
      <FormError error={r.error} />
      {msgFor ? (
        <Sheet
          title={msgFor === "all" ? t("board.sendAll") : t("board.messageFor", { room: msgFor.room })}
          onClose={() => setMsgFor(null)}
        >
          <form
            className="grid gap-4"
            action={(fd) =>
              r.run(
                () =>
                  sendTvMessageAction(rid, msgFor === "all" ? null : msgFor.roomId, String(fd.get("text"))),
                () => setMsgFor(null),
              )
            }
          >
            <textarea
              name="text"
              required
              maxLength={300}
              rows={4}
              defaultValue={msgFor === "all" ? "" : (msgFor.message ?? "")}
              className={cn(inputCls, "h-auto py-2")}
            />
            <FormError error={r.error} />
            <Button type="submit" disabled={r.pending}>
              {t("board.send")}
            </Button>
          </form>
        </Sheet>
      ) : null}
    </div>
  );
}

export function TvPackages({
  rid,
  currency,
  values,
}: {
  rid: string;
  currency: string;
  values: { packages: { name: string; priceCents: number }[] } & Record<string, unknown>;
}) {
  const t = useTranslations("tv");
  const money = useMoney(currency);
  const locale = useLocale();
  const r = useRun();
  const save = (packages: { name: string; priceCents: number }[]) =>
    r.run(() => saveServicesSettingsAction(rid, "tv", { ...values, packages }));
  return (
    <div className={cn(card, "max-w-2xl space-y-3")}>
      <h3 className="font-bold">{t("settings.packages")}</h3>
      <ul className="divide-y divide-border">
        {values.packages.map((p, i) => (
          <li key={p.name} className="flex items-center gap-3 py-2">
            <span className="flex-1 font-semibold">{p.name}</span>
            <span className="tabular-nums">{p.priceCents ? money(p.priceCents) : "—"}</span>
            <button
              type="button"
              className={cn(iconBtn, "text-danger")}
              aria-label={t("delete")}
              onClick={() => save(values.packages.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[1fr_10rem_auto] items-end gap-2"
        action={(fd) =>
          save([
            ...values.packages,
            { name: String(fd.get("name")), priceCents: toCents(fd.get("price"), currency) },
          ])
        }
      >
        <label>
          <Label>{t("settings.packageName")}</Label>
          <input name="name" required maxLength={60} className={inputCls} />
        </label>
        <MoneyField
          name="price"
          label={t("settings.price")}
          currency={currency}
          defaultValue={centsToInput(0, locale, currency)}
        />
        <Button type="submit" disabled={r.pending}>
          <Plus className="size-4" />
          {t("settings.addPackage")}
        </Button>
      </form>
      <FormError error={r.error} />
    </div>
  );
}

// ─── Engineering ─────────────────────────────────────────────────────────────

type Equip = {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  roomId: string | null;
  room: string | null;
  serial: string | null;
  intervalDays: number | null;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
  note: string | null;
  active: boolean;
};

export function EquipmentPanel({
  rid,
  list,
  categories,
  rooms,
  canManage,
  today,
}: {
  rid: string;
  list: Equip[];
  categories: string[];
  rooms: { id: string; label: string }[];
  canManage: boolean;
  today: string;
}) {
  const t = useTranslations("engineering");
  const day = useDay();
  const [edit, setEdit] = useState<Equip | "new" | null>(null);
  const r = useRun();
  return (
    <div className="space-y-4">
      {canManage ? (
        <Button size="sm" onClick={() => setEdit("new")}>
          <Plus className="size-4" />
          {t("equipment.add")}
        </Button>
      ) : null}
      {!list.length ? (
        <Empty>{t("equipment.empty")}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2 text-xs text-fg-muted">
              <tr>
                {["name", "category", "location", "serial", "interval", "last", "next", ""].map((k) => (
                  <th key={k} className="px-3 py-2.5 text-start font-semibold">
                    {k ? t(`equipment.${k}`) : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className={cn("border-t border-border", !e.active && "opacity-60")}>
                  <td className="px-3 py-2 font-semibold">{e.name}</td>
                  <td className="px-3 py-2">{e.category ?? "—"}</td>
                  <td className="px-3 py-2">
                    {e.room ? t("equipment.roomN", { room: e.room }) : (e.location ?? "—")}
                  </td>
                  <td className="px-3 py-2">
                    <span dir="ltr" className="latin-digits">
                      {e.serial ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {e.intervalDays ? t("equipment.days", { n: e.intervalDays }) : "—"}
                  </td>
                  <td className="px-3 py-2">{e.lastServiceOn ? day(e.lastServiceOn) : "—"}</td>
                  <td
                    className={cn(
                      "px-3 py-2",
                      e.nextServiceOn && e.nextServiceOn <= today && "font-bold text-danger",
                    )}
                  >
                    {e.nextServiceOn ? day(e.nextServiceOn) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <span className="flex gap-1">
                        <button
                          type="button"
                          className={iconBtn}
                          aria-label={t("edit")}
                          onClick={() => setEdit(e)}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          className={cn(iconBtn, "text-danger")}
                          aria-label={t("delete")}
                          onClick={() =>
                            window.confirm(t("confirmDelete")) &&
                            r.run(() => deleteEquipmentAction(rid, e.id))
                          }
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <FormError error={r.error} />
      {edit ? (
        <Sheet title={edit === "new" ? t("equipment.add") : edit.name} onClose={() => setEdit(null)}>
          <EquipForm
            rid={rid}
            e={edit === "new" ? null : edit}
            categories={categories}
            rooms={rooms}
            onDone={() => setEdit(null)}
          />
        </Sheet>
      ) : null}
    </div>
  );
}

function EquipForm({
  rid,
  e,
  categories,
  rooms,
  onDone,
}: {
  rid: string;
  e: Equip | null;
  categories: string[];
  rooms: { id: string; label: string }[];
  onDone: () => void;
}) {
  const t = useTranslations("engineering");
  const r = useRun();
  const [next, setNext] = useState(e?.nextServiceOn ?? "");
  return (
    <form
      className="grid grid-cols-2 gap-4"
      action={(fd) =>
        r.run(
          () =>
            saveEquipmentAction(rid, e?.id ?? null, {
              name: String(fd.get("name")),
              category: String(fd.get("category") ?? ""),
              location: String(fd.get("location") ?? ""),
              roomId: String(fd.get("roomId") ?? "") || null,
              serial: String(fd.get("serial") ?? ""),
              intervalDays: fd.get("interval") ? Number(fd.get("interval")) : null,
              nextServiceOn: next || null,
              note: String(fd.get("note") ?? ""),
              active: fd.get("active") === "on",
            }),
          onDone,
        )
      }
    >
      <label className="col-span-2">
        <Label>{t("equipment.name")}</Label>
        <input name="name" required maxLength={80} defaultValue={e?.name} className={inputCls} />
      </label>
      <label>
        <Label>{t("equipment.category")}</Label>
        <select name="category" defaultValue={e?.category ?? ""} className={inputCls}>
          <option value="">—</option>
          {[...new Set([...categories, ...(e?.category ? [e.category] : [])])].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("equipment.serial")}</Label>
        <input name="serial" dir="ltr" maxLength={60} defaultValue={e?.serial ?? ""} className={inputCls} />
      </label>
      <label>
        <Label>{t("equipment.room")}</Label>
        <select name="roomId" defaultValue={e?.roomId ?? ""} className={inputCls}>
          <option value="">—</option>
          {rooms.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("equipment.location")}</Label>
        <input name="location" maxLength={80} defaultValue={e?.location ?? ""} className={inputCls} />
      </label>
      <label>
        <Label hint={t("equipment.daysUnit")}>{t("equipment.interval")}</Label>
        <input
          name="interval"
          type="number"
          min={1}
          max={3650}
          defaultValue={e?.intervalDays ?? ""}
          className={inputCls}
        />
      </label>
      <div>
        <Label>{t("equipment.next")}</Label>
        <DateInput value={next} onChange={setNext} aria-label={t("equipment.next")} />
      </div>
      <label className="col-span-2">
        <Label>{t("equipment.note")}</Label>
        <textarea
          name="note"
          maxLength={1000}
          rows={2}
          defaultValue={e?.note ?? ""}
          className={cn(inputCls, "h-auto py-2")}
        />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="active" defaultChecked={e?.active ?? true} className="size-4" />
        {t("equipment.active")}
      </label>
      <div className="col-span-2">
        <FormError error={r.error} />
      </div>
      <Button type="submit" className="col-span-2" disabled={r.pending}>
        {t("save")}
      </Button>
    </form>
  );
}

export function PreventiveList({ rid, list, today }: { rid: string; list: Equip[]; today: string }) {
  const t = useTranslations("engineering");
  const day = useDay();
  const due = list
    .filter((e) => e.active && e.nextServiceOn)
    .sort((a, b) => a.nextServiceOn!.localeCompare(b.nextServiceOn!));
  if (!due.length) return <Empty>{t("preventive.none")}</Empty>;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {due.map((e) => {
        const overdue = e.nextServiceOn! < today;
        const isToday = e.nextServiceOn === today;
        return (
          <li key={e.id} className={cn(card, "flex flex-col gap-2 p-4", overdue && "border-danger")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold">{e.name}</p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold",
                  overdue
                    ? "bg-danger-soft text-danger"
                    : isToday
                      ? "bg-warning-soft"
                      : "bg-surface-2 text-fg-muted",
                )}
              >
                {overdue ? t("preventive.overdue") : isToday ? t("preventive.today") : day(e.nextServiceOn!)}
              </span>
            </div>
            <p className="text-sm text-fg-muted">
              {[e.category, e.room ? t("equipment.roomN", { room: e.room }) : e.location]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            <p className="text-xs text-fg-subtle">
              {e.lastServiceOn ? t("preventive.last", { day: day(e.lastServiceOn) }) : t("preventive.never")}
              {e.intervalDays ? ` · ${t("equipment.days", { n: e.intervalDays })}` : ""}
            </p>
            <RunButton size="sm" variant="primary" run={() => markServicedAction(rid, e.id)}>
              <Wrench className="size-4" />
              {t("preventive.serviced")}
            </RunButton>
          </li>
        );
      })}
    </ul>
  );
}

export function CategoriesForm({ rid, values }: { rid: string; values: { categories: string[] } }) {
  const t = useTranslations("engineering");
  const r = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className={cn(card, "grid max-w-2xl gap-3")}
      action={(fd) =>
        r.run(
          () =>
            saveServicesSettingsAction(rid, "engineering", {
              categories: String(fd.get("c"))
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean),
            }),
          () => setSaved(true),
        )
      }
    >
      <label>
        <Label hint={t("settings.categoriesHint")}>{t("settings.categories")}</Label>
        <textarea
          name="c"
          rows={8}
          defaultValue={values.categories.join("\n")}
          className={cn(inputCls, "h-auto py-2")}
        />
      </label>
      <FormError error={r.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={r.pending}>
          {t("save")}
        </Button>
        {saved ? <span className="text-sm font-semibold text-success">{t("saved")}</span> : null}
      </div>
    </form>
  );
}

// ─── Housekeeping extras ─────────────────────────────────────────────────────

type LogRow = {
  id: string;
  businessDate: string;
  category: string;
  text: string;
  status: string;
  room: string | null;
  by: string | null;
  createdAt: string;
};

export function Logbook({
  rid,
  rows,
  rooms,
  timeZone,
}: {
  rid: string;
  rows: LogRow[];
  rooms: { id: string; label: string }[];
  timeZone: string;
}) {
  const t = useTranslations("hkx");
  const stamp = useStamp(timeZone);
  const r = useRun();
  const [k, setK] = useState(0);
  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <form
        key={k}
        className={cn(card, "h-fit space-y-3")}
        action={(fd) =>
          r.run(
            () =>
              addLogEntryAction(rid, {
                category: String(fd.get("category")) as "note",
                roomId: String(fd.get("roomId") ?? "") || null,
                text: String(fd.get("text")),
              }),
            () => setK((x) => x + 1),
          )
        }
      >
        <h3 className="font-bold">{t("log.add")}</h3>
        <label>
          <Label>{t("log.category")}</Label>
          <select name="category" className={inputCls}>
            {["note", "lost_found", "incident", "request"].map((c) => (
              <option key={c} value={c}>
                {t(`cat.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>{t("log.room")}</Label>
          <select name="roomId" className={inputCls}>
            <option value="">—</option>
            {rooms.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <Label>{t("log.text")}</Label>
          <textarea name="text" required maxLength={2000} rows={4} className={cn(inputCls, "h-auto py-2")} />
        </label>
        <FormError error={r.error} />
        <Button type="submit" className="w-full" disabled={r.pending}>
          {t("log.save")}
        </Button>
      </form>
      {!rows.length ? (
        <Empty>{t("log.empty")}</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((x) => (
            <li
              key={x.id}
              className={cn(
                card,
                "flex gap-3 p-4",
                x.status === "closed" && x.category !== "note" && "opacity-70",
              )}
            >
              <span
                className={cn(
                  "h-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
                  x.category === "incident"
                    ? "bg-danger-soft text-danger"
                    : x.category === "lost_found"
                      ? "bg-warning-soft"
                      : "bg-brand-50 text-brand-700",
                )}
              >
                {t(`cat.${x.category}`)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm whitespace-pre-line">{x.text}</p>
                <p className="mt-1 text-xs text-fg-muted">
                  {[x.room ? t("log.roomN", { room: x.room }) : null, x.by, stamp(x.createdAt)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {x.category !== "note" ? (
                <RunButton
                  size="sm"
                  variant={x.status === "open" ? "primary" : "ghost"}
                  run={() => closeLogEntryAction(rid, x.id, x.status !== "open")}
                >
                  {x.status === "open" ? t("log.close") : t("log.reopen")}
                </RunButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function HkOperations({ rid }: { rid: string }) {
  const t = useTranslations("hkx");
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(["occupiedDirty", "cleanInspected", "vacantDirtyClean", "clearAssignments"] as const).map((op) => (
        <div key={op} className={cn(card, "flex flex-col gap-3")}>
          <div>
            <p className="font-bold">{t(`ops.${op}`)}</p>
            <p className="text-sm text-fg-muted">{t(`ops.${op}Hint`)}</p>
          </div>
          <RunButton
            variant="primary"
            confirm={t("ops.confirm")}
            run={async () => {
              const res = await runHkOperationAction(rid, op);
              if (res?.ok) setResult(t("ops.done", { n: Number((res as { data?: number }).data ?? 0) }));
              return res;
            }}
          >
            {t("ops.run")}
          </RunButton>
        </div>
      ))}
      {result ? (
        <p className="rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success md:col-span-2">
          {result}
        </p>
      ) : null}
    </div>
  );
}

export function CreditsForm({
  rid,
  types,
  values,
}: {
  rid: string;
  types: { id: string; code: string; name: string }[];
  values: Record<string, unknown> & { credits: Record<string, number> };
}) {
  const t = useTranslations("hkx");
  const r = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className={cn(card, "max-w-2xl space-y-3")}
      action={(fd) =>
        r.run(
          () =>
            saveServicesSettingsAction(rid, "housekeeping", {
              ...values,
              credits: Object.fromEntries(types.map((x) => [x.id, Number(fd.get(x.id) || 0)])),
            }),
          () => setSaved(true),
        )
      }
    >
      <div>
        <h3 className="font-bold">{t("base.credits")}</h3>
        <p className="text-sm text-fg-muted">{t("base.creditsHint")}</p>
      </div>
      <ul className="divide-y divide-border">
        {types.map((x) => (
          <li key={x.id} className="flex items-center gap-3 py-2">
            <span className="w-14 font-bold">{x.code}</span>
            <span className="flex-1 text-sm">{x.name}</span>
            <input
              name={x.id}
              type="number"
              min={0}
              max={600}
              defaultValue={values.credits[x.id] ?? 30}
              className={cn(inputCls, "w-24")}
              aria-label={x.name}
            />
            <span className="text-xs text-fg-muted">{t("base.minutes")}</span>
          </li>
        ))}
      </ul>
      <FormError error={r.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={r.pending}>
          {t("save")}
        </Button>
        {saved ? <span className="text-sm font-semibold text-success">{t("saved")}</span> : null}
      </div>
    </form>
  );
}

// ─── Minibar ─────────────────────────────────────────────────────────────────

export function MinibarRegister({
  rid,
  currency,
  items,
  rooms,
}: {
  rid: string;
  currency: string;
  items: { id: string; name: string; priceCents: number }[];
  rooms: Room[];
}) {
  const t = useTranslations("minibarx");
  const money = useMoney(currency);
  const r = useRun();
  const [stayId, setStayId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [ok, setOk] = useState<string | null>(null);
  const total = items.reduce((s, i) => s + (qty[i.id] ?? 0) * i.priceCents, 0);
  const lines = Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  if (!items.length) return <Empty>{t("noItems")}</Empty>;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className={card}>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((i) => {
            const q = qty[i.id] ?? 0;
            return (
              <li
                key={i.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2",
                  q ? "border-brand-300 bg-brand-50" : "border-border",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.name}</span>
                  <span className="text-xs text-fg-muted tabular-nums">{money(i.priceCents)}</span>
                </span>
                {q ? (
                  <button
                    type="button"
                    aria-label="-"
                    className="grid size-8 place-items-center rounded-full ring-1 ring-border"
                    onClick={() => setQty((x) => ({ ...x, [i.id]: q - 1 }))}
                  >
                    −
                  </button>
                ) : null}
                {q ? <span className="w-5 text-center font-bold tabular-nums">{q}</span> : null}
                <button
                  type="button"
                  aria-label="+"
                  className="grid size-8 place-items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                  onClick={() => setQty((x) => ({ ...x, [i.id]: Math.min(50, q + 1) }))}
                >
                  <Plus className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={cn(card, "h-fit space-y-4")}>
        <label>
          <Label>{t("room")}</Label>
          <select value={stayId} onChange={(e) => setStayId(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {rooms.map((x) => (
              <option key={x.stayId} value={x.stayId}>
                {x.room} — {x.guest}
              </option>
            ))}
          </select>
        </label>
        <p className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-fg-muted">{t("total")}</span>
          <span className="text-xl font-bold tabular-nums">{money(total)}</span>
        </p>
        <FormError error={r.error} />
        {ok ? (
          <p className="rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success">{ok}</p>
        ) : null}
        <Button
          className="w-full"
          disabled={r.pending || !stayId || !lines.length}
          onClick={() =>
            r.run(
              () => chargeMinibarAction(rid, stayId, lines),
              () => {
                setOk(t("charged"));
                setQty({});
              },
            )
          }
        >
          {t("charge")}
        </Button>
      </div>
    </div>
  );
}

export function MinibarSettings({ rid, selfService }: { rid: string; selfService: boolean }) {
  const t = useTranslations("minibarx");
  const r = useRun();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className={cn(card, "grid max-w-2xl gap-4")}
      action={(fd) =>
        r.run(
          () => saveMinibarSettingsAction(rid, fd.get("self") === "on"),
          () => setSaved(true),
        )
      }
    >
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="self" defaultChecked={selfService} className="mt-0.5 size-4" />
        <span>
          <span className="block font-semibold">{t("selfService")}</span>
          <span className="text-fg-muted">{t("selfServiceHint")}</span>
        </span>
      </label>
      <FormError error={r.error} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={r.pending}>
          {t("save")}
        </Button>
        {saved ? <span className="text-sm font-semibold text-success">{t("saved")}</span> : null}
      </div>
    </form>
  );
}
