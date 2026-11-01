/**
 * Category icon library: 80 keys (lucide icon names) in 5 groups, plus the default icon of each
 * category template. Pure data, shared by the server (validation) and the UI (rendering).
 */
export const CATEGORY_ICON_GROUPS = {
  dishes: [
    "utensils",
    "utensils-crossed",
    "chef-hat",
    "hand-platter",
    "cooking-pot",
    "soup",
    "salad",
    "pizza",
    "hamburger",
    "sandwich",
    "beef",
    "ham",
    "drumstick",
    "fish",
    "shrimp",
    "egg",
    "egg-fried",
    "flame",
    "wheat",
    "croissant",
  ],
  sweets: [
    "cake",
    "cake-slice",
    "cupcake",
    "dessert",
    "donut",
    "cookie",
    "ice-cream-cone",
    "ice-cream-bowl",
    "popsicle",
    "candy",
    "candy-cane",
    "lollipop",
    "popcorn",
  ],
  produce: [
    "apple",
    "banana",
    "cherry",
    "citrus",
    "grape",
    "carrot",
    "leafy-green",
    "bean",
    "nut",
    "vegan",
    "sprout",
    "leaf",
  ],
  drinks: [
    "coffee",
    "cup-soda",
    "can-soda",
    "glass-water",
    "milk",
    "blend",
    "droplets",
    "snowflake",
    "thermometer-sun",
    "wine",
    "bottle-wine",
    "beer",
    "hop",
    "martini",
  ],
  other: [
    "star",
    "sparkles",
    "heart",
    "gift",
    "crown",
    "award",
    "medal",
    "thumbs-up",
    "percent",
    "badge-percent",
    "tag",
    "clock",
    "timer",
    "sun",
    "sunrise",
    "moon",
    "baby",
    "users",
    "party-popper",
    "cigarette",
    "zap",
  ],
} as const;

export type CategoryIconGroup = keyof typeof CATEGORY_ICON_GROUPS;
export type CategoryIconKey = (typeof CATEGORY_ICON_GROUPS)[CategoryIconGroup][number];

export const CATEGORY_ICON_KEYS = Object.values(CATEGORY_ICON_GROUPS).flat() as CategoryIconKey[];

export const isCategoryIcon = (v: unknown): v is CategoryIconKey =>
  typeof v === "string" && (CATEGORY_ICON_KEYS as string[]).includes(v);

/** Icon shown for a template category until the owner picks another one. */
export const TEMPLATE_ICONS: Record<string, CategoryIconKey> = {
  starters: "hand-platter",
  salads: "salad",
  soups: "soup",
  mains: "cooking-pot",
  steak: "beef",
  pizza: "pizza",
  pasta: "wheat",
  burger: "hamburger",
  burgers: "hamburger",
  sandwich: "sandwich",
  fish: "fish",
  meat: "ham",
  chicken: "drumstick",
  vegetarian: "vegan",
  kids: "baby",
  desserts: "cake-slice",
  ice_cream: "ice-cream-cone",
  coffee: "coffee",
  tea: "leaf",
  soft_drinks: "cup-soda",
  cocktails: "martini",
  wines: "wine",
  beers: "beer",
  breakfast: "egg-fried",
  brunch: "croissant",
};

/** The icon to display: the chosen one, else the template's, else a neutral plate. */
export function resolveCategoryIcon(icon: string | null | undefined, templateKey?: string | null) {
  if (isCategoryIcon(icon)) return icon;
  return (templateKey && TEMPLATE_ICONS[templateKey]) || "utensils";
}
