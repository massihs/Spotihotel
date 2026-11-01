"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { STATION_JOBS, type Job } from "@/lib/jobs";
import { setMemberJobAction } from "./actions";
import { JOB_TONES, jobOf, type TeamJobView } from "./job-meta";
import { TeamIcon } from "./team-icon";

/** Inline job (and station) picker of a team row; saves on change. */
export function JobPicker({
  restaurantId,
  memberId,
  job,
  teamJobId,
  jobs,
  stationId,
  stations,
  allowManager,
  disabled,
}: {
  restaurantId: string;
  memberId: string;
  job: string | null;
  teamJobId: string | null;
  jobs: TeamJobView[];
  stationId: string | null;
  stations: { id: string; name: string }[];
  allowManager: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("team.jobs");
  const tErr = useTranslations("errorCodes");
  const [value, setValue] = useState(jobOf(jobs, teamJobId, job)?.id ?? "");
  const picked = jobs.find((j) => j.id === value);
  const base = (picked?.baseJob ?? "") as Job | "";
  const [station, setStation] = useState(stationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (id: string, s: string) =>
    start(async () => {
      setError(null);
      const next = jobs.find((j) => j.id === id);
      const res = await setMemberJobAction(
        restaurantId,
        memberId,
        next?.baseJob ?? null,
        s || null,
        id || null,
      );
      if (res && !res.ok) setError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
    });
  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          base ? JOB_TONES[base] : "bg-surface-2 text-fg-subtle",
        )}
        aria-hidden="true"
      >
        {picked ? <TeamIcon name={picked.icon} className="size-4" /> : "—"}
      </span>
      <select
        value={value}
        disabled={disabled || pending}
        aria-label={t("label")}
        onChange={(e) => {
          setValue(e.target.value);
          const next = jobs.find((j) => j.id === e.target.value);
          save(e.target.value, STATION_JOBS.includes(next?.baseJob as Job) ? station : "");
        }}
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
      >
        <option value="">{t("none")}</option>
        {jobs
          .filter((j) => allowManager || j.baseJob !== "manager" || j.id === value)
          .map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
      </select>
      {base && STATION_JOBS.includes(base) && stations.length ? (
        <select
          value={station}
          disabled={disabled || pending}
          aria-label={t("station")}
          onChange={(e) => {
            setStation(e.target.value);
            save(value, e.target.value);
          }}
          className="h-9 rounded-lg border border-border bg-surface px-2 text-sm"
        >
          <option value="">{t("allStations")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
