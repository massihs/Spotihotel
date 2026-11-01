/**
 * Brand colors a restaurant can pick (menu, buttons, dashboard accent). Each is an OKLCH hue,
 * chroma and lightness; `dark` means the color is light enough to need dark text on it.
 * The CSS lives in styles/brands.css (one `[data-brand]` rule per key).
 */
export const BRAND_COLORS = [
  { key: "orange", h: 47, c: 0.19, l: 0.66 },
  { key: "violet", h: 292, c: 0.2, l: 0.55 },
  { key: "indigo", h: 268, c: 0.19, l: 0.52 },
  { key: "sky", h: 237, c: 0.15, l: 0.58 },
  { key: "teal", h: 192, c: 0.11, l: 0.55 },
  { key: "emerald", h: 158, c: 0.14, l: 0.56 },
  { key: "olive", h: 128, c: 0.12, l: 0.54 },
  { key: "saffron", h: 78, c: 0.16, l: 0.74, dark: true },
  { key: "coral", h: 38, c: 0.18, l: 0.64 },
  { key: "rose", h: 12, c: 0.2, l: 0.58 },
  { key: "fuchsia", h: 338, c: 0.22, l: 0.57 },
  { key: "plum", h: 330, c: 0.12, l: 0.42 },
  { key: "slate", h: 262, c: 0.035, l: 0.34 },
] as const;

export type BrandColor = (typeof BRAND_COLORS)[number]["key"];
export const DEFAULT_BRAND: BrandColor = "orange";
export const isBrandColor = (v: unknown): v is BrandColor =>
  typeof v === "string" && BRAND_COLORS.some((b) => b.key === v);
export const brandSwatch = (key: string) => {
  const b = BRAND_COLORS.find((x) => x.key === key) ?? BRAND_COLORS[0];
  return `oklch(${b.l} ${b.c} ${b.h})`;
};
