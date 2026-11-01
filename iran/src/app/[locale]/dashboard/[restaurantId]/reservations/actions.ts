"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import { validation } from "@/server/errors";
import {
  addToQueue,
  availability,
  createBooking,
  customerByPhone,
  setReservationStatus,
  updateBooking,
  updateReservationSettings,
} from "@/server/modules/reservations/service";
import { wallTime } from "@/lib/period";
import { getTranslations } from "next-intl/server";
import { saveFloorPlan, seatWalkIn } from "@/server/modules/reservations/floor";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

/** Day and time are the restaurant's wall clock, whatever the device's time zone. */
function at(ctx: { restaurant: { timezone: string } }, day: string, time: string) {
  if (!DAY.test(day) || !TIME.test(time)) throw validation("invalid_time");
  return wallTime(day, time, ctx.restaurant.timezone);
}

export async function createBookingAction(
  rid: string,
  input: {
    name: string;
    phone: string;
    partySize: number;
    day: string;
    time: string;
    durationMin?: number;
    /** undefined = automatic, null = no table. */
    tableId?: string | null;
    note: string;
    area: "any" | "indoor" | "outdoor";
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    const { day, time, ...rest } = input;
    await createBooking(db, ctx, { ...rest, startsAt: at(ctx, day, time) });
    refresh();
  });
}

export async function updateBookingAction(
  rid: string,
  id: string,
  input: {
    name?: string;
    phone?: string;
    partySize?: number;
    day?: string;
    time?: string;
    durationMin?: number;
    tableId?: string | null;
    note?: string;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    const { day, time, ...rest } = input;
    await updateBooking(db, ctx, id, {
      ...rest,
      ...(day && time ? { startsAt: at(ctx, day, time) } : {}),
    });
    refresh();
  });
}

export async function availabilityAction(
  rid: string,
  q: {
    day: string;
    time: string;
    durationMin?: number;
    partySize: number;
    phone?: string;
    excludeId?: string;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.view");
    const res = await availability(db, ctx, { ...q, startsAt: at(ctx, q.day, q.time) });
    return {
      ...res,
      duplicate: res.duplicate
        ? { name: res.duplicate.name, startsAt: res.duplicate.startsAt.toISOString() }
        : null,
      tables: res.tables.map((t) => ({
        ...t,
        takenBy: t.takenBy ? { name: t.takenBy.name, startsAt: t.takenBy.startsAt.toISOString() } : null,
      })),
    };
  });
}

export async function customerByPhoneAction(rid: string, phone: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.view");
    return customerByPhone(db, ctx, phone);
  });
}

export async function addToQueueAction(
  rid: string,
  input: { name: string; phone: string; partySize: number },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    const r = await addToQueue(db, ctx, input);
    refresh();
    return { number: r.queueNumber };
  });
}

export async function setReservationStatusAction(rid: string, id: string, to: string) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    await setReservationStatus(db, ctx, id, to);
    refresh();
  });
}

export async function updateReservationSettingsAction(
  rid: string,
  input: {
    enabled: boolean;
    autoConfirm: boolean;
    slotCapacity: number;
    maxParty: number;
    durationMin: number;
  },
) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "restaurant.manage");
    await updateReservationSettings(db, ctx, input);
    refresh();
  });
}

export async function saveFloorPlanAction(rid: string, items: unknown) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "tables.manage");
    await saveFloorPlan(db, ctx, items);
    refresh();
  });
}

export async function walkInAction(rid: string, input: { tableId: string; partySize: number; name: string }) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    const t = await getTranslations("reservations.host");
    await seatWalkIn(db, ctx, input, t("walkInName"));
    refresh();
  });
}

/** Seats a booking, at the table the host tapped (or the one it already has). */
export async function seatAction(rid: string, id: string, tableId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.update_status");
    await setReservationStatus(db, ctx, id, "seated", tableId);
    refresh();
  });
}

/** Gives a booking a table (or takes it back with null), under the double-booking rules. */
export async function assignTableAction(rid: string, id: string, tableId: string | null) {
  return runAction(async () => {
    const ctx = await actionContext(rid, "orders.create");
    await updateBooking(db, ctx, id, { tableId });
    refresh();
  });
}
