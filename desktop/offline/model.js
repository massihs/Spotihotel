/**
 * Pricing and display rules shared by the local hub (Node) and the offline screens (browser).
 * They mirror the website: amounts are integers in minor units, tax rates in basis points.
 */

/** 1 toman = 10 rials = 1000 minor units; other currencies have cents. */
export const isToman = (currency) => currency === "IRR";

const TOMAN = { fa: "تومان", ar: "تومان", en: "Toman", fr: "tomans" };

export function formatMoney(cents, currency, locale = "fa") {
  if (isToman(currency)) {
    const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(cents / 1000));
    return `${n} ${TOMAN[locale.slice(0, 2)] ?? TOMAN.fa}`;
  }
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Typed amount ("120000", "۱۲۰٬۰۰۰", "19,90") → minor units, or null. */
export function parseMoney(input, currency) {
  const s = String(input ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(isToman(currency) ? /[\s٬,]/g : /[\s٬]/g, "")
    .replace(/٫/, ".");
  if (isToman(currency)) return /^\d{1,12}$/.test(s) ? Number(s) * 1000 : null;
  const m = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(s);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

const divRound = (n, d) => Math.sign(n) * Math.floor((Math.abs(n) * 2 + d) / (2 * d));
export const taxFromGross = (gross, bps) => (bps ? divRound(gross * bps, 10_000 + bps) : 0);
export const taxFromNet = (net, bps) => divRound(net * bps, 10_000);

/** The price of a dish for the sale type (takeaway may have its own price). */
export const priceFor = (product, channel) =>
  channel === "takeaway" && product.takeawayPriceCents != null ? product.takeawayPriceCents : product.priceCents;

/**
 * A ticket line from the menu: checks the chosen options against the dish's groups, like the
 * website does. Returns { line } or { error }.
 */
export function buildLine(product, channel, optionValueIds, quantity, note = "", category = null) {
  if (!product) return { error: "product_unavailable" };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return { error: "invalid_quantity" };
  const options = [];
  for (const id of optionValueIds) {
    const group = product.optionGroups.find((g) => g.values.some((v) => v.id === id));
    const value = group?.values.find((v) => v.id === id);
    if (!group || !value) return { error: "invalid_option" };
    if (options.some((o) => o.valueId === id)) return { error: "duplicate_option" };
    options.push({
      groupId: group.id,
      groupName: group.name,
      valueId: value.id,
      valueName: value.name,
      priceDeltaCents: value.priceDeltaCents,
    });
  }
  for (const g of product.optionGroups) {
    const n = options.filter((o) => o.groupId === g.id).length;
    if (n < g.minSelect) return { error: "too_few_options", group: g.name };
    if (n > g.maxSelect) return { error: "too_many_options", group: g.name };
  }
  const unitPriceCents = priceFor(product, channel);
  const optionsTotalCents = options.reduce((s, o) => s + o.priceDeltaCents, 0);
  return {
    line: {
      productId: product.id,
      categoryId: product.categoryId,
      categoryName: category?.name ?? null,
      // The dish's own station (from the website: dish, else its category), else the category's.
      stationId: product.stationId ?? category?.stationId ?? null,
      name: product.name,
      unitPriceCents,
      taxRateBps: product.taxRateBps,
      quantity,
      note: String(note ?? "").slice(0, 280),
      options,
      lineTotalCents: Math.max(0, unitPriceCents + optionsTotalCents) * quantity,
    },
  };
}

/** Subtotal, tax, discount and total, as the website computes them. */
export function totalsOf(lines, pricesIncludeTax, discountCents = 0) {
  const byRate = new Map();
  for (const l of lines) byRate.set(l.taxRateBps, (byRate.get(l.taxRateBps) ?? 0) + l.lineTotalCents);
  let subtotalCents = 0;
  let taxCents = 0;
  for (const [bps, amount] of byRate) {
    subtotalCents += amount;
    taxCents += pricesIncludeTax ? taxFromGross(amount, bps) : taxFromNet(amount, bps);
  }
  const gross = pricesIncludeTax ? subtotalCents : subtotalCents + taxCents;
  const discount = Math.min(Math.max(0, discountCents), gross);
  return { subtotalCents, taxCents, discountCents: discount, totalCents: gross - discount };
}

export const ACTIVE = ["accepted", "preparing", "ready"];
