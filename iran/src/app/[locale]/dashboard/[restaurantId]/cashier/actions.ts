"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  closeShift,
  openShift,
  saveCashierSettings,
  searchFolios,
  type cashierSettingsSchema,
  type closeShiftSchema,
} from "@/server/modules/pms/cashier";
import { moveLine } from "@/server/modules/pms/folios";
import type { z } from "zod";

export async function openShiftAction(rid: string, floatCents: number | null) {
  return runAction(async () => {
    await openShift(db, await actionContext(rid, "folio.post"), { floatCents });
    refresh();
  });
}

export async function closeShiftAction(rid: string, input: z.input<typeof closeShiftSchema>) {
  return runAction(async () => {
    const r = await closeShift(db, await actionContext(rid, "folio.post"), input);
    refresh();
    return { differenceCents: r.differenceCents, expectedCashCents: r.expectedCashCents };
  });
}

export async function saveCashierSettingsAction(rid: string, input: z.input<typeof cashierSettingsSchema>) {
  return runAction(async () => {
    await saveCashierSettings(db, await actionContext(rid, "folio.adjust"), input);
    refresh();
  });
}

export async function searchFoliosAction(rid: string, q: string) {
  return runAction(async () => searchFolios(db, await actionContext(rid, "folio.post"), q));
}

/** جابجایی حساب: several postings moved to another open folio, one by one (each audited). */
export async function moveLinesAction(rid: string, lineIds: string[], toFolioId: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "folio.adjust");
    for (const id of lineIds.slice(0, 200)) await moveLine(db, ctx, id, toFolioId);
    refresh();
    return lineIds.length;
  });
}
