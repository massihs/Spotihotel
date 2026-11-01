/** The product priced for a sales type (takeaway / delivery price lists; dine-in uses the menu price). */
export function forChannel<
  T extends { priceCents: number; takeawayPriceCents: number | null; deliveryPriceCents: number | null },
>(p: T, channel: "dine_in" | "takeaway" | "delivery"): T {
  const override =
    channel === "takeaway" ? p.takeawayPriceCents : channel === "delivery" ? p.deliveryPriceCents : null;
  return override != null ? { ...p, priceCents: override } : p;
}
