"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { AppError } from "@/server/errors";
import { MAX_UPLOAD_BYTES } from "@/server/infra/images";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { parseMoney } from "@/lib/money";
import type { RestaurantContext } from "@/server/tenancy";
import { menuTag } from "@/server/modules/menu/cache";
import {
  addTemplateCategories,
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "@/server/modules/menu/categories";
import {
  createProduct,
  deleteProduct,
  reorderProducts,
  setProductFlags,
  updateProduct,
} from "@/server/modules/menu/products";
import { addProductImage, deleteProductImage, setPrimaryImage } from "@/server/modules/menu/images";
import { createOptionGroup, deleteOptionGroup, updateOptionGroup } from "@/server/modules/menu/options";
import type { Allergen } from "@/server/modules/menu/schemas";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const optInt = (fd: FormData, k: string) => {
  const v = str(fd, k).trim();
  return v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN;
};
const money = (fd: FormData, k: string, required: boolean) => {
  const v = str(fd, k).trim();
  if (v === "") {
    if (required) throw new AppError("VALIDATION", "invalid_price", { field: k });
    return null;
  }
  const c = parseMoney(v);
  if (c === null) throw new AppError("VALIDATION", "invalid_price", { field: k });
  return c;
};

/** Menu changed: re-render the dashboard and expire the cached public menu. */
function menuChanged(ctx: RestaurantContext) {
  updateTag(menuTag(ctx.restaurant.id));
  refresh();
}

// ─── Categories ──────────────────────────────────────────────────────────────

const categoryFields = (fd: FormData) => ({
  name: str(fd, "name"),
  description: str(fd, "description"),
  isActive: fd.get("isActive") === "on",
});

export async function createCategoryAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    const c = await createCategory(db, ctx, categoryFields(fd));
    menuChanged(ctx);
    return { id: c.id };
  });
}

export async function updateCategoryAction(
  restaurantId: string,
  categoryId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await updateCategory(db, ctx, categoryId, categoryFields(fd));
    menuChanged(ctx);
  });
}

export async function deleteCategoryAction(restaurantId: string, categoryId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await deleteCategory(db, ctx, categoryId);
    menuChanged(ctx);
  });
}

/** Template names are stored in the restaurant's default language, not the manager's UI language. */
export async function addTemplateCategoriesAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    const t = await getTranslations({ locale: ctx.restaurant.defaultLocale, namespace: "categoryTemplates" });
    const keys = fd.getAll("templates").map(String);
    const res = await addTemplateCategories(
      db,
      ctx,
      keys.filter((k) => t.has(k)).map((key) => ({ key, name: t(key) })),
    );
    menuChanged(ctx);
    return res;
  });
}

export async function reorderCategoriesAction(restaurantId: string, ids: string[]) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await reorderCategories(db, ctx, ids);
    menuChanged(ctx);
  });
}

// ─── Products ────────────────────────────────────────────────────────────────

function productFields(fd: FormData) {
  const customTags = str(fd, "customTags")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
  return {
    categoryId: str(fd, "categoryId"),
    name: str(fd, "name"),
    description: str(fd, "description"),
    priceCents: money(fd, "price", true)!,
    compareAtPriceCents: money(fd, "compareAt", false),
    taxRateId: str(fd, "taxRateId") || null,
    ingredients: str(fd, "ingredients"),
    allergens: fd.getAll("allergens").map(String) as Allergen[],
    caloriesKcal: optInt(fd, "caloriesKcal"),
    weightGrams: optInt(fd, "weightGrams"),
    tags: [...new Set([...fd.getAll("tags").map(String), ...customTags])],
    isActive: fd.get("isActive") === "on",
    isAvailable: fd.get("isAvailable") === "on",
    isFeatured: fd.get("isFeatured") === "on",
    optionGroupIds: fd.getAll("optionGroupIds").map(String),
  };
}

