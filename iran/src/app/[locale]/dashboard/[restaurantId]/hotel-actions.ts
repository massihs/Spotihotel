"use server";

import { refresh } from "next/cache";
import { db } from "@/server/db/client";
import { actionContext, runAction } from "@/server/actions";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  deleteRatePlan,
  deleteRoomType,
  setRateRange,
  updatePmsSettings,
  updateRatePlan,
  updateRoomType,
  type pmsSettingsSchema,
  type ratePlanSchema,
  type rateRangeSchema,
  type roomTypeSchema,
} from "@/server/modules/pms/setup";
import {
  amendStay,
  assignRoom,
  cancelStay,
  checkIn,
  checkOut,
  confirmStay,
  createStay,
  quoteStay,
  type amendSchema,
  type staySchema,
} from "@/server/modules/pms/stays";
import {
  discountLine,
  moveLine,
  postCharge,
  postPayment,
  transferFolioToAccount,
  voidLine,
  createFolio,
  type chargeSchema,
  type paymentSchema,
} from "@/server/modules/pms/folios";
import {
  saveAccount,
  updateGuest,
  createGuest,
  searchGuests,
  type accountSchema,
  type GuestInput,
} from "@/server/modules/pms/guests";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import {
  bookServiceAsStaff,
  cancelServiceBooking,
  deleteService,
  saveService,
  serviceDay,
  setServiceBookingStatus,
  type bookingSchema,
  type serviceSchema,
} from "@/server/modules/pms/wellness";
import {
  chargeMinibar,
  deleteMinibarItem,
  saveMinibarItem,
  type minibarItemSchema,
} from "@/server/modules/pms/minibar";
import { chargeRoomOrders } from "@/server/modules/pms/room-charges";
import { assertCan } from "@/server/tenancy";
import {
  createBlock,
  pickupRooming,
  setBlockStatus,
  type blockSchema,
  type roomingSchema,
} from "@/server/modules/pms/blocks";
import {
  cancellationFee,
  deletePricingRule,
  savePricingRule,
  type pricingRuleSchema,
} from "@/server/modules/pms/revenue";
import { sendPrecheckinLink } from "@/server/modules/pms/precheckin";
import {
  availableRooms,
  bookingOptions,
  checkInContext,
  updateGuestIdentity,
  type bookingSearchSchema,
  type identitySchema,
} from "@/server/modules/pms/booking";
import type { z } from "zod";

type In<T extends z.ZodType> = z.input<T>;

const done = <T>(v: T) => {
  refresh();
  return v;
};

// Setup
export const saveRoomTypeAction = async (rid: string, id: string | null, input: In<typeof roomTypeSchema>) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "rates.manage");
    return done((id ? await updateRoomType(db, ctx, id, input) : await createRoomType(db, ctx, input)).id);
  });
export const deleteRoomTypeAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteRoomType(db, await actionContext(rid, "rates.manage"), id)));
export const assignRoomTypeAction = async (rid: string, roomIds: string[], typeId: string | null) =>
  runAction(async () =>
    done(await assignRoomType(db, await actionContext(rid, "rates.manage"), roomIds, typeId)),
  );
export const saveRatePlanAction = async (rid: string, id: string | null, input: In<typeof ratePlanSchema>) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "rates.manage");
    return done((id ? await updateRatePlan(db, ctx, id, input) : await createRatePlan(db, ctx, input)).id);
  });
export const deleteRatePlanAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteRatePlan(db, await actionContext(rid, "rates.manage"), id)));
export const setRateRangeAction = async (rid: string, input: In<typeof rateRangeSchema>) =>
  runAction(async () => done(await setRateRange(db, await actionContext(rid, "rates.manage"), input)));
export const savePmsSettingsAction = async (rid: string, input: In<typeof pmsSettingsSchema>) =>
  runAction(async () => done(await updatePmsSettings(db, await actionContext(rid, "rates.manage"), input)));
export const saveServiceAction = async (rid: string, id: string | null, input: In<typeof serviceSchema>) =>
  runAction(async () =>
    done((await saveService(db, await actionContext(rid, "rates.manage"), id, input)).id),
  );
