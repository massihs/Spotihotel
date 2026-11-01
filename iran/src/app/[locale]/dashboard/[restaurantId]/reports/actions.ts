"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { createExpense, deleteExpense, type EXPENSE_CATEGORIES } from "@/server/modules/reports/service";

export async function createExpenseAction(
  rid: string,
  input: {
    category: (typeof EXPENSE_CATEGORIES)[number];
    amountCents: number;
    description: string;
    method: "cash" | "card" | "transfer";
    paidAt: string;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "accounting.manage");
    await createExpense(db, ctx, input);
    refresh();
  });
}

export async function deleteExpenseAction(rid: string, id: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "accounting.manage");
    await deleteExpense(db, ctx, id);
    refresh();
  });
}
