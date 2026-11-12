"use server";

import { refresh } from "next/cache";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { pmsSettings } from "@/server/db/schema";
import { actionContext, runAction } from "@/server/actions";
import { assertCan } from "@/server/tenancy";
import {
  cancelServiceTicket,
  createServiceTicket,
  deleteServiceItem,
  isServiceKind,
  saveServiceItem,
  saveServicesSettings,
  setServiceTicketStatus,
  settleServiceTicket,
  type serviceItemSchema,
  type ServicesSection,
  type serviceTicketSchema,
} from "@/server/modules/hotel/services";
import {
  createInternetAccount,
  deleteInternetAccount,
  deleteInternetProfile,
  saveInternetProfile,
  setInternetAccountStatus,
  updateInternetAccount,
  type internetAccountSchema,
  type internetProfileSchema,
} from "@/server/modules/hotel/internet";
import { sendTvMessage, setRoomTv, type tvSetSchema } from "@/server/modules/hotel/tv";
import {
  deleteEquipment,
  markServiced,
  saveEquipment,
  type equipmentSchema,
} from "@/server/modules/hotel/engineering";
import {
  addLogEntry,
  closeLogEntry,
  runHkOperation,
  type logEntrySchema,
} from "@/server/modules/hotel/hk-extra";
import { validation } from "@/server/errors";

type In<T extends z.ZodType> = z.input<T>;
const kindOf = (k: string) => {
  if (!isServiceKind(k)) throw validation("unknown_kind");
  return k;
};
const done = <T>(v: T) => {
  refresh();
  return v;
};

// ─── Laundry and damages ─────────────────────────────────────────────────────

export const saveServiceItemAction = async (
  rid: string,
  kind: string,
  id: string | null,
  input: In<typeof serviceItemSchema>,
) =>
  runAction(async () =>
    done((await saveServiceItem(db, await actionContext(rid, "rates.manage"), kindOf(kind), id, input)).id),
  );

export const deleteServiceItemAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteServiceItem(db, await actionContext(rid, "rates.manage"), id)));

export const createServiceTicketAction = async (
  rid: string,
  kind: string,
  input: In<typeof serviceTicketSchema>,
) =>
  runAction(async () => {
    const t = await createServiceTicket(db, await actionContext(rid, "folio.post"), kindOf(kind), input);
    return done({ id: t.id, number: t.number, totalCents: t.totalCents });
  });

export const settleServiceTicketAction = async (
  rid: string,
  id: string,
  how: "room" | "cash" | "card" | "pos" | "waived",
) =>
  runAction(async () =>
    done(
      await settleServiceTicket(
        db,
        await actionContext(rid, how === "waived" ? "folio.adjust" : "folio.post"),
        id,
        how,
      ),
    ),
  );

export const setServiceTicketStatusAction = async (rid: string, id: string, status: string) =>
  runAction(async () =>
    done(await setServiceTicketStatus(db, await actionContext(rid, "orders.update_status"), id, status)),
  );

export const cancelServiceTicketAction = async (rid: string, id: string) =>
  runAction(async () => done(await cancelServiceTicket(db, await actionContext(rid, "folio.adjust"), id)));

export const saveServicesSettingsAction = async (rid: string, section: ServicesSection, input: unknown) =>
  runAction(async () => {
    await saveServicesSettings(db, await actionContext(rid, "rates.manage"), section, input);
    refresh();
  });

/** Minibar: may guests declare what they took, from the room's QR. */
export const saveMinibarSettingsAction = async (rid: string, selfService: boolean) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "rates.manage");
    assertCan(ctx, "rates.manage");
    await db
      .update(pmsSettings)
      .set({ minibarSelfService: !!selfService })
      .where(eq(pmsSettings.restaurantId, ctx.restaurant.id));
    refresh();
  });

// ─── Internet ────────────────────────────────────────────────────────────────

export const saveInternetProfileAction = async (
  rid: string,
  id: string | null,
  input: In<typeof internetProfileSchema>,
) =>
  runAction(async () =>
    done((await saveInternetProfile(db, await actionContext(rid, "rates.manage"), id, input)).id),
  );

export const deleteInternetProfileAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteInternetProfile(db, await actionContext(rid, "rates.manage"), id)));

export const createInternetAccountAction = async (rid: string, input: In<typeof internetAccountSchema>) =>
  runAction(async () => {
    const a = await createInternetAccount(db, await actionContext(rid, "folio.post"), input);
    return done({ username: a.username, password: a.password });
  });

export const setInternetAccountStatusAction = async (rid: string, id: string, status: string) =>
  runAction(async () =>
    done(await setInternetAccountStatus(db, await actionContext(rid, "folio.post"), id, status)),
  );

export const updateInternetAccountAction = async (
  rid: string,
  id: string,
  op: { resetPassword?: boolean; extendDays?: number },
) =>
  runAction(async () =>
    done(await updateInternetAccount(db, await actionContext(rid, "folio.post"), id, op)),
  );

export const deleteInternetAccountAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteInternetAccount(db, await actionContext(rid, "folio.adjust"), id)));

// ─── TV ──────────────────────────────────────────────────────────────────────

export const setRoomTvAction = async (rid: string, roomId: string, input: In<typeof tvSetSchema>) =>
  runAction(async () =>
    done(await setRoomTv(db, await actionContext(rid, "frontdesk.manage"), roomId, input)),
  );

export const sendTvMessageAction = async (rid: string, roomId: string | null, text: string) =>
  runAction(async () =>
    done(await sendTvMessage(db, await actionContext(rid, "frontdesk.manage"), roomId, text)),
  );

// ─── Engineering ─────────────────────────────────────────────────────────────

export const saveEquipmentAction = async (
  rid: string,
  id: string | null,
  input: In<typeof equipmentSchema>,
) =>
  runAction(async () =>
    done((await saveEquipment(db, await actionContext(rid, "tables.manage"), id, input)).id),
  );

export const deleteEquipmentAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteEquipment(db, await actionContext(rid, "tables.manage"), id)));

export const markServicedAction = async (rid: string, id: string, note?: string) =>
  runAction(async () =>
    done(await markServiced(db, await actionContext(rid, "orders.update_status"), id, note)),
  );

// ─── Housekeeping ────────────────────────────────────────────────────────────

export const addLogEntryAction = async (rid: string, input: In<typeof logEntrySchema>) =>
  runAction(async () =>
    done((await addLogEntry(db, await actionContext(rid, "orders.update_status"), input)).id),
  );

export const closeLogEntryAction = async (rid: string, id: string, reopen = false) =>
  runAction(async () =>
    done(await closeLogEntry(db, await actionContext(rid, "orders.update_status"), id, reopen)),
  );

export const runHkOperationAction = async (rid: string, op: string) =>
  runAction(async () => done(await runHkOperation(db, await actionContext(rid, "tables.manage"), op)));
