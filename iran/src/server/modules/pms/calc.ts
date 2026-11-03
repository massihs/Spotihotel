/**
 * Pure hotel arithmetic (no database): calendar days, nights of a stay, nightly prices, included
 * VAT, and the key figures hoteliers read every morning (occupancy, ADR, RevPAR).
 */

const DAY = 86_400_000;

export const isDay = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Whole nights between two calendar days (departure − arrival). */
export function nightsBetween(arrival: string, departure: string) {
  return Math.round((Date.parse(`${departure}T12:00:00Z`) - Date.parse(`${arrival}T12:00:00Z`)) / DAY);
}

/** The nights of a stay: each day from arrival (included) to departure (excluded). */
export function eachNight(arrival: string, departure: string) {
  const n = nightsBetween(arrival, departure);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(arrival, i));
}

/** Two stays [a1, d1) and [a2, d2) share at least one night. */
export const overlaps = (a1: string, d1: string, a2: string, d2: string) => a1 < d2 && a2 < d1;

export type RatePlanAdjust = { adjustBps: number; adjustCents: number };
export type RoomTypePrice = { baseRateCents: number; baseOccupancy: number; extraAdultCents: number };

/**
 * Price of one night: the day's rate (yield override, else the base rate), the rate plan's
 * percentage then its fixed amount, plus extra adults above the base occupancy. Never negative.
 */
export function nightPrice(
  type: RoomTypePrice,
  dayRateCents: number | null | undefined,
  plan: RatePlanAdjust | null | undefined,
  adults: number,
) {
  let price = dayRateCents ?? type.baseRateCents;
  if (plan) price = Math.round((price * (10_000 + plan.adjustBps)) / 10_000) + plan.adjustCents;
  price += Math.max(0, adults - type.baseOccupancy) * type.extraAdultCents;
  return Math.max(0, price);
}

/** VAT contained in a tax-inclusive amount (rounded to the minor unit). */
export function includedTax(amountCents: number, rateBps: number) {
  if (!rateBps || !amountCents) return 0;
  return Math.round((amountCents * rateBps) / (10_000 + rateBps));
}

/** Occupancy %, average daily rate and revenue per available room. */
export function keyFigures(roomsAvailable: number, roomsSold: number, roomRevenueCents: number) {
  return {
    occupancyPct: roomsAvailable ? Math.round((roomsSold / roomsAvailable) * 1000) / 10 : 0,
    adrCents: roomsSold ? Math.round(roomRevenueCents / roomsSold) : 0,
    revparCents: roomsAvailable ? Math.round(roomRevenueCents / roomsAvailable) : 0,
  };
}

/** Bookable start times of a service on a day, "HH:MM", ending before it closes. */
export function serviceSlots(opensAt: string, closesAt: string, stepMin: number, durationMin: number) {
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const out: string[] = [];
  const end = toMin(closesAt);
  for (let t = toMin(opensAt); t + durationMin <= end; t += Math.max(5, stepMin)) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}
