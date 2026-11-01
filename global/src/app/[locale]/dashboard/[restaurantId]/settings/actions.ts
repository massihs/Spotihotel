"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
import { MAX_UPLOAD_BYTES } from "@/server/infra/images";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { DAY_KEYS, parsePercentToBps } from "@/server/modules/restaurants/schemas";
import {
  createTaxRate,
  deleteTaxRate,
  removeLogo,
  setDefaultTaxRate,
  updateLegal,
  updateProfile,
  updateServiceSettings,
  uploadLogo,
} from "@/server/modules/restaurants/settings";
import type { AppLocale } from "@/i18n/config";
import { updatePaymentSettings } from "@/server/modules/payments/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function updateProfileAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await updateProfile(db, ctx, {
      name: str(fd, "name"),
      email: str(fd, "email"),
      phone: str(fd, "phone"),
      addressLine1: str(fd, "addressLine1"),
      addressLine2: str(fd, "addressLine2"),
      city: str(fd, "city"),
      postalCode: str(fd, "postalCode"),
      country: str(fd, "country"),
      currency: str(fd, "currency"),
      timezone: str(fd, "timezone"),
      defaultLocale: str(fd, "defaultLocale") as AppLocale,
    });
    refresh();
  });
}

export async function updateServiceAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    const autoClose = str(fd, "sessionAutoCloseMinutes");
    const openingHours: Record<string, { open: string; close: string }[]> = {};
    for (const day of DAY_KEYS) {
      const open = str(fd, `${day}.open`);
      const close = str(fd, `${day}.close`);
      openingHours[day] = fd.get(`${day}.closed`) || !open || !close ? [] : [{ open, close }];
    }
    await updateServiceSettings(db, ctx, {
      orderPrefix: str(fd, "orderPrefix"),
      pricesIncludeTax: fd.get("pricesIncludeTax") === "on",
      sessionAutoCloseMinutes: autoClose === "" ? null : Number(autoClose),
      enabledLocales: fd.getAll("enabledLocales").map(String) as AppLocale[],
      openingHours,
    });
    refresh();
  });
}

export async function updateLegalAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await updateLegal(db, ctx, {
      legalName: str(fd, "legalName"),
      legalId: str(fd, "legalId"),
      vatNumber: str(fd, "vatNumber"),
      legalNotice: str(fd, "legalNotice"),
      privacyPolicyUrl: str(fd, "privacyPolicyUrl"),
    });
    refresh();
  });
}

export async function uploadLogoAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await enforceRateLimit("upload", ctx.user.id);
    const file = fd.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "image_empty");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "image_too_large");
    await uploadLogo(db, ctx, Buffer.from(await file.arrayBuffer()));
    refresh();
  });
}

export async function removeLogoAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await removeLogo(db, ctx);
    refresh();
  });
}

export async function createTaxRateAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    const bps = parsePercentToBps(str(fd, "rate"));
    if (bps === null) throw new AppError("VALIDATION", "invalid_rate", { field: "rate" });
    await createTaxRate(db, ctx, { name: str(fd, "name"), rateBps: bps });
    refresh();
  });
}

export async function taxRateCommandAction(restaurantId: string, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    const id = str(fd, "id");
    if (fd.get("command") === "default") await setDefaultTaxRate(db, ctx, id);
    else if (fd.get("command") === "delete") await deleteTaxRate(db, ctx, id);
    refresh();
  });
}

export async function updatePaymentSettingsAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await updatePaymentSettings(db, ctx, {
      onlinePaymentEnabled: fd.get("onlinePaymentEnabled") === "on",
      enabledPaymentProviders: fd.getAll("providers").map(String) as "cash"[],
      requirePaymentBeforeOrder: fd.get("requirePaymentBeforeOrder") === "on",
    });
    refresh();
  });
}