export async function createProductAction(restaurantId: string, _prev: unknown, fd: FormData) {
  const res = await runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    const p = await createProduct(db, ctx, productFields(fd));
    updateTag(menuTag(ctx.restaurant.id));
    return { id: p.id };
  });
  // Continue on the edit page, where photos can be added.
  if (res?.ok && res.data) redirect(`/dashboard/${restaurantId}/menu/products/${res.data.id}?created=1`);
  return res;
}

export async function updateProductAction(
  restaurantId: string,
  productId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await updateProduct(db, ctx, productId, productFields(fd));
    menuChanged(ctx);
  });
}

export async function deleteProductAction(restaurantId: string, productId: string, categoryId: string) {
  const res = await runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await deleteProduct(db, ctx, productId);
    updateTag(menuTag(ctx.restaurant.id));
  });
  if (res?.ok) redirect(`/dashboard/${restaurantId}/menu?category=${categoryId}`);
  return res;
}

export async function setProductFlagAction(
  restaurantId: string,
  productId: string,
  flag: "isAvailable" | "isActive",
  value: boolean,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    await setProductFlags(db, ctx, productId, { [flag]: value });
    menuChanged(ctx);
  });
}

export async function reorderProductsAction(restaurantId: string, categoryId: string, ids: string[]) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await reorderProducts(db, ctx, categoryId, ids);
    menuChanged(ctx);
  });
}

export async function uploadProductImageAction(
  restaurantId: string,
  productId: string,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await enforceRateLimit("upload", ctx.user.id);
    const file = fd.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new AppError("VALIDATION", "image_empty");
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "image_too_large");
    await addProductImage(db, ctx, productId, Buffer.from(await file.arrayBuffer()));
    menuChanged(ctx);
  });
}

export async function productImageCommandAction(
  restaurantId: string,
  imageId: string,
  command: "primary" | "delete",
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    if (command === "primary") await setPrimaryImage(db, ctx, imageId);
    else await deleteProductImage(db, ctx, imageId);
    menuChanged(ctx);
  });
}

// ─── Option groups ───────────────────────────────────────────────────────────

/** Values arrive as parallel arrays: values.id[], values.name[], values.delta[] … */
function optionGroupFields(fd: FormData) {
  const ids = fd.getAll("values.id").map(String);
  const names = fd.getAll("values.name").map(String);
  const deltas = fd.getAll("values.delta").map(String);
  const defaults = new Set(fd.getAll("values.default").map(String));
  const unavailable = new Set(fd.getAll("values.unavailable").map(String));
  const keys = fd.getAll("values.key").map(String);
  return {
    name: str(fd, "name"),
    description: str(fd, "description"),
    minSelect: optInt(fd, "minSelect") ?? 0,
    maxSelect: optInt(fd, "maxSelect") ?? 1,
    values: names
      .map((name, i) => {
        const delta = deltas[i]?.trim() ? parseMoney(deltas[i]!) : 0;
        if (delta === null)
          throw new AppError("VALIDATION", "invalid_price", { field: `values.${i}.priceDeltaCents` });
        return {
          id: ids[i] || undefined,
          name,
          priceDeltaCents: delta,
          isDefault: defaults.has(keys[i]!),
          isAvailable: !unavailable.has(keys[i]!),
        };
      })
      .filter((v) => v.name.trim() !== "" || v.id),
  };
}

export async function saveOptionGroupAction(
  restaurantId: string,
  groupId: string | null,
  _prev: unknown,
  fd: FormData,
) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    const input = optionGroupFields(fd);
    if (groupId) await updateOptionGroup(db, ctx, groupId, input);
    else await createOptionGroup(db, ctx, input);
    menuChanged(ctx);
  });
}

export async function deleteOptionGroupAction(restaurantId: string, groupId: string) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "menu.manage");
    await deleteOptionGroup(db, ctx, groupId);
    menuChanged(ctx);
  });
}
