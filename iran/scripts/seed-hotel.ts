/**
 * Demo hotel ("hotel-demo"): rooms on two floors, room types, rate plans, a yield weekend,
 * wellness services, a minibar, a company account and a few stays (one guest in house with a
 * running bill), all created through the real services so the books balance.
 * Iran edition: an Isfahan hotel with Persian data, Iranian booking platforms and national codes.
 */
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { plans, restaurants, subscriptions, users } from "@/server/db/schema";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { edition } from "@/config/edition";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  setRateRange,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { saveAccount } from "@/server/modules/pms/guests";
import { checkIn, createStay, getStay } from "@/server/modules/pms/stays";
import { postCharge, postPayment } from "@/server/modules/pms/folios";
import { saveService } from "@/server/modules/pms/wellness";
import { saveMinibarItem } from "@/server/modules/pms/minibar";
import { addDays } from "@/server/modules/pms/calc";
import { syncLedger } from "@/server/modules/ledger/sync";
import { savePricingRule } from "@/server/modules/pms/revenue";
import { createBlock } from "@/server/modules/pms/blocks";

const price = (eur: number) => edition.demoPrice(eur * 100);
const fa = edition.edition === "iran";
/** Demo texts: Persian for the Iran edition, French elsewhere. */
const L = (persian: string, french: string) => (fa ? persian : french);
/** A valid Iranian national code built from nine digits (demo data). */
const nationalCode = (nine: string) => {
  const sum = nine.split("").reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return nine + String(r < 2 ? r : 11 - r);
};

