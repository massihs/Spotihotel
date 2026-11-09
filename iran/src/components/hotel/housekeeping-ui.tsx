"use client";

import { AlertTriangle, Check, Clock, PlayCircle, Sparkles, Star, Users, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { setHousekeepingAction } from "@/app/[locale]/dashboard/[restaurantId]/rooms/actions";
import {
  assignHousekeeperAction,
  createTicketAction,
  distributeRoomsAction,
  setTicketStatusAction,
} from "@/app/[locale]/dashboard/[restaurantId]/housekeeping/actions";
import { FormError, Label, SheetButton, inputCls, useDay } from "@/components/pms/kit";
import { DateInput } from "@/components/ui/date-input";

export type HkRoom = {
  id: string;
  label: string;
  typeCode: string | null;
  housekeeping: string;
  floor: string;
  occupancy: "arrival" | "departure" | "stayover" | "vacant";
  eta: string | null;
  priority: boolean;
  housekeeperUserId: string | null;
  tickets: { id: string; title: string }[];
};
export type HkStaff = { userId: string; name: string; rooms: number };
export type HkFloor = { key: string; label: string | null; numbered?: boolean };

const STATUS_TONE: Record<string, string> = {
  dirty: "bg-danger-soft text-danger ring-danger/30",
  cleaning: "bg-warning-soft text-fg ring-warning/40",
  clean: "bg-success-soft text-success ring-success/30",
  inspected: "bg-brand-100 text-brand-800 ring-brand-300",
  out_of_order: "bg-surface-3 text-fg-muted ring-border",
};

function useLabels() {
  const t = useTranslations("housekeeping");
  const tHk = useTranslations("pms.housekeeping");
  return { t, tHk };
}

// ─── Today's plan (supervisor) ───────────────────────────────────────────────

export function HousekeepingPlan({
  restaurantId,
  rooms,
  floors,
  staff,
  counts,
  canManage,
}: {
  restaurantId: string;
  rooms: HkRoom[];
  floors: HkFloor[];
  staff: HkStaff[];
  counts: Record<string, number>;
  canManage: boolean;
}) {
  const { t, tHk } = useLabels();
  const [filter, setFilter] = useState<"all" | "todo" | "inspect" | "unassigned">("todo");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [team, setTeam] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState("");
  const run = useRun();
  const nameOf = (id: string | null) => staff.find((s) => s.userId === id)?.name ?? null;
  const shown = rooms.filter((r) =>
    filter === "all"
      ? true
      : filter === "todo"
        ? ["dirty", "cleaning"].includes(r.housekeeping)
        : filter === "inspect"
          ? r.housekeeping === "clean"
          : !r.housekeeperUserId && ["dirty", "cleaning"].includes(r.housekeeping),
  );
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition",
      active
        ? "bg-brand-700 text-white ring-brand-700"
        : "bg-surface text-fg-muted ring-border hover:bg-brand-50",
    );

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {(["dirty", "cleaning", "clean", "inspected", "outOfOrder", "unassigned"] as const).map((k) => (
          <li key={k} className="rounded-2xl border border-border bg-surface px-3 py-2.5">
            <p className="text-xs text-fg-muted">{t(`counts.${k}`)}</p>
            <p className="text-xl font-bold tabular-nums">{counts[k] ?? 0}</p>
          </li>
        ))}
      </ul>

      {canManage && staff.length ? (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-brand-600" aria-hidden="true" />
            {t("distributeTitle")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {staff.map((s) => (
              <button
                key={s.userId}
                type="button"
                className={chip(team.has(s.userId))}
                aria-pressed={team.has(s.userId)}
                onClick={() => setTeam(toggle(team, s.userId))}
              >
                {s.name} <span className="tabular-nums opacity-70">{s.rooms}</span>
              </button>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!team.size || run.pending}
            onClick={() => run.run(() => distributeRoomsAction(restaurantId, [...team]))}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {t("distribute", { n: counts.unassigned ?? 0 })}
          </Button>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["todo", "inspect", "unassigned", "all"] as const).map((f) => (
          <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(f)}>
            {t(`filter.${f}`)}
          </button>
        ))}
        {canManage && selected.size ? (
          <span className="ms-auto flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t("selected", { n: selected.size })}</span>
            <select
              className={cn(inputCls, "h-9 w-auto py-0 text-sm")}
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              aria-label={t("assignTo")}
            >
              <option value="">{t("assignTo")}</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
              <option value="-">{t("unassign")}</option>
            </select>
            <Button
              size="sm"
              disabled={!assignTo || run.pending}
              onClick={() =>
                run.run(
                  () =>
                    assignHousekeeperAction(restaurantId, [...selected], assignTo === "-" ? null : assignTo),
                  () => setSelected(new Set()),
                )
              }
            >
              {t("assign")}
            </Button>
          </span>
        ) : null}
      </div>
      <FormError error={run.error} />

      {floors.map((f) => {
        const list = shown.filter((r) => r.floor === f.key);
        if (!list.length) return null;
        return (
          <section key={f.key}>
            <h2 className="mb-2 text-sm font-semibold text-fg-muted">
              {f.label ? (f.numbered ? t("floor", { floor: f.label }) : f.label) : t("otherRooms")}
            </h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {list.map((r) => {
                const on = selected.has(r.id);
                return (
                  <li key={r.id}>
                    <div
                      role={canManage ? "button" : undefined}
                      tabIndex={canManage ? 0 : undefined}
                      onClick={() => canManage && setSelected(toggle(selected, r.id))}
                      onKeyDown={(e) => canManage && e.key === "Enter" && setSelected(toggle(selected, r.id))}
                      className={cn(
                        "flex h-full flex-col gap-1.5 rounded-2xl border bg-surface p-3 transition",
                        on ? "border-brand-600 ring-2 ring-brand-300" : "border-border",
                        canManage && "cursor-pointer hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold tabular-nums">
                          {r.label}
                          <span className="ms-1 text-[10px] font-normal text-fg-muted">{r.typeCode}</span>
                        </span>
                        {r.priority ? (
                          <Star className="size-4 fill-warning text-warning" aria-label={t("priority")} />
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                          STATUS_TONE[r.housekeeping],
                        )}
                      >
                        {tHk.has(r.housekeeping as "clean") ? tHk(r.housekeeping as "clean") : r.housekeeping}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {t(`occupancy.${r.occupancy}`)}
                        {r.eta ? ` · ${r.eta.slice(0, 5)}` : ""}
                      </span>
                      <span className="truncate text-xs font-semibold">
                        {nameOf(r.housekeeperUserId) ?? (
                          <span className="font-normal text-fg-subtle">{t("nobody")}</span>
                        )}
                      </span>
                      {r.tickets.length ? (
                        <span className="flex items-center gap-1 truncate text-[11px] text-warning">
                          <Wrench className="size-3 shrink-0" aria-hidden="true" />
                          {r.tickets[0]!.title}
                        </span>
                      ) : null}
                      {canManage && r.housekeeping === "clean" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-auto"
                          disabled={run.pending}
                          onClick={(e) => {
                            e.stopPropagation();
                            run.run(() => setHousekeepingAction(restaurantId, r.id, "inspected"));
                          }}
                        >
                          <Check className="size-4" aria-hidden="true" />
                          {t("inspect")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!shown.length ? <p className="py-10 text-center text-sm text-fg-muted">{t("nothing")}</p> : null}
    </div>
  );
}

// ─── My rooms (housekeeper, on the phone) ────────────────────────────────────

export function MyRooms({ restaurantId, rooms }: { restaurantId: string; rooms: HkRoom[] }) {
  const { t, tHk } = useLabels();
  const run = useRun();
  const left = rooms.filter((r) => !["clean", "inspected"].includes(r.housekeeping)).length;
  if (!rooms.length)
    return <p className="rounded-2xl bg-surface-2 p-8 text-center text-sm text-fg-muted">{t("mineEmpty")}</p>;
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="text-sm text-fg-muted">{t("mineLeft", { n: left, total: rooms.length })}</p>
      <FormError error={run.error} />
      <ul className="space-y-2">
        {rooms.map((r) => {
          const done = ["clean", "inspected"].includes(r.housekeeping);
          return (
            <li
              key={r.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4",
                done && "opacity-60",
              )}
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-lg font-bold text-brand-800 tabular-nums">
                {r.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-semibold">
                  {r.priority ? (
                    <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                  ) : null}
                  {t(`occupancy.${r.occupancy}`)}
                  {r.eta ? (
                    <span className="inline-flex items-center gap-1 text-xs font-normal text-fg-muted">
                      <Clock className="size-3" aria-hidden="true" />
                      {r.eta.slice(0, 5)}
                    </span>
                  ) : null}
                </p>
                <span
                  className={cn(
                    "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                    STATUS_TONE[r.housekeeping],
                  )}
                >
                  {tHk.has(r.housekeeping as "clean") ? tHk(r.housekeeping as "clean") : r.housekeeping}
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                {r.housekeeping === "dirty" ? (
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1"
                    disabled={run.pending}
                    onClick={() => run.run(() => setHousekeepingAction(restaurantId, r.id, "cleaning"))}
                  >
                    <PlayCircle className="size-5" aria-hidden="true" />
                    {t("start")}
                  </Button>
                ) : null}
                {r.housekeeping === "dirty" || r.housekeeping === "cleaning" ? (
                  <Button
                    size="lg"
                    className="flex-1"
                    disabled={run.pending}
                    onClick={() => run.run(() => setHousekeepingAction(restaurantId, r.id, "clean"))}
                  >
                    <Check className="size-5" aria-hidden="true" />
                    {t("done")}
                  </Button>
                ) : null}
                <SheetButton
                  label={<Wrench className="size-4" aria-label={t("report")} />}
                  title={t("reportRoom", { room: r.label })}
                  variant="ghost"
                  size="lg"
                >
                  {(close) => (
                    <TicketForm restaurantId={restaurantId} rooms={[r]} fixedRoomId={r.id} done={close} />
                  )}
                </SheetButton>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

export type Ticket = {
  id: string;
  room: string | null;
  place: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  outOfOrder: boolean;
  outFrom: string | null;
  outUntil: string | null;
  assignedToUserId: string | null;
  resolution: string | null;
  createdAt: string;
};

export function MaintenanceBoard({
  restaurantId,
  tickets,
  rooms,
  staff,
  today,
}: {
  restaurantId: string;
  tickets: Ticket[];
  rooms: { id: string; label: string }[];
  staff: HkStaff[];
  today: string;
}) {
  const t = useTranslations("housekeeping");
  const day = useDay();
  const run = useRun();
  const nameOf = (id: string | null) => staff.find((s) => s.userId === id)?.name ?? null;
  return (
    <div className="space-y-4">
      <SheetButton label={t("newTicket")} title={t("newTicket")} variant="primary" size="md">
        {(close) => (
          <TicketForm restaurantId={restaurantId} rooms={rooms} staff={staff} today={today} done={close} />
        )}
      </SheetButton>
      <FormError error={run.error} />
      {tickets.length ? (
        <ul className="space-y-2">
          {tickets.map((k) => {
            const open = k.status === "open" || k.status === "in_progress";
            return (
              <li
                key={k.id}
                className={cn("rounded-2xl border border-border bg-surface p-4", !open && "opacity-60")}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      k.priority === "urgent" ? "bg-danger-soft text-danger" : "bg-brand-50 text-brand-700",
                    )}
                  >
                    {k.priority === "urgent" ? (
                      <AlertTriangle className="size-5" />
                    ) : (
                      <Wrench className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {k.room ? t("roomN", { room: k.room }) : (k.place ?? "—")} · {k.title}
                    </p>
                    {k.description ? <p className="mt-0.5 text-sm text-fg-muted">{k.description}</p> : null}
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
                      <span className="font-semibold">{t(`status.${k.status as "open"}`)}</span>
                      <span>{t(`prio.${k.priority as "normal"}`)}</span>
                      {k.outOfOrder ? (
                        <span className="text-danger">
                          {t("outPeriod", {
                            from: k.outFrom ? day(k.outFrom) : "—",
                            until: k.outUntil ? day(k.outUntil) : t("untilFixed"),
                          })}
                        </span>
                      ) : null}
                      {nameOf(k.assignedToUserId) ? <span>{nameOf(k.assignedToUserId)}</span> : null}
                      {k.resolution ? <span>{k.resolution}</span> : null}
                    </p>
                  </div>
                  {open ? (
                    <div className="flex flex-wrap gap-2">
                      {k.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={run.pending}
                          onClick={() =>
                            run.run(() => setTicketStatusAction(restaurantId, k.id, "in_progress"))
                          }
                        >
                          {t("startRepair")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        disabled={run.pending}
                        onClick={() => run.run(() => setTicketStatusAction(restaurantId, k.id, "done"))}
                      >
                        <Check className="size-4" aria-hidden="true" />
                        {t("repaired")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={run.pending}
                        onClick={() => run.run(() => setTicketStatusAction(restaurantId, k.id, "cancelled"))}
                      >
                        {t("cancelTicket")}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl bg-surface-2 p-8 text-center text-sm text-fg-muted">{t("noTickets")}</p>
      )}
    </div>
  );
}

function TicketForm({
  restaurantId,
  rooms,
  staff = [],
  fixedRoomId,
  today,
  done,
}: {
  restaurantId: string;
  rooms: { id: string; label: string }[];
  staff?: HkStaff[];
  fixedRoomId?: string;
  today?: string;
  done: () => void;
}) {
  const t = useTranslations("housekeeping");
  const r = useRun();
  const [out, setOut] = useState(false);
  const [from, setFrom] = useState(today ?? "");
  const [until, setUntil] = useState("");
  return (
    <form
      className="space-y-3"
      action={(fd) =>
        r.run(
          () =>
            createTicketAction(restaurantId, {
              roomId: fixedRoomId ?? String(fd.get("roomId") ?? ""),
              place: String(fd.get("place") ?? ""),
              title: String(fd.get("title") ?? ""),
              description: String(fd.get("description") ?? ""),
              priority: (String(fd.get("priority") ?? "normal") as "normal") || "normal",
              outOfOrder: out,
              outFrom: out ? from : "",
              outUntil: out ? until : "",
              assignedToUserId: String(fd.get("assignedToUserId") ?? ""),
            }),
          done,
        )
      }
    >
      {fixedRoomId ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("room")}</Label>
            <select name="roomId" className={inputCls} defaultValue="">
              <option value="">{t("noRoom")}</option>
              {rooms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <Label>{t("place")}</Label>
            <input name="place" maxLength={80} className={inputCls} placeholder={t("placeHint")} />
          </label>
        </div>
      )}
      <label className="block">
        <Label>{t("ticketTitle")}</Label>
        <input
          name="title"
          required
          maxLength={160}
          className={inputCls}
          placeholder={t("ticketTitleHint")}
        />
      </label>
      <label className="block">
        <Label>{t("description")}</Label>
        <textarea name="description" maxLength={2000} rows={3} className={cn(inputCls, "h-auto py-2")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label>{t("priorityLabel")}</Label>
          <select name="priority" className={inputCls} defaultValue="normal">
            {(["low", "normal", "urgent"] as const).map((p) => (
              <option key={p} value={p}>
                {t(`prio.${p}`)}
              </option>
            ))}
          </select>
        </label>
        {staff.length ? (
          <label className="block">
            <Label>{t("assignee")}</Label>
            <select name="assignedToUserId" className={inputCls} defaultValue="">
              <option value="">{t("nobody")}</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={out} onChange={(e) => setOut(e.target.checked)} />
        {t("outOfOrder")}
      </label>
      {out ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <Label>{t("outFrom")}</Label>
            <DateInput className={inputCls} value={from} onChange={(v) => setFrom(v ?? "")} />
          </label>
          <label className="block">
            <Label hint={t("optional")}>{t("outUntil")}</Label>
            <DateInput className={inputCls} value={until} onChange={(v) => setUntil(v ?? "")} />
          </label>
        </div>
      ) : null}
      <FormError error={r.error} />
      <Button type="submit" className="w-full" disabled={r.pending}>
        {t("send")}
      </Button>
    </form>
  );
}
