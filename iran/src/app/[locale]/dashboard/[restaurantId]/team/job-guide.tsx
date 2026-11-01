"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { JOBS, type Job } from "@/lib/jobs";
import { TEAM_JOB_ICONS } from "@/lib/team-jobs";
import { deleteTeamJobAction, saveTeamJobAction } from "./actions";
import { JOB_TONES, TEAM_ICONS, type TeamJobView } from "./job-meta";
import { TeamIcon } from "./team-icon";

/**
 * The restaurant's jobs as it names them (Caisse, Chicha, Réception…), each with its icon and
 * the base job that sets what it can do and see. Tap a card to edit; "New job" adds one.
 */
export function JobGuide({
  restaurantId,
  jobs,
  counts,
  allowManager,
}: {
  restaurantId: string;
  jobs: TeamJobView[];
  counts: Record<string, number>;
  allowManager: boolean;
}) {
  const t = useTranslations("team.jobs");
  const [edit, setEdit] = useState<TeamJobView | "new" | null>(null);
  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">{t("title")}</h2>
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
      {/* Phones: one swipeable row instead of a column of cards before the team list. */}
      <div className="-mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 xl:grid-cols-5">
        {jobs.map((j) => {
          return (
            <button
              key={j.id}
              type="button"
              onClick={() => setEdit(j)}
              className="group w-56 shrink-0 snap-start rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:bg-surface-2 sm:w-auto"
            >
              <span className="flex items-start justify-between">
                <span
                  className={cn("grid size-10 place-items-center rounded-xl", JOB_TONES[j.baseJob as Job])}
                  aria-hidden="true"
                >
                  <TeamIcon name={j.icon} className="size-5" />
                </span>
                <Pencil className="size-4 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span className="mt-3 flex items-center justify-between gap-2 font-semibold">
                <span className="truncate">{j.name}</span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-fg-muted tabular-nums">
                  {counts[j.id] ?? 0}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-fg-muted">
                {t("worksAs", { job: t(`${j.baseJob as Job}.name`) })}
              </span>
            </button>
          );
        })}
      </div>
      {edit ? (
        <JobSheet
          key={edit === "new" ? "new" : edit.id}
          restaurantId={restaurantId}
          job={edit === "new" ? null : edit}
          held={edit === "new" ? 0 : (counts[edit.id] ?? 0)}
          allowManager={allowManager}
          onClose={() => setEdit(null)}
        />
      ) : null}
    </section>
  );
}

function JobSheet({
  restaurantId,
  job,
  held,
  allowManager,
  onClose,
}: {
  restaurantId: string;
  job: TeamJobView | null;
  held: number;
  allowManager: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("team.jobs");
  const tc = useTranslations("common");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(job?.name ?? "");
  const [icon, setIcon] = useState(job?.icon ?? "users");
  const [base, setBase] = useState<Job>((job?.baseJob as Job) ?? "waiter");
  const bases = JOBS.filter((j) => allowManager || j !== "manager" || base === "manager");
  return (
    <Sheet title={job ? job.name : t("new")} onClose={onClose}>
      <div className="space-y-5">
        <label className="block text-sm font-medium">
          {t("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={48}
            className={cn(field, "mt-1")}
            autoFocus
          />
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t("icon")}</legend>
          <div className="grid grid-cols-8 gap-2">
            {TEAM_JOB_ICONS.map((k) => {
              const Icon = TEAM_ICONS[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIcon(k)}
                  aria-pressed={icon === k}
                  aria-label={k}
                  className={cn(
                    "grid aspect-square place-items-center rounded-xl transition-colors",
                    icon === k
                      ? cn(JOB_TONES[base], "ring-2 ring-current")
                      : "bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">{t("base")}</legend>
          <p className="mb-2 text-xs text-fg-muted">{held ? t("baseLocked") : t("baseHint")}</p>
          <div className="space-y-2">
            {bases.map((b) => (
              <button
                key={b}
                type="button"
                disabled={held > 0 && b !== base}
                onClick={() => setBase(b)}
                aria-pressed={base === b}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl p-3 text-start ring-1 transition-colors disabled:opacity-40",
                  base === b ? "bg-accent-soft ring-accent" : "ring-border hover:bg-surface-2",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", JOB_TONES[b])}>
                  <TeamIcon
                    name={
                      {
                        manager: "crown",
                        cashier: "calculator",
                        waiter: "hand-platter",
                        bar: "coffee",
                        kitchen: "chef-hat",
                      }[b]
                    }
                    className="size-4"
                  />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t(`${b}.name`)}</span>
                  <span className="block text-xs leading-5 text-fg-muted">{t(`${b}.desc`)}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="flex items-center gap-2">
          {job ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("deleteConfirm", { name: job.name })) &&
                run(() => deleteTeamJobAction(restaurantId, job.id), onClose)
              }
              className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-danger ring-1 ring-danger/30"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {tc("delete")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () =>
                  saveTeamJobAction(restaurantId, {
                    ...(job ? { id: job.id } : {}),
                    name,
                    icon: icon as "users",
                    baseJob: base,
                  }),
                onClose,
              )
            }
            className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-50"
          >
            {tc("save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
