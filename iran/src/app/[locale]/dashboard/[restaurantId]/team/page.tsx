import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireRestaurant } from "@/server/auth/current";
import {
  canAssignRole,
  JOB_PRESETS,
  PERMISSIONS,
  resolvePermissions,
  ROLE_PERMISSIONS,
} from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { listMembers } from "@/server/modules/members/service";
import { AddMemberDialog, EditMemberDialog } from "./member-forms";
import { JobPicker } from "./job-picker";
import { JobGuide } from "./job-guide";
import { cn } from "@/lib/cn";
import { isJob } from "@/lib/jobs";
import { JOB_TONES, jobOf } from "./job-meta";
import { listTeamJobs } from "@/server/modules/team/jobs";
import { listStations } from "@/server/modules/kitchen/stations";
import { CALL_ICONS, listGuestCalls, listSections, NOTIFY_KEYS } from "@/server/modules/team/sections";
import { MemberSections, SectionsPanel } from "./sections";
import { GuestCallsPanel } from "./guest-calls";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/team">["params"];

export default function TeamPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "members.manage");
  const [t, format, members, { stations }, sections, calls, jobs] = await Promise.all([
    getTranslations(),
    getFormatter(),
    listMembers(db, ctx),
    listStations(db, ctx),
    listSections(db, ctx),
    listGuestCalls(db, ctx),
    listTeamJobs(db, ctx),
  ]);
  const jobCounts: Record<string, number> = {};
  for (const m of members) {
    const j = jobOf(jobs, m.teamJobId, m.job);
    if (j) jobCounts[j.id] = (jobCounts[j.id] ?? 0) + 1;
  }
  const sectionList = sections.map((s) => ({ id: s.id, name: s.name, color: s.color }));
  const presets = Object.fromEntries(
    (["waiter", "cashier", "bar", "kitchen"] as const).map((j) => [
      j,
      [...resolvePermissions("staff", JOB_PRESETS[j].granted, JOB_PRESETS[j].revoked)],
    ]),
  );
  const stationList = stations.map((s) => ({ id: s.id, name: s.name }));
  const roles = (["admin", "staff"] as const).filter((r) => canAssignRole(ctx.role, r));
  const roleDefaults = { admin: [...ROLE_PERMISSIONS.admin], staff: [...ROLE_PERMISSIONS.staff] };

  return (
    <>
      <PageHeader
        title={t("team.title")}
        description={t("team.subtitle")}
        actions={
          <AddMemberDialog
            restaurantId={ctx.restaurant.id}
            roles={[...roles]}
            stations={stationList}
            jobs={jobs}
          />
        }
      />
      <JobGuide
        restaurantId={ctx.restaurant.id}
        jobs={jobs}
        counts={jobCounts}
        allowManager={roles.includes("admin")}
      />
      <SectionsPanel
        restaurantId={ctx.restaurant.id}
        sections={sections.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          permissions: s.permissions,
          notify: s.notify,
          stationIds: s.stationIds,
          members: members.filter((m) => m.sectionIds.includes(s.id)).length,
        }))}
        stations={stationList}
        allPermissions={[...PERMISSIONS]}
        assignable={[...ctx.permissions]}
        presets={presets}
        notifyKeys={[...NOTIFY_KEYS]}
      />
      <Card className="mb-4 overflow-x-auto">
        {/* Phones: each member is a card (the table rows turn into small grids). */}
        <table className="w-full text-sm max-sm:block">
          <thead className="border-b border-border text-fg-muted max-sm:hidden">
            <tr>
              <th className="px-5 py-3 text-start font-medium">{t("team.fullName")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.jobs.label")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.sections.column")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.role")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.lastLogin")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.status")}</th>
              <th className="px-5 py-3">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border max-sm:block">
            {members.map((m) => {
              const isSelf = m.userId === ctx.user.id;
              const editable = !isSelf && m.role !== "owner" && canAssignRole(ctx.role, m.role);
              return (
                <tr
                  key={m.id}
                  className="max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-2 max-sm:p-4 max-sm:[&>td]:p-0"
                >
                  <td className="px-5 py-3 max-sm:col-span-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold",
                          m.role === "owner"
                            ? "bg-accent text-accent-fg"
                            : isJob(m.job)
                              ? JOB_TONES[m.job]
                              : "bg-surface-2 text-fg-muted",
                          m.status !== "active" && "opacity-50",
                        )}
                        aria-hidden="true"
                      >
                        {initials(m.fullName)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.fullName}{" "}
                          {isSelf ? <span className="text-fg-subtle">({t("team.you")})</span> : null}
                        </p>
                        <p className="truncate text-xs text-fg-subtle" dir="ltr">
                          {m.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 max-sm:col-span-2">
                    {editable ? (
                      <JobPicker
                        restaurantId={ctx.restaurant.id}
                        memberId={m.id}
                        job={m.job}
                        teamJobId={m.teamJobId}
                        jobs={jobs}
                        stationId={m.stationId}
                        stations={stationList}
                        allowManager={roles.includes("admin")}
                      />
                    ) : (
                      <span className="text-fg-subtle">
                        {m.role === "owner" ? t("team.jobs.owner") : "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 max-sm:col-span-2">
                    <MemberSections
                      restaurantId={ctx.restaurant.id}
                      memberId={m.id}
                      memberName={m.fullName}
                      value={m.sectionIds}
                      sections={sectionList}
                      editable={editable || isSelf}
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{t(`roles.${m.role}`)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-fg-muted max-sm:order-last max-sm:col-span-2 max-sm:text-xs">
                    {m.lastLoginAt
                      ? format.dateTime(m.lastLoginAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: ctx.restaurant.timezone,
                        })
                      : t("team.never")}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.status === "active" ? "success" : "neutral"}>
                      {m.status === "active" ? t("team.active") : t("team.disabled")}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-end">
                    {editable ? (
                      <EditMemberDialog
                        restaurantId={ctx.restaurant.id}
                        member={m}
                        roles={[...roles]}
                        allPermissions={[...PERMISSIONS]}
                        roleDefaults={roleDefaults}
                        assignable={[...ctx.permissions]}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      {/* A hotel manages its bell with its room services, on the Requests page. */}
      {ctx.restaurant.kind === "hotel" ? null : (
        <GuestCallsPanel
          restaurantId={ctx.restaurant.id}
          calls={calls}
          sections={sectionList}
          icons={[...CALL_ICONS]}
        />
      )}
    </>
  );
}

/** Two initials for the avatar ("نگار کریمی" → "نک"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts)
    .map((p) => [...p][0] ?? "")
    .join("")
    .toUpperCase();
}