export const deleteServiceAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteService(db, await actionContext(rid, "rates.manage"), id)));
export const saveMinibarItemAction = async (
  rid: string,
  id: string | null,
  input: In<typeof minibarItemSchema>,
) =>
  runAction(async () =>
    done((await saveMinibarItem(db, await actionContext(rid, "rates.manage"), id, input)).id),
  );
export const deleteMinibarItemAction = async (rid: string, id: string) =>
  runAction(async () => done(await deleteMinibarItem(db, await actionContext(rid, "rates.manage"), id)));
export const saveAccountAction = async (rid: string, id: string | null, input: In<typeof accountSchema>) =>
  runAction(async () =>
    done((await saveAccount(db, await actionContext(rid, "accounting.manage"), id, input)).id),
  );

// Guests
export const saveGuestAction = async (rid: string, id: string | null, input: GuestInput) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.manage");
    return done((id ? await updateGuest(db, ctx, id, input) : await createGuest(db, ctx, input)).id);
  });

// Stays
export const createStayAction = async (rid: string, input: In<typeof staySchema>) =>
  runAction(async () => done((await createStay(db, await actionContext(rid, "frontdesk.manage"), input)).id));
export const amendStayAction = async (rid: string, id: string, input: In<typeof amendSchema>) =>
  runAction(async () =>
    done((await amendStay(db, await actionContext(rid, "frontdesk.manage"), id, input)).id),
  );
export const assignRoomAction = async (rid: string, id: string, roomId: string | null) =>
  runAction(async () => done(await assignRoom(db, await actionContext(rid, "frontdesk.manage"), id, roomId)));
export const checkInAction = async (rid: string, id: string, roomId?: string | null, allowDirty = false) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.manage");
    return done((await checkIn(db, ctx, id, { roomId: roomId ?? null, allowDirty })).id);
  });
export const checkOutAction = async (rid: string, id: string, toAccount = false) =>
  runAction(async () =>
    done((await checkOut(db, await actionContext(rid, "frontdesk.manage"), id, { toAccount })).id),
  );
export const cancelStayAction = async (rid: string, id: string, reason: string, feeCents = 0) =>
  runAction(async () =>
    done(await cancelStay(db, await actionContext(rid, "frontdesk.manage"), id, { reason, feeCents })),
  );
export const confirmStayAction = async (rid: string, id: string) =>
  runAction(async () => done(await confirmStay(db, await actionContext(rid, "frontdesk.manage"), id)));
export const nightAuditAction = async (rid: string) =>
  runAction(async () => {
    const r = await runNightAudit(db, await actionContext(rid, "frontdesk.manage"));
    return done({ businessDate: r.businessDate, roomsSold: r.roomsSold, noShows: r.noShows });
  });

// Folios
export const postChargeAction = async (rid: string, folioId: string, input: In<typeof chargeSchema>) =>
  runAction(async () =>
    done((await postCharge(db, await actionContext(rid, "folio.post"), folioId, input)).id),
  );
export const postPaymentAction = async (rid: string, folioId: string, input: In<typeof paymentSchema>) =>
  runAction(async () =>
    done((await postPayment(db, await actionContext(rid, "folio.post"), folioId, input)).id),
  );
export const voidLineAction = async (rid: string, lineId: string, reason: string) =>
  runAction(async () => done(await voidLine(db, await actionContext(rid, "folio.adjust"), lineId, reason)));
export const discountLineAction = async (rid: string, lineId: string, amountCents: number, reason: string) =>
  runAction(async () =>
    done(
      (await discountLine(db, await actionContext(rid, "folio.adjust"), { lineId, amountCents, reason })).id,
    ),
  );
export const moveLineAction = async (rid: string, lineId: string, toFolioId: string) =>
  runAction(async () =>
    done((await moveLine(db, await actionContext(rid, "folio.adjust"), lineId, toFolioId)).id),
  );
export const transferToAccountAction = async (rid: string, folioId: string, accountId: string) =>
  runAction(async () =>
    done(await transferFolioToAccount(db, await actionContext(rid, "folio.adjust"), folioId, accountId)),
  );
export const newFolioAction = async (rid: string, stayId: string, label: string) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "folio.adjust");
    return done((await createFolio(db, ctx.restaurant.id, { stayId, label: label.slice(0, 80) || null })).id);
  });
export const chargeRoomOrdersAction = async (rid: string, stayId: string) =>
  runAction(async () => done(await chargeRoomOrders(db, await actionContext(rid, "folio.post"), stayId)));