export async function seedDemoHotel(ownerId: string) {
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.slug, "hotel-demo"));
  if (existing) {
    console.log("✓ demo hotel already present — skipping");
    return;
  }
  const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
  const restaurant = await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: L("گروه هتل‌داری نمونه", "Spotihotel Demo"),
      ownerUserId: ownerId,
      billingEmail: owner!.email,
    });
    const r = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: ownerId,
      name: L("هتل نمونه اصفهان", "Hôtel Démo"),
      kind: "hotel",
    });
    await tx
      .update(restaurants)
      .set({
        slug: "hotel-demo",
        phone: L("+98 31 3222 0000", "+33 1 23 45 67 89"),
        addressLine1: L("خیابان چهارباغ عباسی، پلاک ۱۸", "12 rue de la Paix"),
        city: L("اصفهان", "Paris"),
      })
      .where(eq(restaurants.id, r.id));
    const [pro] = await tx.select().from(plans).where(eq(plans.code, "professional"));
    if (pro)
      await tx
        .update(subscriptions)
        .set({ planId: pro.id, status: "active" })
        .where(eq(subscriptions.organizationId, org.id));
    return r;
  });
  const ctx = await loadRestaurantContext(db, { ...owner!, locale: owner!.locale }, restaurant.id);

  await bulkCreateTables(db, ctx, { from: 101, to: 108, kind: "room" });
  await bulkCreateTables(db, ctx, { from: 201, to: 204, kind: "room" });
  const rooms = (await listTables(db, ctx)).filter((r) => r.kind === "room");
  await updatePmsSettings(db, ctx, {
    checkInTime: fa ? "14:00" : "15:00",
    checkOutTime: fa ? "12:00" : "11:00",
    roomTaxBps: 1000,
    serviceTaxBps: fa ? 1000 : 2000,
    cityTaxCents: fa ? 0 : price(2),
    autoChargeRoomService: true,
    minibarSelfService: true,
    chargeNoShows: true,
    channelCommissions: fa ? { snapptrip: 1500, alibaba: 1200, jabama: 1000, eghamat24: 1200 } : { booking: 1700, expedia: 1800 },
    wifiName: "HotelDemo-Guests",
    wifiPassword: fa ? "welcome1405" : "welcome2026",
    guestInfo: L(
      "صبحانه از ساعت ۷ تا ۱۰:۳۰ در رستوران طبقه همکف.\nاستخر و سونا در طبقه منفی یک، ساعت ۸ تا ۲۱ (سانس بانوان و آقایان جداگانه).\nپذیرش ۲۴ ساعته: شماره ۹.",
      "Petit-déjeuner 7 h – 10 h 30 au restaurant.\nPiscine et sauna au niveau -1, 8 h – 21 h.\nRéception 24 h/24 : composez le 9.",
    ),
  });
  const dbl = await createRoomType(db, ctx, {
    code: "DBL",
    name: L("دو تخته دبل", "Chambre double"),
    baseOccupancy: 2,
    maxOccupancy: 3,
    baseRateCents: price(120),
    extraAdultCents: price(30),
  });
  const twn = await createRoomType(db, ctx, {
    code: "TWN",
    name: L("دو تخته توئین", "Chambre twin"),
    baseOccupancy: 2,
    maxOccupancy: 2,
    baseRateCents: price(115),
  });
  const ste = await createRoomType(db, ctx, {
    code: "STE",
    name: L("سوئیت جونیور", "Suite junior"),
    baseOccupancy: 2,
    maxOccupancy: 4,
    baseRateCents: price(240),
    extraAdultCents: price(40),
  });
  const ids = (re: RegExp) => rooms.filter((r) => re.test(r.label)).map((r) => r.id);
  await assignRoomType(db, ctx, ids(/^10[1-5]$/), dbl.id);
  await assignRoomType(db, ctx, ids(/^10[6-8]$/), twn.id);
  await assignRoomType(db, ctx, ids(/^20\d$/), ste.id);
  await createRatePlan(db, ctx, {
    code: "BB",
    name: L("اتاق با صبحانه", "Chambre et petit-déjeuner"),
    mealPlan: "BB",
    adjustCents: price(18),
    isDefault: true,
  });
  await createRatePlan(db, ctx, { code: "RO", name: L("فقط اتاق", "Chambre seule"), mealPlan: "RO" });
  await createRatePlan(db, ctx, {
    code: "NRF",
    name: L("غیرقابل استرداد", "Non remboursable"),
    mealPlan: "BB",
    adjustBps: -1200,
    adjustCents: price(18),
    refundable: false,
    cancelHours: 0,
  });
  await createRatePlan(db, ctx, {
    code: "HB",
    name: L("نیم‌پانسیون", "Demi-pension"),
    mealPlan: "HB",
    adjustCents: price(55),
    minStay: 2,
  });

  const { businessDate: today } = await getPmsSettings(db, restaurant.id, restaurant.timezone);
  // Busy nights a bit dearer over the next month: Wednesday–Thursday in Iran, Friday–Saturday elsewhere.
  await setRateRange(db, ctx, {
    roomTypeId: dbl.id,
    from: today,
    to: addDays(today, 30),
    rateCents: price(145),
    weekdays: fa ? [3, 4] : [5, 6],
  });

  for (const s of [
    {
      kind: "sauna",
      name: L("سونا خشک", "Sauna finlandais"),
      durationMin: 45,
      priceCents: 0,
      capacity: 6,
      opensAt: "08:00",
      closesAt: "21:00",
      slotStepMin: 45,
    },
    {
      kind: "pool",
      name: L("استخر سرپوشیده", "Piscine intérieure"),
      durationMin: 60,
      priceCents: 0,
      capacity: 20,
      opensAt: "07:00",
      closesAt: "21:00",
      slotStepMin: 60,
    },
    {
      kind: "massage",
      name: L("ماساژ آرامش ۶۰ دقیقه", "Massage relaxant 60 min"),
      durationMin: 60,
      priceCents: price(85),
      capacity: 2,
      opensAt: "10:00",
      closesAt: "20:00",
      slotStepMin: 30,
    },
    {
      kind: "hammam",
      name: L("حمام سنتی و لایه‌برداری", "Hammam & gommage"),
      durationMin: 90,
      priceCents: price(65),
      capacity: 4,
      opensAt: "10:00",
      closesAt: "19:00",
      slotStepMin: 30,
    },
  ] as const)
    await saveService(db, ctx, null, { ...s, guestBookable: true, active: true });
  for (const [name, eur] of [
    [L("آب معدنی", "Eau minérale 50 cl"), 3],
    [L("نوشابه", "Soda"), 4],
    [L("آبمیوه", "Bière"), fa ? 3 : 6],
    [L("چیپس", "Chips"), 4],
    [L("شکلات", "Chocolat"), 5],
  ] as const)
    await saveMinibarItem(db, ctx, null, { name, priceCents: price(eur), parQty: 2 });

  const company = await saveAccount(db, ctx, null, {
    name: L("شرکت مهندسی پارس‌سازه", "ACME Consulting"),
    kind: "company",
    paymentTermsDays: 30,
    creditLimitCents: price(5000),
  });
  const a = await createStay(db, ctx, {
    guest: fa
      ? {
          firstName: "سارا",
          lastName: "محمدی",
          fatherName: "علی",
          phone: "09121234567",
          nationality: "IR",
          documentType: "id_card",
          documentNumber: nationalCode("001234567"),
          vip: true,
        }
      : {
          firstName: "Claire",
          lastName: "Martin",
          phone: "+33 6 12 34 56 78",
          email: "claire.martin@example.com",
          vip: true,
        },
    roomTypeId: dbl.id,
    arrival: today,
    departure: addDays(today, 3),
    adults: 2,
    source: fa ? "snapptrip" : "booking",
    channelRef: fa ? "SNP-4482913" : "BK-4482913",
    guarantee: fa ? "deposit" : "card",
  });
  await checkIn(db, ctx, a.id);
  const folio = (await getStay(db, ctx, a.id)).folios[0]!;
  await postCharge(db, ctx, folio.id, {
    department: "minibar",
    description: L("آب معدنی", "Eau minérale 50 cl"),
    quantity: 2,
    unitCents: price(3),
  });
  await postPayment(db, ctx, folio.id, {
    amountCents: price(100),
    method: fa ? "transfer" : "card",
    reference: L("پیش‌پرداخت", "acompte"),
  });
  await createStay(db, ctx, {
    guest: fa
      ? {
          firstName: "رضا",
          lastName: "کریمی",
          fatherName: "حسن",
          phone: "09131112233",
          nationality: "IR",
          documentType: "id_card",
          documentNumber: nationalCode("128765432"),
        }
      : { firstName: "Karim", lastName: "Haddad", phone: "+33 7 11 22 33 44" },
    roomTypeId: ste.id,
    arrival: today,
    departure: addDays(today, 2),
    adults: 2,
    eta: "18:30",
    accountId: company.id,
    guarantee: "company",
  });
  await createStay(db, ctx, {
    guest: fa
      ? {
          firstName: "Marco",
          lastName: "Rossi",
          nationality: "IT",
          documentType: "passport",
          documentNumber: "YA1234567",
        }
      : { firstName: "Sofia", lastName: "Rossi" },
    roomTypeId: twn.id,
    arrival: addDays(today, 1),
    departure: addDays(today, 4),
    adults: 2,
    source: fa ? "alibaba" : "website",
  });
  await createStay(db, ctx, {
    guest: fa
      ? { firstName: "مریم", lastName: "حسینی", fatherName: "محمود" }
      : { firstName: "John", lastName: "Smith" },
    roomTypeId: dbl.id,
    arrival: addDays(today, 2),
    departure: addDays(today, 6),
    adults: 1,
    source: fa ? "jabama" : "expedia",
    status: "tentative",
  });
  // Revenue management and a group block.
  await savePricingRule(db, ctx, null, { minOccupancyPct: 70, adjustBps: 1000 });
  await savePricingRule(db, ctx, null, { minOccupancyPct: 90, adjustBps: 2500 });
  await createBlock(db, ctx, {
    name: L("تور فرهنگی اصفهان", "Circuit culturel"),
    arrival: addDays(today, 10),
    departure: addDays(today, 13),
    releaseDate: addDays(today, 5),
    accountId: company.id,
    rateCents: price(95),
    rooms: [{ roomTypeId: dbl.id, rooms: 3 }],
  });
  await syncLedger(db, restaurant);
  console.log("✓ demo hotel (12 rooms, 4 bookings, spa, minibar, books)");
}
