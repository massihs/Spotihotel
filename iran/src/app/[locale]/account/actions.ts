"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";
import { runAction } from "@/server/actions";
import { requestMeta } from "@/server/auth/current";
import { endDinerSession, getCurrentDiner, startDinerSession } from "@/server/auth/diner";
import { db } from "@/server/db/client";
import { AppError } from "@/server/errors";
import type { Nutrition } from "@/lib/nutrition";
import { getGuest } from "@/server/modules/guest/current";
import {
  claimSeatOrders,
  clearDinerHistory,
  deleteDiner,
  loginWithEmail,
  requestPhoneCode,
  setCalorieTracking,
  signupWithEmail,
  updateDinerProfile,
  verifyPhoneCode,
} from "@/server/modules/diners/service";

async function signedIn(dinerId: string) {
  await startDinerSession(dinerId);
  // Signing in from a table: what this seat already ordered counts too.
  const guest = await getGuest().catch(() => null);
  if (guest) await claimSeatOrders(db, dinerId, guest.participant.id);
}

async function requireDiner() {
  const d = await getCurrentDiner();
  if (!d) throw new AppError("UNAUTHENTICATED", "signed_out");
  return d;
}

export async function sendCodeAction(phone: string) {
  return runAction(async () => {
    const { ip } = await requestMeta();
    const res = await requestPhoneCode(db, phone, { ip });
    return { phone: res.phone };
  });
}

/** Signs in with the code — or, when already signed in, adds this verified number to the account. */
export async function verifyCodeAction(phone: string, code: string) {
  return runAction(async () => {
    const current = await getCurrentDiner();
    const diner = await verifyPhoneCode(db, {
      phone,
      code,
      attachTo: current?.id ?? null,
      locale: await getLocale(),
    });
    if (!current) await signedIn(diner.id);
    refresh();
  });
}

export async function emailLoginAction(email: string, password: string) {
  return runAction(async () => {
    const { ip } = await requestMeta();
    const diner = await loginWithEmail(db, { email, password }, { ip });
    if (!diner) throw new AppError("VALIDATION", "invalid_credentials");
    await signedIn(diner.id);
    refresh();
  });
}

export async function emailSignupAction(name: string, email: string, password: string) {
  return runAction(async () => {
    const { ip } = await requestMeta();
    const diner = await signupWithEmail(db, { name, email, password }, { ip, locale: await getLocale() });
    await signedIn(diner.id);
    refresh();
  });
}

export async function logoutDinerAction() {
  return runAction(async () => {
    await endDinerSession();
    refresh();
  });
}

export async function saveProfileAction(input: { name?: string; goals?: Nutrition | null }) {
  return runAction(async () => {
    const d = await requireDiner();
    await updateDinerProfile(db, d.id, { name: input.name, goals: input.goals });
    refresh();
  });
}

export async function clearHistoryAction() {
  return runAction(async () => {
    const d = await requireDiner();
    await clearDinerHistory(db, d.id);
    refresh();
  });
}

export async function deleteAccountAction(confirm: string) {
  return runAction(async () => {
    const d = await requireDiner();
    if (confirm !== "DELETE") throw new AppError("VALIDATION", "confirm_required");
    await deleteDiner(db, d.id);
    await endDinerSession();
    refresh();
  });
}

/** Sign-up question: count calories (with the body profile) or not. */
export async function saveCalorieTrackingAction(input: {
  track: boolean;
  body?: { sex: string; age: number; weightKg: number; heightCm: number; activity: string; goal: string };
}) {
  return runAction(async () => {
    const d = await requireDiner();
    await setCalorieTracking(db, d.id, {
      track: input.track,
      body: input.body as Parameters<typeof setCalorieTracking>[2]["body"],
    });
    refresh();
  });
}
