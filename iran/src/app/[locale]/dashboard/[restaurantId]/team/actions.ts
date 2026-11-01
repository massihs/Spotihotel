"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { isPermission, ROLE_PERMISSIONS, type Permission } from "@/server/auth/permissions";
import { addMember, removeMember, setMemberJob, updateMember } from "@/server/modules/members/service";
import { isJob } from "@/lib/jobs";
import type { z } from "zod";
import { deleteTeamJob, saveTeamJob, type teamJobSchema } from "@/server/modules/team/jobs";
import {
  deleteSection,
  saveGuestCalls,
  saveSection,
  setMemberSections,
  type SectionInput,
} from "@/server/modules/team/sections";

export async function addMemberAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    const password = String(fd.get("password") ?? "");
    const res = await addMember(db, ctx, {
      email: String(fd.get("email") ?? ""),
      fullName: String(fd.get("fullName") ?? ""),
      role: String(fd.get("role") ?? "staff") as "staff",
      job: isJob(fd.get("job")) ? (fd.get("job") as never) : undefined,
      teamJobId: String(fd.get("teamJobId") ?? "") || null,
      stationId: String(fd.get("stationId") ?? "") || null,
      password: password === "" ? undefined : password,
    });
    refresh();
    return { accountCreated: res.accountCreated };
  });
}

/** The form sends the desired permission set; the service stores deltas from the role defaults. */
export async function updateMemberAction(
  restaurantId: string,
  memberId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    const role = String(fd.get("role") ?? "staff") as "staff" | "admin";
    const desired = new Set(fd.getAll("permissions").map(String).filter(isPermission));
    const defaults = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.staff;
    await updateMember(db, ctx, memberId, {
      role,
      grantedPermissions: [...desired].filter((p) => !defaults.has(p)) as Permission[],
      revokedPermissions: [...defaults].filter((p) => !desired.has(p)),
      status: fd.get("status") === "disabled" ? "disabled" : "active",
      keepPermissions: fd.get("keepPermissions") === "1",
    });
    refresh();
  });
}

export async function removeMemberAction(restaurantId: string, memberId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await removeMember(db, ctx, memberId);
    refresh();
  });
}

export async function setMemberJobAction(
  restaurantId: string,
  memberId: string,
  job: string | null,
  stationId: string | null,
  teamJobId: string | null = null,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await setMemberJob(db, ctx, memberId, {
      job: isJob(job) ? job : null,
      stationId: stationId || null,
      teamJobId: teamJobId || null,
    });
    refresh();
  });
}

export async function saveTeamJobAction(restaurantId: string, input: z.input<typeof teamJobSchema>) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await saveTeamJob(db, ctx, input);
    refresh();
  });
}

export async function deleteTeamJobAction(restaurantId: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await deleteTeamJob(db, ctx, id);
    refresh();
  });
}

export async function saveSectionAction(restaurantId: string, id: string | null, input: SectionInput) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await saveSection(db, ctx, id, input);
    refresh();
  });
}

export async function deleteSectionAction(restaurantId: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await deleteSection(db, ctx, id);
    refresh();
  });
}

export async function setMemberSectionsAction(restaurantId: string, memberId: string, ids: string[]) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await setMemberSections(db, ctx, memberId, ids);
    refresh();
  });
}

export async function saveGuestCallsAction(restaurantId: string, calls: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "members.manage");
    await saveGuestCalls(db, ctx, calls);
    refresh();
  });
}