export const chargeMinibarAction = async (
  rid: string,
  stayId: string,
  lines: { itemId: string; quantity: number }[],
) =>
  runAction(async () => done(await chargeMinibar(db, await actionContext(rid, "folio.post"), stayId, lines)));

// Wellness
export const bookServiceAction = async (rid: string, input: In<typeof bookingSchema>) =>
  runAction(async () =>
    done((await bookServiceAsStaff(db, await actionContext(rid, "frontdesk.manage"), input)).id),
  );
export const cancelServiceBookingAction = async (rid: string, id: string) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.manage");
    assertCan(ctx, "frontdesk.manage");
    return done(await cancelServiceBooking(db, ctx.restaurant, id, { userId: ctx.user.id }));
  });
export const serviceBookingStatusAction = async (rid: string, id: string, status: "done" | "no_show") =>
  runAction(async () =>
    done(await setServiceBookingStatus(db, await actionContext(rid, "frontdesk.manage"), id, status)),
  );

// Reads used by the booking form (no refresh).
export const quoteStayAction = async (
  rid: string,
  q: { roomTypeId: string; ratePlanId?: string | null; arrival: string; departure: string; adults: number },
) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.view");
    const res = await quoteStay(db, ctx.restaurant.id, q);
    return { totalCents: res.totalCents, nights: res.nights, issues: res.issues, minStay: res.minStay };
  });
export const searchGuestsAction = async (rid: string, q: string) =>
  runAction(async () => searchGuests(db, await actionContext(rid, "frontdesk.view"), q, 8));
export const serviceDayAction = async (rid: string, serviceId: string, day: string) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.view");
    const res = await serviceDay(db, ctx.restaurant, serviceId, day);
    return res.slots;
  });

// Groups, revenue management, pre-check-in
export const createBlockAction = async (rid: string, input: In<typeof blockSchema>) =>
  runAction(async () =>
    done((await createBlock(db, await actionContext(rid, "frontdesk.manage"), input)).id),
  );
export const blockStatusAction = async (
  rid: string,
  id: string,
  status: "definite" | "released" | "cancelled",
) =>
  runAction(async () =>
    done(await setBlockStatus(db, await actionContext(rid, "frontdesk.manage"), id, status)),
  );
export const roomingAction = async (rid: string, id: string, list: In<typeof roomingSchema>) =>
  runAction(async () =>
    done((await pickupRooming(db, await actionContext(rid, "frontdesk.manage"), id, list)).length),
  );
export const savePricingRuleAction = async (
  rid: string,
  id: string | null,
  input: In<typeof pricingRuleSchema>,
) =>
  runAction(async () =>
    done((await savePricingRule(db, await actionContext(rid, "rates.manage"), id, input)).id),
  );
export const deletePricingRuleAction = async (rid: string, id: string) =>
  runAction(async () => done(await deletePricingRule(db, await actionContext(rid, "rates.manage"), id)));
export const cancellationFeeAction = async (rid: string, stayId: string) =>
  runAction(async () => cancellationFee(db, await actionContext(rid, "frontdesk.view"), stayId));
export const precheckinLinkAction = async (rid: string, stayId: string) =>
  runAction(async () => sendPrecheckinLink(db, await actionContext(rid, "frontdesk.manage"), stayId));

// Express booking & guided check-in
export const bookingOptionsAction = async (rid: string, input: In<typeof bookingSearchSchema>) =>
  runAction(async () => bookingOptions(db, await actionContext(rid, "frontdesk.view"), input));
export const availableRoomsAction = async (
  rid: string,
  q: { roomTypeId?: string | null; arrival: string; departure: string; excludeStayId?: string | null },
) =>
  runAction(async () => {
    const ctx = await actionContext(rid, "frontdesk.view");
    return availableRooms(db, ctx.restaurant.id, q);
  });
export const checkInContextAction = async (rid: string, stayId: string) =>
  runAction(async () => checkInContext(db, await actionContext(rid, "frontdesk.view"), stayId));
export const updateIdentityAction = async (rid: string, guestId: string, input: In<typeof identitySchema>) =>
  runAction(async () =>
    updateGuestIdentity(db, await actionContext(rid, "frontdesk.manage"), guestId, input),
  );
