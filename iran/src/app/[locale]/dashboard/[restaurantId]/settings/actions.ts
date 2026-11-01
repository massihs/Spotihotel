"use server";

import { revokeDevice } from "@/server/modules/offline/service";

import { isBrandColor } from "@/lib/brand-colors";
import { isMenuTheme, type MenuTheme } from "@/lib/menu-themes";
import { isRestaurantKind, type RestaurantKind } from "@/lib/restaurant-kind";
import { refresh, updateTag } from "next/cache";
import { isCuisine } from "@/lib/directory";
import {
  DIRECTORY_TAG,
  chooseDishCover,
  resetCover,
  updateListing,
  uploadCover,
} from "@/server/modules/directory/service";
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
  setModuleEnabled,
  setDefaultTaxRate,
  updateLegal,
  updateProfile,
  updateServiceSettings,
  uploadLogo,
} from "@/server/modules/restaurants/settings";
import type { AppLocale } from "@/i18n/config";
import { updatePaymentSettings } from "@/server/modules/payments/service";
import {
  deletePrinter,
  newAgentToken,
  previewTicket,
  savePrinter,
  setCashierAcceptance,
  setPrinterActive,
  testPrinter,
} from "@/server/modules/printing/service";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function updateProfileAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await updateProfile(db, ctx, {
      name: str(fd, "name"),
      kind: isRestaurantKind(str(fd, "kind")) ? (str(fd, "kind") as RestaurantKind) : undefined,
      brandColor: isBrandColor(str(fd, "brandColor")) ? str(fd, "brandColor") : undefined,
      menuTheme: isMenuTheme(str(fd, "menuTheme")) ? (str(fd, "menuTheme") as MenuTheme) : undefined,
      menuShortPrices: fd.get("menuShortPrices") === "on",
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
    updateTag(DIRECTORY_TAG);
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
    updateTag(DIRECTORY_TAG);
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
      registrationNumber: str(fd, "registrationNumber"),
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
    updateTag(DIRECTORY_TAG);
    refresh();
  });
}

export async function removeLogoAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await removeLogo(db, ctx);
    updateTag(DIRECTORY_TAG);
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
      zarinpalMerchantId: fd.has("zarinpalMerchantId") ? String(fd.get("zarinpalMerchantId")) : undefined,
    });
    refresh();
  });
}

export async function setModuleAction(restaurantId: string, module: string, enabled: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await setModuleEnabled(db, ctx, module, enabled);
    refresh();
  });
}

// ─── Printers ────────────────────────────────────────────────────────────────

export async function savePrinterAction(
  restaurantId: string,
  printerId: string | null,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await savePrinter(db, ctx, printerId, {
      name: str(fd, "name"),
      host: str(fd, "host"),
      port: Number(str(fd, "port") || 9100),
      paperMm: str(fd, "paperMm") === "58" ? 58 : 80,
      target: (["cashier", "station", "all"].includes(str(fd, "target"))
        ? str(fd, "target")
        : "station") as "station",
      stationId: str(fd, "stationId") || null,
      copies: Number(str(fd, "copies") || 1),
    });
    refresh();
  });
}

export async function printerCommandAction(restaurantId: string, printerId: string, command: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    if (command === "test") await testPrinter(db, ctx, printerId);
    else if (command === "delete") await deletePrinter(db, ctx, printerId);
    else if (command === "on" || command === "off")
      await setPrinterActive(db, ctx, printerId, command === "on");
    refresh();
  });
}

export async function previewPrinterAction(restaurantId: string, printerId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.view");
    const png = await previewTicket(db, ctx, printerId);
    return `data:image/png;base64,${png.toString("base64")}`;
  });
}

export async function newAgentTokenAction(restaurantId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    const token = await newAgentToken(db, ctx);
    refresh();
    return token;
  });
}

export async function setCashierAcceptanceAction(restaurantId: string, on: boolean) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await setCashierAcceptance(db, ctx, on);
    refresh();
  });
}

export async function updateListingAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    const level = Number(str(fd, "priceLevel"));
    await updateListing(db, ctx, {
      listed: fd.get("listed") === "on",
      cuisines: fd.getAll("cuisines").map(String).filter(isCuisine),
      priceLevel: level >= 1 && level <= 4 ? level : null,
      showPublicPrices: fd.get("showPublicPrices") === "on",
      tagline: str(fd, "tagline"),
      city: str(fd, "city"),
      latitude: str(fd, "latitude"),
      longitude: str(fd, "longitude"),
    });
    updateTag(DIRECTORY_TAG);
    refresh();
  });
}

export async function uploadCoverAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await enforceRateLimit("upload", ctx.user.id);
    const file = fd.get("cover");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "image_empty");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "image_too_large");
    await uploadCover(db, ctx, Buffer.from(await file.arrayBuffer()));
    updateTag(DIRECTORY_TAG);
    refresh();
  });
}

/** `imageId` = a dish photo; null = back to the automatic choice. */
export async function chooseCoverAction(restaurantId: string, imageId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    if (imageId) await chooseDishCover(db, ctx, imageId);
    else await resetCover(db, ctx);
    updateTag(DIRECTORY_TAG);
    refresh();
  });
}

export async function revokeDeviceAction(restaurantId: string, deviceId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "restaurant.manage");
    await revokeDevice(db, ctx, deviceId);
    refresh();
  });
}
