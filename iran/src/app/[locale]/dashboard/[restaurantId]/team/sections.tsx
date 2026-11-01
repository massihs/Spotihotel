"use client";

import { Bell, Check, Layers, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { STATION_TONE } from "@/components/kitchen/stations";
import { cn } from "@/lib/cn";
import { deleteSectionAction, saveSectionAction, setMemberSectionsAction } from "./actions";

export type SectionView = {
  id: string;
  name: string;
  color: string;
  permissions: string[] | null;
  notify: string[];
  stationIds: string[];
  members: number;
};

const COLORS = ["orange", "rose", "sky", "emerald", "amber", "violet", "teal", "fuchsia"] as const;
type Color = (typeof COLORS)[number];
const tone = (c: string) => STATION_TONE[c] ?? STATION_TONE.orange!;

/**
 * Team sections the owner creates (Chicha, Terrasse, Bar…): each has its access level, the
 * notifications its members receive and, optionally, the kitchen stations whose orders concern it.
 */
export function SectionsPanel({
  restaurantId,
  sections,
  stations,
  allPermissions,
  assignable,
  presets,
  notifyKeys,
}: {
  restaurantId: string;
  sections: SectionView[];
  stations: { id: string; name: string }[];
  allPermissions: string[];
  assignable: string[];
  presets: Record<string, string[]>;
  notifyKeys: string[];
}) {
  const t = useTranslations("team.sections");
  const [edit, setEdit] = useState<SectionView | "new" | null>(null);
  return (
    <Card className="mb-4 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-bold">
            <Layers className="size-4 text-accent-text" aria-hidden="true" />
            {t("title")}
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">{t("hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => setEdit("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("new")}
        </button>
      </div>
      {sections.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setEdit(s)}
              className="rounded-2xl border border-border p-3.5 text-start transition-colors hover:bg-surface-2"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn("grid size-9 place-items-center rounded-xl font-bold", tone(s.color).soft)}
                >
                  {[...s.name][0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.name}</p>
                  <p className="text-xs text-fg-muted">{t("members", { count: s.members })}</p>
                </div>
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-fg-muted">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                {s.permissions ? t("accessCustom", { count: s.permissions.length }) : t("accessRole")}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-fg-muted">
                <Bell className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {s.notify.length ? s.notify.map((k) => t(`notify.${k}`)).join(" · ") : t("notifyNone")}
              </p>
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm text-fg-muted">{t("empty")}</p>
      )}
      {edit ? (
        <SectionSheet
          key={edit === "new" ? "new" : edit.id}
          restaurantId={restaurantId}
          section={edit === "new" ? null : edit}
          index={sections.length}
          stations={stations}
          allPermissions={allPermissions}
          assignable={assignable}
          presets={presets}
          notifyKeys={notifyKeys}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </Card>
  );
}

function SectionSheet({
  restaurantId,
  section,
  index,
  stations,
  allPermissions,
  assignable,
  presets,
  notifyKeys,
  onClose,
}: {
  restaurantId: string;
  section: SectionView | null;
  index: number;
  stations: { id: string; name: string }[];
  allPermissions: string[];
  assignable: string[];
  presets: Record<string, string[]>;
  notifyKeys: string[];
  onClose: () => void;
}) {
  const t = useTranslations();
  const ts = useTranslations("team.sections");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(section?.name ?? "");
  const [color, setColor] = useState<Color>((section?.color as Color) ?? COLORS[index % COLORS.length]!);
  const [custom, setCustom] = useState(section ? section.permissions != null : true);
  const [perms, setPerms] = useState<Set<string>>(
    () => new Set(section?.permissions ?? presets.waiter ?? []),
  );
  const [notify, setNotify] = useState<Set<string>>(() => new Set(section?.notify ?? ["calls"]));
  const [stationIds, setStationIds] = useState<Set<string>>(() => new Set(section?.stationIds ?? []));
  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const chip = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm",
      on ? tone(color).soft + " font-semibold ring-1 ring-current" : "ring-1 ring-border",
    );

  return (
    <Sheet title={section ? section.name : ts("new")} onClose={onClose}>
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          {ts("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={ts("namePlaceholder")}
            maxLength={48}
            className={cn(field, "mt-1")}
            autoFocus
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              aria-pressed={color === c}
              className={cn(
                "size-8 rounded-full",
                tone(c).dot,
                color === c && "ring-2 ring-fg ring-offset-2",
              )}
            />
          ))}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{ts("access")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {[false, true].map((v) => (
              <button
                key={String(v)}
                type="button"
                aria-pressed={custom === v}
                onClick={() => setCustom(v)}
                className={cn(
                  "rounded-xl p-2.5 text-start text-sm ring-1",
                  custom === v ? "bg-accent-soft font-semibold text-accent-text ring-accent" : "ring-border",
                )}
              >
                {v ? ts("accessCustomLabel") : ts("accessRoleLabel")}
              </button>
            ))}
          </div>
          {custom ? (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                <span className="self-center text-xs text-fg-muted">{ts("presets")}</span>
                {Object.entries(presets).map(([k, list]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPerms(new Set(list.filter((p) => assignable.includes(p))))}
                    className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold hover:bg-surface-3"
                  >
                    {t(`team.jobs.${k as "waiter"}.name`)}
                  </button>
                ))}
              </div>
              <div className="grid max-h-60 gap-1.5 overflow-y-auto rounded-xl border border-border p-2.5 sm:grid-cols-2">
                {allPermissions.map((p) => (
                  <label
                    key={p}
                    className={cn("flex items-center gap-2 text-sm", !assignable.includes(p) && "opacity-40")}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      checked={perms.has(p) || p === "restaurant.view"}
                      disabled={!assignable.includes(p) || p === "restaurant.view"}
                      onChange={() => setPerms((x) => toggle(x, p))}
                    />
                    {t(`permissions.${p}`)}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-fg-muted">{ts("accessRoleHint")}</p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{ts("notifyTitle")}</legend>
          <p className="mb-2 text-xs text-fg-muted">{ts("notifyHint")}</p>
          <div className="flex flex-wrap gap-2">
            {notifyKeys.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={notify.has(k)}
                onClick={() => setNotify((x) => toggle(x, k))}
                className={chip(notify.has(k))}
              >
                {notify.has(k) ? <Check className="size-3.5" aria-hidden="true" /> : null}
                {ts(`notify.${k}`)}
              </button>
            ))}
          </div>
        </fieldset>

        {stations.length ? (
          <fieldset>
            <legend className="text-sm font-semibold">{ts("stations")}</legend>
            <p className="mb-2 text-xs text-fg-muted">{ts("stationsHint")}</p>
            <div className="flex flex-wrap gap-2">
              {stations.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={stationIds.has(s.id)}
                  onClick={() => setStationIds((x) => toggle(x, s.id))}
                  className={chip(stationIds.has(s.id))}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2">
          {section ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(ts("deleteConfirm", { name: section.name })) &&
                run(() => deleteSectionAction(restaurantId, section.id), onClose)
              }
              className="grid size-11 place-items-center rounded-full text-danger ring-1 ring-danger/30"
              aria-label={ts("delete")}
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
                  saveSectionAction(restaurantId, section?.id ?? null, {
                    name,
                    color,
                    permissions: custom ? ([...perms] as never) : null,
                    notify: [...notify] as never,
                    stationIds: [...stationIds],
                  }),
                onClose,
              )
            }
            className="h-11 flex-1 rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A member's sections, as chips, with a sheet to change them. */
export function MemberSections({
  restaurantId,
  memberId,
  memberName,
  value,
  sections,
  editable,
}: {
  restaurantId: string;
  memberId: string;
  memberName: string;
  value: string[];
  sections: { id: string; name: string; color: string }[];
  editable: boolean;
}) {
  const t = useTranslations("team.sections");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(value);
  const { pending, error, run } = useRun();
  const mine = sections.filter((s) => value.includes(s.id));
  if (!sections.length) return <span className="text-fg-subtle">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {mine.map((s) => (
        <span
          key={s.id}
          className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", tone(s.color).soft)}
        >
          {s.name}
        </span>
      ))}
      {!mine.length ? <span className="text-xs text-fg-subtle">{t("noneShort")}</span> : null}
      {editable ? (
        <button
          type="button"
          onClick={() => (setPicked(value), setOpen(true))}
          className="grid size-6 place-items-center rounded-full bg-surface-2 text-fg-muted hover:bg-surface-3"
          aria-label={t("assign", { name: memberName })}
          title={t("assign", { name: memberName })}
        >
          <Plus className="size-3.5" />
        </button>
      ) : null}
      {open ? (
        <Sheet title={t("assign", { name: memberName })} onClose={() => setOpen(false)}>
          <p className="mb-3 text-sm text-fg-muted">{t("assignHint")}</p>
          <div className="space-y-2">
            {sections.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((x) => (on ? x.filter((y) => y !== s.id) : [...x, s.id]))}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-start",
                    on ? "border-accent bg-accent-soft" : "border-border",
                  )}
                >
                  <span className={cn("size-3 rounded-full", tone(s.color).dot)} />
                  <span className="flex-1 font-semibold">{s.name}</span>
                  {on ? <Check className="size-4 text-accent-text" /> : null}
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => setMemberSectionsAction(restaurantId, memberId, picked),
                () => setOpen(false),
              )
            }
            className="mt-4 h-11 w-full rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
          >
            {tc("save")}
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}
