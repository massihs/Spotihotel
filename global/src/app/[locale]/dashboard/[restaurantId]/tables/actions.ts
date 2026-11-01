"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  bulkCreateTables,
  createTable,
  deleteTable,
  regenerateQr,
  setQrEnabled,
  updateTable,
} from "@/server/modules/tables/service";

const intOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number.isInteger(Number(s)) ? Number(s) : NaN;
};

const tableFields = (fd: FormData) => ({
  label: String(fd.get("label") ?? ""),
  capacity: intOrNull(fd.get("capacity")),
  zone: String(fd.get("zone") ?? ""),
});

export async function createTableAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "tables.manage");
    await createTable(db, ctx, tableFields(fd));
    refresh();
  });
}

export async function updateTableAction(restaurantId: string, tableId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "tables.manage");
    await updateTable(db, ctx, tableId, { ...tableFields(fd), number: intOrNull(fd.get("number")) });
    refresh();
  });
}

export async function bulkCreateTablesAction(restaurantId: string, _prev: unknown, fd: FormData) {
  return runAction(async () => {
    const ctx = await actionContext(restaurantId, "tables.manage");
    const res = await bulkCreateTables(db, ctx, {
      from: intOrNull(fd.get("from")) ?? NaN,
      to: intOrNull(fd.get("to")) ?? NaN,
      prefix: String(fd.get("prefix") ?? ""),
      capacity: intOrNull(fd.get("capacity")),
      zone: String(fd.get("zone") ?? ""),
    });
    refresh();
    return res;
  });
}

/** Simple form actions (no result state): toggle, regenerate, delete. */
export async function tableCommandAction(restaurantId: string, fd: FormData) {
  const tableId = String(fd.get("tableId") ?? "");
  const command = String(fd.get("command") ?? "");
  const res = await runAction(async () => {
    const ctx = await actionContext(restaurantId, "tables.manage");
    if (command === "regenerate") await regenerateQr(db, ctx, tableId);
    else if (command === "enable") await setQrEnabled(db, ctx, tableId, true);
    else if (command === "disable") await setQrEnabled(db, ctx, tableId, false);
    else if (command === "delete") await deleteTable(db, ctx, tableId);
    refresh();
  });
  return res;
}
