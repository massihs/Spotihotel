"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  adjustStock,
  createPurchase,
  createStockItem,
  createSupplier,
  deleteStockItem,
  deleteSupplier,
  setRecipe,
  updateStockItem,
  type STOCK_UNITS,
} from "@/server/modules/inventory/service";

type Unit = (typeof STOCK_UNITS)[number];

export async function createStockItemAction(
  rid: string,
  input: {
    name: string;
    unit: Unit;
    lowStockThreshold: number;
    initialQuantity: number;
    unitCostCents: number;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await createStockItem(db, ctx, input);
    refresh();
  });
}

export async function updateStockItemAction(
  rid: string,
  id: string,
  input: { name: string; unit: Unit; lowStockThreshold: number },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await updateStockItem(db, ctx, id, input);
    refresh();
  });
}

export async function deleteStockItemAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await deleteStockItem(db, ctx, id);
    refresh();
  });
}

export async function adjustStockAction(
  rid: string,
  id: string,
  kind: "count" | "waste",
  quantity: number,
  note: string,
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await adjustStock(db, ctx, id, { kind, quantity, note });
    refresh();
  });
}

export async function createSupplierAction(
  rid: string,
  input: { name: string; phone: string; note: string },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await createSupplier(db, ctx, input);
    refresh();
  });
}

export async function deleteSupplierAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await deleteSupplier(db, ctx, id);
    refresh();
  });
}

export async function createPurchaseAction(
  rid: string,
  input: {
    supplierId: string | null;
    reference: string;
    note: string;
    lines: { stockItemId: string; quantity: number; unitCostCents: number }[];
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await createPurchase(db, ctx, input);
    refresh();
  });
}

export async function setRecipeAction(
  rid: string,
  productId: string,
  items: { stockItemId: string; quantity: number }[],
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "inventory.manage");
    await setRecipe(db, ctx, productId, { items });
    refresh();
  });
}
