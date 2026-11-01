/** New price after a percent change, rounded to the nearest step (never below one step). */
export function adjustedPrice(priceCents: number, percent: number, roundTo: number) {
  const raw = priceCents * (1 + percent / 100);
  if (!roundTo) return Math.max(0, Math.round(raw));
  return Math.max(roundTo, Math.round(raw / roundTo) * roundTo);
}

/** Rounding steps offered for a bulk price change, in the display unit (tomans for IRR). */
export const ROUND_STEPS: Record<"toman" | "other", number[]> = {
  toman: [0, 1000, 5000, 10000],
  other: [0, 0.1, 0.5, 1],
};
