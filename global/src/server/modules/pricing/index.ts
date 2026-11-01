/**
 * Pure pricing engine — no I/O, safe to import on the client for display.
 * The server ALWAYS re-runs it against database prices: client totals are informative only.
 */
import { taxFromGross, taxFromNet } from "@/lib/money";

export type PricedOptionValue = {
  id: string;
  name: string;
  priceDeltaCents: number;
  isAvailable: boolean;
  isDefault?: boolean;
};
export type PricedOptionGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  values: PricedOptionValue[];
};
export type PricedProduct = {
  id: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  taxRateBps: number;
  optionGroups: PricedOptionGroup[];
};

export type Selection = {
  groupId: string;
  groupName: string;
  valueId: string;
  valueName: string;
  priceDeltaCents: number;
};

export type LineError =
  | { code: "product_unavailable" }
  | { code: "invalid_quantity" }
  | { code: "invalid_option"; valueId: string }
  | { code: "option_unavailable"; valueId: string }
  | { code: "duplicate_option"; valueId: string }
  | { code: "too_few_options"; groupId: string; min: number }
  | { code: "too_many_options"; groupId: string; max: number };

export type PricedLine = {
  unitPriceCents: number;
  optionsTotalCents: number;
  /** Unit price including options. */
  unitTotalCents: number;
  quantity: number;
  lineTotalCents: number;
  taxRateBps: number;
  selections: Selection[];
};

export const MAX_LINE_QUANTITY = 99;

export function priceLine(
  product: PricedProduct,
  optionValueIds: readonly string[],
  quantity: number,
): { ok: true; line: PricedLine } | { ok: false; error: LineError } {
  if (!product.isAvailable) return { ok: false, error: { code: "product_unavailable" } };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    return { ok: false, error: { code: "invalid_quantity" } };
  }

  const index = new Map<string, { group: PricedOptionGroup; value: PricedOptionValue }>();
  for (const group of product.optionGroups)
    for (const value of group.values) index.set(value.id, { group, value });

  const seen = new Set<string>();
  const selections: Selection[] = [];
  for (const id of optionValueIds) {
    if (seen.has(id)) return { ok: false, error: { code: "duplicate_option", valueId: id } };
    seen.add(id);
    const hit = index.get(id);
    if (!hit) return { ok: false, error: { code: "invalid_option", valueId: id } };
    if (!hit.value.isAvailable) return { ok: false, error: { code: "option_unavailable", valueId: id } };
    selections.push({
      groupId: hit.group.id,
      groupName: hit.group.name,
      valueId: hit.value.id,
      valueName: hit.value.name,
      priceDeltaCents: hit.value.priceDeltaCents,
    });
  }

  for (const group of product.optionGroups) {
    const count = selections.filter((s) => s.groupId === group.id).length;
    if (count < group.minSelect)
      return { ok: false, error: { code: "too_few_options", groupId: group.id, min: group.minSelect } };
    if (count > group.maxSelect)
      return { ok: false, error: { code: "too_many_options", groupId: group.id, max: group.maxSelect } };
  }

  // Stable order: by group order in the product, then by value order in the group.
  const groupOrder = new Map(product.optionGroups.map((g, i) => [g.id, i]));
  const valueOrder = new Map(product.optionGroups.flatMap((g) => g.values.map((v, i) => [v.id, i] as const)));
  selections.sort(
    (a, b) =>
      groupOrder.get(a.groupId)! - groupOrder.get(b.groupId)! ||
      valueOrder.get(a.valueId)! - valueOrder.get(b.valueId)!,
  );

  const optionsTotalCents = selections.reduce((s, x) => s + x.priceDeltaCents, 0);
  const unitTotalCents = product.priceCents + optionsTotalCents;
  return {
    ok: true,
    line: {
      unitPriceCents: product.priceCents,
      optionsTotalCents,
      unitTotalCents,
      quantity,
      lineTotalCents: unitTotalCents * quantity,
      taxRateBps: product.taxRateBps,
      selections,
    },
  };
}

export type Totals = {
  /** Sum of line totals as displayed (TTC if prices include tax, HT otherwise). */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxes: { rateBps: number; baseCents: number; taxCents: number }[];
};

/**
 * Totals with VAT computed per rate on the summed amounts (one rounding per rate,
 * not per line), which is how invoices must present it.
 */
export function computeTotals(
  lines: readonly { lineTotalCents: number; taxRateBps: number }[],
  pricesIncludeTax: boolean,
): Totals {
  const byRate = new Map<number, number>();
  for (const l of lines) byRate.set(l.taxRateBps, (byRate.get(l.taxRateBps) ?? 0) + l.lineTotalCents);
  const subtotalCents = [...byRate.values()].reduce((a, b) => a + b, 0);
  const taxes = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBps, amount]) => {
      const taxCents = pricesIncludeTax ? taxFromGross(amount, rateBps) : taxFromNet(amount, rateBps);
      return { rateBps, baseCents: pricesIncludeTax ? amount - taxCents : amount, taxCents };
    });
  const taxCents = taxes.reduce((s, t) => s + t.taxCents, 0);
  return {
    subtotalCents,
    taxCents,
    totalCents: pricesIncludeTax ? subtotalCents : subtotalCents + taxCents,
    taxes,
  };
}

/** Canonical key of a line: same product + same options + same note ⇒ merged in the cart. */
export function lineKey(productId: string, optionValueIds: readonly string[], note?: string | null) {
  return `${productId}|${[...optionValueIds].sort().join(",")}|${(note ?? "").trim().toLowerCase()}`;
}
