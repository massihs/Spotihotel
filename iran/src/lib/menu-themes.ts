/** Looks of the guest menu (QR), picked by each restaurant in its settings. */
export const MENU_THEMES = ["atelier", "nuit", "doux"] as const;
export type MenuTheme = (typeof MENU_THEMES)[number];
export const DEFAULT_MENU_THEME: MenuTheme = "doux";
export const isMenuTheme = (v: unknown): v is MenuTheme =>
  typeof v === "string" && (MENU_THEMES as readonly string[]).includes(v);
export const menuThemeOf = (v: unknown): MenuTheme => (isMenuTheme(v) ? v : DEFAULT_MENU_THEME);
