"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { requireSuperAdmin } from "@/server/auth/current";
import { runAction } from "@/server/actions";
import {
  activateSubscription,
  cancelSubscription,
  createTheme,
  deleteTheme,
  deleteTrack,
  setTrackActive,
  updateTheme,
} from "@/server/modules/music/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function createThemeAction(_prev: unknown, fd: FormData) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    const theme = await createTheme(db, admin, {
      name: str(fd, "name"),
      description: str(fd, "description"),
      color: str(fd, "color") || undefined,
    });
    refresh();
    return { id: theme.id };
  });
}

export async function setThemeFlagAction(id: string, flag: "isActive" | "radioEnabled", value: boolean) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await updateTheme(db, admin, id, { [flag]: value });
    refresh();
  });
}

export async function deleteThemeAction(id: string) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await deleteTheme(db, admin, id);
    refresh();
  });
}

export async function setTrackActiveAction(id: string, value: boolean) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await setTrackActive(db, admin, id, value);
    refresh();
  });
}

export async function deleteTrackAction(id: string) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await deleteTrack(db, admin, id);
    refresh();
  });
}

export async function activateSubscriptionAction(id: string) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await activateSubscription(db, admin, id);
    refresh();
  });
}

export async function cancelSubscriptionAction(id: string) {
  return runAction(async () => {
    const admin = await requireSuperAdmin();
    await cancelSubscription(db, admin, id);
    refresh();
  });
}
