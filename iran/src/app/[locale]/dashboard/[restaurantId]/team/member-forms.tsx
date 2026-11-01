"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  Checkbox,
  FormFeedback,
  SelectField,
  SubmitButton,
  useCloseOnSuccess,
  useFieldError,
  ActionForm,
  useActionForm,
} from "@/components/ui/form";
import { addMemberAction, removeMemberAction, updateMemberAction } from "./actions";
import { STATION_JOBS, type Job } from "@/lib/jobs";
import type { TeamJobView } from "./job-meta";

export type MemberView = {
  id: string;
  fullName: string;
  email: string;
  role: "owner" | "admin" | "staff";
  status: "active" | "invited" | "disabled";
  effectivePermissions: string[];
  /** Access set by the member's section: the permissions below are read-only. */
  accessFromSection?: boolean;
};

function AddMemberForm({
  restaurantId,
  roles,
  stations,
  jobs,
}: {
  restaurantId: string;
  roles: ("admin" | "staff")[];
  stations: { id: string; name: string }[];
  jobs: TeamJobView[];
}) {
  const t = useTranslations();
  const form = useActionForm(addMemberAction.bind(null, restaurantId));
  const state = form.state;
  useCloseOnSuccess(state);
  const err = useFieldError(state);
  const usable = jobs.filter((j) => roles.includes("admin") || j.baseJob !== "manager");
  const [jobId, setJobId] = useState<string>(
    (usable.find((j) => j.baseJob === "waiter") ?? usable[0])?.id ?? "",
  );
  const job = usable.find((j) => j.id === jobId)?.baseJob ?? "waiter";
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <Field
        label={t("team.email")}
        name="email"
        type="email"
        required
        autoComplete="off"
        error={err("email")}
        autoFocus
      />
      <Field label={t("team.fullName")} name="fullName" autoComplete="off" error={err("fullName")} />
      <input type="hidden" name="role" value="staff" />
      <input type="hidden" name="job" value={job} />
      <SelectField
        label={t("team.jobs.label")}
        name="teamJobId"
        value={jobId}
        onChange={(e) => setJobId(e.target.value)}
        hint={t(`team.jobs.${job as "waiter"}.desc`)}
      >
        {usable.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name}
          </option>
        ))}
      </SelectField>
      {STATION_JOBS.includes(job as Job) && stations.length ? (
        <SelectField label={t("team.jobs.station")} name="stationId" defaultValue="">
          <option value="">{t("team.jobs.allStations")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      <Field
        label={`${t("team.password")} (${t("common.optional")})`}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        hint={t("team.passwordHint")}
        error={err("password")}
      />
      <div className="flex justify-end">
        <SubmitButton>{t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddMemberDialog({
  restaurantId,
  roles,
  stations,
  jobs,
}: {
  restaurantId: string;
  roles: ("admin" | "staff")[];
  stations: { id: string; name: string }[];
  jobs: TeamJobView[];
}) {
  const t = useTranslations("team");
  return (
    <Dialog title={t("add")} trigger={(open) => <Button onClick={open}>+ {t("add")}</Button>}>
      <AddMemberForm restaurantId={restaurantId} roles={roles} stations={stations} jobs={jobs} />
    </Dialog>
  );
}

function EditMemberForm({
  restaurantId,
  member,
  roles,
  allPermissions,
  roleDefaults,
  assignable,
}: {
  restaurantId: string;
  member: MemberView;
  roles: ("admin" | "staff")[];
  allPermissions: string[];
  roleDefaults: Record<"admin" | "staff", string[]>;
  /** Permissions the current user holds and may therefore grant. */
  assignable: string[];
}) {
  const t = useTranslations();
  const form = useActionForm(updateMemberAction.bind(null, restaurantId, member.id));
  const state = form.state;
  const [role, setRole] = useState<"admin" | "staff">(member.role === "admin" ? "admin" : "staff");
  const [perms, setPerms] = useState(() => new Set(member.effectivePermissions));
  const [removeError, setRemoveError] = useState<string | null>(null);
  useCloseOnSuccess(state);

  return (
    <div className="space-y-5">
      <ActionForm form={form} className="space-y-4">
        <FormFeedback state={state} />
        {member.accessFromSection ? <input type="hidden" name="keepPermissions" value="1" /> : null}
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t("team.role")}
            name="role"
            value={role}
            onChange={(e) => {
              const r = e.target.value as "admin" | "staff";
              setRole(r);
              setPerms(new Set(roleDefaults[r])); // reset to the new role's defaults
            }}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("team.status")}
            name="status"
            defaultValue={member.status === "disabled" ? "disabled" : "active"}
          >
            <option value="active">{t("team.active")}</option>
            <option value="disabled">{t("team.disabled")}</option>
          </SelectField>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">{t("team.permissions")}</legend>
          <p className="mb-3 text-sm text-fg-muted">
            {member.accessFromSection ? t("team.sections.accessFromSection") : t("team.permissionsHint")}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {allPermissions.map((p) => (
              <Checkbox
                key={p}
                name="permissions"
                value={p}
                label={t(`permissions.${p}`)}
                checked={perms.has(p)}
                disabled={member.accessFromSection || (!assignable.includes(p) && !perms.has(p))}
                onChange={(e) =>
                  setPerms((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(p);
                    else next.delete(p);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      </ActionForm>
      <form
        className="border-t border-border pt-4"
        action={async () => {
          const res = await removeMemberAction(restaurantId, member.id);
          if (res && !res.ok)
            setRemoveError(
              t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"),
            );
        }}
        onSubmit={(e) => {
          if (!window.confirm(t("team.removeConfirm", { name: member.fullName }))) e.preventDefault();
        }}
      >
        {removeError ? (
          <p role="alert" className="mb-2 text-sm text-danger">
            {removeError}
          </p>
        ) : null}
        <SubmitButton variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger">
          {t("team.remove")}
        </SubmitButton>
      </form>
    </div>
  );
}

export function EditMemberDialog(props: Parameters<typeof EditMemberForm>[0]) {
  const t = useTranslations();
  return (
    <Dialog
      size="lg"
      title={props.member.fullName}
      description={props.member.email}
      trigger={(open) => (
        <Button variant="secondary" size="sm" onClick={open}>
          {t("common.edit")}
        </Button>
      )}
    >
      <EditMemberForm {...props} />
    </Dialog>
  );
}
