import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { checkIn, createStay, getStay } from "@/server/modules/pms/stays";
import { postCharge, postPayment } from "@/server/modules/pms/folios";
import { issueStayInvoice, moadianCsv, stayInvoices } from "@/server/modules/pms/invoicing";
import { addDays } from "@/server/modules/pms/calc";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("official stay invoice", () => {
  it("is issued once the folio is settled, numbered, in the guest's or a company's name, and exported", async () => {
    const { ctx } = await createOwnerWithRestaurant("Invoice Hotel", { plan: "enterprise" });
    await db.update(restaurants).set({ kind: "hotel" }).where(eq(restaurants.id, ctx.restaurant.id));
    const h = { ...ctx, restaurant: { ...ctx.restaurant, kind: "hotel" as const } };
    await bulkCreateTables(db, h, { from: 101, to: 102, kind: "room" });
    await updatePmsSettings(db, h, {
      checkInTime: "14:00",
      checkOutTime: "12:00",
      roomTaxBps: 1000,
      serviceTaxBps: 1000,
      cityTaxCents: 0,
      autoChargeRoomService: true,
      minibarSelfService: true,
      chargeNoShows: true,
      channelCommissions: {},
    });
    const dbl = await createRoomType(db, h, {
      code: "DBL",
      name: "Double",
      baseOccupancy: 2,
      maxOccupancy: 2,
      baseRateCents: 110_000,
    });
    const rooms = (await listTables(db, h)).filter((r) => r.kind === "room");
    await assignRoomType(
      db,
      h,
      rooms.map((r) => r.id),
      dbl.id,
    );
    await createRatePlan(db, h, { code: "RO", name: "Room only", mealPlan: "RO", isDefault: true });
    const { businessDate: today } = await getPmsSettings(db, h.restaurant.id, h.restaurant.timezone);
    const stay = await createStay(db, h, {
      guest: {
        firstName: "Reza",
        lastName: "Karimi",
        nationality: "IR",
        documentType: "id_card",
        documentNumber: "0012345679",
        fatherName: "Ali",
      },
      roomTypeId: dbl.id,
      arrival: today,
      departure: addDays(today, 1),
    });
    await checkIn(db, h, stay.id);
    const folio = (await getStay(db, h, stay.id)).folios[0]!;
    await postCharge(db, h, folio.id, { department: "minibar", description: "Water", unitCents: 22_000 });

    // Not settled yet: no invoice.
    await expect(issueStayInvoice(db, h, folio.id)).rejects.toMatchObject({ message: "folio_not_settled" });
    await postPayment(db, h, folio.id, { amountCents: 22_000, method: "card" });

    const inv = await issueStayInvoice(db, h, folio.id);
    expect(inv.number).toMatch(/^\d{4}-\d{6}$/);
    expect(inv.totalCents).toBe(22_000);
    expect(inv.taxCents).toBe(2_000);
    expect(inv.snapshot.buyer).toMatchObject({ name: "Reza Karimi", nationalId: "0012345679" });
    expect(inv.snapshot.stay).toMatchObject({ number: stay.number, room: expect.any(String) });
    expect(inv.snapshot.payments).toEqual([
      expect.objectContaining({ provider: "card", amountCents: 22_000 }),
    ]);

    // Again: same invoice. In a company's name: same number, new buyer.
    expect((await issueStayInvoice(db, h, folio.id)).id).toBe(inv.id);
    const named = await issueStayInvoice(db, h, folio.id, { name: "Acme Co", economicCode: "411111111111" });
    expect(named).toMatchObject({ id: inv.id, number: inv.number });
    expect(named.snapshot.buyer).toMatchObject({ name: "Acme Co", economicCode: "411111111111" });
    expect(await stayInvoices(db, h.restaurant.id, [folio.id])).toEqual([
      { folioId: folio.id, number: inv.number, publicToken: inv.publicToken },
    ]);

    // Export for the tax system: one row per line, type 1 (identified buyer), amounts in rials.
    const { csv, count } = await moadianCsv(db, h, addDays(today, -40), addDays(today, 40));
    expect(count).toBe(1);
    const row = csv.split("\n")[1]!;
    expect(row).toContain(inv.number);
    expect(row).toContain("نوع اول");
    expect(row).toContain("411111111111");
    expect(row).toContain("Water,1,220,200,10%,20,220,");
  });
});
