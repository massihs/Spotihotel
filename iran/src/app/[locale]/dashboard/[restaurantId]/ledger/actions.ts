"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  createManualEntry,
  lockBooks,
  openBooks,
  reconcile,
  reverseEntry,
  saveLedgerAccount,
  setBudget,
  type accountSchema,
  type budgetSchema,
  type manualEntrySchema,
} from "@/server/modules/ledger/service";
import { paySupplier, setChequeStatus, type supplierPaymentSchema } from "@/server/modules/ledger/finance";

const done = <T>(v: T) => {
  refresh();
  return v;
};

export const syncBooksAction = async (rid: string) =>
  runAction(async () => done(await openBooks(db, await actionContext(rid, "accounting.manage"))));
export const manualEntryAction = async (rid: string, input: z.input<typeof manualEntrySchema>) =>
  runAction(async () =>
    done((await createManualEntry(db, await actionContext(rid, "accounting.manage"), input)).id),
  );
export const reverseEntryAction = async (rid: string, id: string) =>
  runAction(async () => done((await reverseEntry(db, await actionContext(rid, "accounting.manage"), id)).id));
export const lockBooksAction = async (rid: string, until: string | null) =>
  runAction(async () => done(await lockBooks(db, await actionContext(rid, "accounting.manage"), until)));
export const budgetAction = async (rid: string, input: z.input<typeof budgetSchema>) =>
  runAction(async () => done(await setBudget(db, await actionContext(rid, "accounting.manage"), input)));
export const ledgerAccountAction = async (
  rid: string,
  id: string | null,
  input: z.input<typeof accountSchema>,
) =>
  runAction(async () =>
    done((await saveLedgerAccount(db, await actionContext(rid, "accounting.manage"), id, input)).id),
  );
export const reconcileAction = async (rid: string, accountId: string, ids: string[], matched: boolean) =>
  runAction(async () =>
    done(await reconcile(db, await actionContext(rid, "accounting.manage"), accountId, ids, matched)),
  );
export const chequeStatusAction = async (rid: string, id: string, status: string, on?: string) =>
  runAction(async () =>
    done(await setChequeStatus(db, await actionContext(rid, "accounting.manage"), id, status, on)),
  );
export const paySupplierAction = async (rid: string, input: z.input<typeof supplierPaymentSchema>) =>
  runAction(async () =>
    done((await paySupplier(db, await actionContext(rid, "accounting.manage"), input)).id),
  );
