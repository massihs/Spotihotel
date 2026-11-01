"use server";

import { refresh, updateTag } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { validation } from "@/server/errors";
import { menuTag } from "@/server/modules/menu/cache";
import { applyMenuImport, previewMenuImport } from "@/server/modules/menu/import";

async function fileBytes(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw validation("import_empty");
  return new Uint8Array(await file.arrayBuffer());
}

export async function previewImportAction(restaurantId: string, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    return previewMenuImport(db, ctx, await fileBytes(formData));
  });
}

export async function applyImportAction(restaurantId: string, formData: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId);
    const res = await applyMenuImport(db, ctx, await fileBytes(formData));
    updateTag(menuTag(restaurantId));
    refresh();
    return res;
  });
}
