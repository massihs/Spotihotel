"use server";

import { refresh } from "next/cache";
import type { z } from "zod";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  assignHousekeeper,
  createTicket,
  distributeRooms,
  setTicketStatus,
  type TICKET_STATUSES,
  type ticketSchema,
} from "@/server/modules/hotel/housekeeping";

export async function assignHousekeeperAction(rid: string, roomIds: string[], userId: string | null) {
  return runAction(async () => {
    const r = await assignHousekeeper(db, await actionContext(rid, "tables.manage"), { roomIds, userId });
    refresh();
    return r;
  });
}

export async function distributeRoomsAction(rid: string, userIds: string[]) {
  return runAction(async () => {
    const r = await distributeRooms(db, await actionContext(rid, "tables.manage"), userIds);
    refresh();
    return r;
  });
}

export async function createTicketAction(rid: string, input: z.input<typeof ticketSchema>) {
  return runAction(async () => {
    const t = await createTicket(db, await actionContext(rid, "orders.update_status"), input);
    refresh();
    return { id: t.id };
  });
}

export async function setTicketStatusAction(
  rid: string,
  id: string,
  status: (typeof TICKET_STATUSES)[number],
  resolution?: string | null,
) {
  return runAction(async () => {
    await setTicketStatus(db, await actionContext(rid, "orders.update_status"), id, status, resolution);
    refresh();
  });
}
