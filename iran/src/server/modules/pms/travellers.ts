import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { diningTables, hotelGuests, stays } from "@/server/db/schema";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { toJalali } from "@/lib/jalali-calendar";

const jdate = (d: string | null) => {
  if (!d) return "";
  const j = toJalali(d);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
};

const DOCS: Record<string, string> = {
  passport: "گذرنامه",
  id_card: "کارت ملی",
  driving_licence: "گواهینامه",
};

/** Every guest sleeping in the hotel on a night (checked in or already left that morning). */
export async function travellersOfNight(db: DbOrTx, ctx: RestaurantContext, day: string) {
  assertCan(ctx, "frontdesk.view");
  return db
    .select({
      room: diningTables.label,
      lastName: hotelGuests.lastName,
      firstName: hotelGuests.firstName,
      fatherName: hotelGuests.fatherName,
      nationality: hotelGuests.nationality,
      documentType: hotelGuests.documentType,
      documentNumber: hotelGuests.documentNumber,
      birthDate: hotelGuests.birthDate,
      phone: hotelGuests.phone,
      arrival: stays.arrival,
      departure: stays.departure,
      adults: stays.adults,
      children: stays.children,
      number: stays.number,
    })
    .from(stays)
    .innerJoin(hotelGuests, eq(hotelGuests.id, stays.guestId))
    .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(
      and(
        eq(stays.restaurantId, ctx.restaurant.id),
        inArray(stays.status, ["in_house", "checked_out"]),
        lte(stays.arrival, day),
        gt(stays.departure, day),
      ),
    )
    .orderBy(asc(diningTables.label));
}

/**
 * The night's travellers list for the police of public places (اماکن), as a CSV that Excel
 * opens: one line per stay, foreigners flagged (they must be reported within 24 hours).
 */
export async function travellersCsv(db: DbOrTx, ctx: RestaurantContext, day: string) {
  const rows = await travellersOfNight(db, ctx, day);
  const cell = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "اتاق",
    "نام خانوادگی",
    "نام",
    "نام پدر",
    "ملیت",
    "اتباع خارجی",
    "نوع مدرک",
    "شماره مدرک / کد ملی",
    "تاریخ تولد",
    "تلفن",
    "تاریخ ورود",
    "تاریخ خروج",
    "تعداد نفرات",
    "شماره رزرو",
  ];
  const lines = rows.map((r) =>
    [
      r.room,
      r.lastName,
      r.firstName,
      r.fatherName,
      r.nationality ?? "",
      r.nationality && r.nationality !== "IR" ? "بله" : "",
      r.documentType ? (DOCS[r.documentType] ?? r.documentType) : "",
      r.documentNumber,
      jdate(r.birthDate),
      r.phone,
      jdate(r.arrival),
      jdate(r.departure),
      r.adults + r.children,
      r.number,
    ]
      .map(cell)
      .join(","),
  );
  return { csv: [header.join(","), ...lines].join("\r\n"), count: rows.length };
}
