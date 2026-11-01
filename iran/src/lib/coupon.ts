/** Discount of a coupon on a bill, in minor units (shared by the server and the till preview). */
export function couponDiscount(c: { kind: string; value: number }, totalCents: number) {
  return c.kind === "percent"
    ? Math.round((totalCents * Math.min(c.value, 100)) / 100)
    : Math.min(c.value, totalCents);
}
