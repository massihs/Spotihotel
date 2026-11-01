/**
 * Brielle test history: 30 days of a busy Tehran restaurant (~100 guests a day), so every part of
 * the dashboard has something to show — orders, kitchen, till shifts, delivery, bookings, customer
 * club, stock, purchases, expenses, invoices and reports.
 *
 * Runs once per database (marker in `counters`), from the seed, after Brielle exists. Everything
 * is written in bulk inside one transaction, with a fixed random seed (same data on every machine).
 * SEED_BRIELLE_HISTORY=false skips it.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { DbOrTx } from "@/server/db/client";
import {
  auditLogs,
  cashMovements,
  cashShifts,
  categories,
  counters,
  coupons,
  couriers,
  customerAccountEntries,
  customerAddresses,
  customers,
  deliveryZones,
  diningTables,
  expenses,
  invoiceOrders,
  invoices,
  kitchenStations,
  loyaltyEntries,
  orderItems,
  orderStatusEvents,
  orders,
  paymentAllocations,
  payments,
  products,
  purchaseLines,
  purchases,
  recipeItems,
  reservations,
  restaurantMembers,
  restaurantSettings,
  restaurants,
  reviews,
  smsCampaigns,
  stockItems,
  stockMovements,
  suppliers,
  taxRates,
  users,
  type InvoiceSnapshot,
} from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { JOB_PRESETS } from "@/server/auth/permissions";
import { dayStart, localDay } from "@/lib/period";
import { jalaliYear } from "@/lib/jalali";
import { taxFromGross } from "@/lib/money";
import { invoiceNumber } from "@/server/modules/invoices/service";

const MARKER = "demo:history";
const DAYS = 30;
const T = 1000; // minor units per toman
const MIN = 60_000;

// ─── Deterministic randomness ────────────────────────────────────────────────
let state = 20261019;
function rnd() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
const chance = (p: number) => rnd() < p;
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
function weighted<T>(xs: readonly (readonly [T, number])[]) {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [x, w] of xs) if ((r -= w) <= 0) return x;
  return xs[xs.length - 1]![0];
}
const code = (n = 12) => randomBytes(n).toString("base64url").replace(/[-_]/g, "x").slice(0, n);
const round1000 = (c: number) => Math.round(c / (1000 * T)) * 1000 * T;

async function chunked<R>(rows: R[], insert: (part: R[]) => Promise<unknown>, size = 500) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

// ─── Reference data ──────────────────────────────────────────────────────────
/** Dishes added to fill the thin categories (no photo: the menu shows the category tile). */
const EXTRA_MENU: {
  key: string;
  name: string;
  icon?: string;
  items: { name: string; en: string; price: number; desc?: string; tags?: string[]; kcal?: number }[];
}[] = [
  {
    key: "burgers",
    name: "گریل و ساندویچ",
    items: [
      {
        name: "برگر کلاسیک بریل",
        en: "Brielle Classic Burger",
        price: 1290,
        desc: "گوشت گوساله ۱۸۰ گرمی، چدار، کاهو، گوجه، سس مخصوص",
        kcal: 820,
      },
      {
        name: "ماشروم برگر",
        en: "Mushroom Burger",
        price: 1360,
        desc: "گوشت گوساله، قارچ سوخاری، پنیر سوئیس",
        kcal: 880,
      },
      {
        name: "کلاب ساندویچ مرغ",
        en: "Chicken Club Sandwich",
        price: 1090,
        desc: "سینه مرغ گریل، بیکن، تخم‌مرغ، نان تست",
        kcal: 690,
      },
    ],
  },
  {
    key: "mains",
    name: "غذای اصلی",
    items: [
      {
        name: "استیک ریب‌آی",
        en: "Ribeye Steak",
        price: 2890,
        desc: "ریب‌آی ۲۵۰ گرمی، پوره سیب‌زمینی، سبزیجات گریل، سس قارچ",
        kcal: 980,
      },
      {
        name: "فیله مرغ گریل",
        en: "Grilled Chicken Fillet",
        price: 1490,
        desc: "فیله مرغ مرینیت، برنج زعفرانی، سالاد",
        kcal: 640,
      },
      {
        name: "میگو سوخاری",
        en: "Fried Shrimp",
        price: 1990,
        desc: "میگو سوخاری، سیب‌زمینی، سس تارتار",
        kcal: 760,
      },
    ],
  },
  {
    key: "desserts",
    name: "دسر",
    items: [
      { name: "چیزکیک نیویورکی", en: "New York Cheesecake", price: 690, tags: ["homemade"], kcal: 450 },
      { name: "تیرامیسو", en: "Tiramisu", price: 720, tags: ["homemade"], kcal: 410 },
      { name: "براونی با بستنی", en: "Brownie & Ice Cream", price: 650, kcal: 520 },
      { name: "سوفله شکلاتی", en: "Chocolate Soufflé", price: 780, tags: ["signature"], kcal: 480 },
    ],
  },
  {
    key: "coffee",
    name: "نوشیدنی گرم",
    items: [
      { name: "اسپرسو", en: "Espresso", price: 220, kcal: 5 },
      { name: "آمریکانو", en: "Americano", price: 260, kcal: 10 },
      { name: "کاپوچینو", en: "Cappuccino", price: 320, kcal: 130 },
      { name: "لاته", en: "Caffè Latte", price: 340, kcal: 180 },
      { name: "چای ماسالا", en: "Masala Chai", price: 290, kcal: 140 },
    ],
  },
  {
    key: "soft_drinks",
    name: "نوشیدنی سرد",
    items: [
      { name: "لیموناد", en: "Lemonade", price: 420, tags: ["vegan"], kcal: 120 },
      { name: "موهیتو", en: "Virgin Mojito", price: 460, tags: ["vegan"], kcal: 110 },
      { name: "آب معدنی", en: "Mineral Water", price: 90, kcal: 0 },
      { name: "نوشابه", en: "Soda", price: 120, kcal: 140 },
    ],
  },
];

type StockDef = { name: string; unit: "kg" | "l" | "piece"; cost: number; supplier: string };
const STOCK: StockDef[] = [
  { name: "آرد نان", unit: "kg", cost: 102_000, supplier: "dry" },
  { name: "پنیر موزارلا", unit: "kg", cost: 1_564_000, supplier: "dairy" },
  { name: "سس گوجه", unit: "kg", cost: 306_000, supplier: "dry" },
  { name: "سینه مرغ", unit: "kg", cost: 782_000, supplier: "meat" },
  { name: "گوشت گوساله", unit: "kg", cost: 2_805_000, supplier: "meat" },
  { name: "میگو", unit: "kg", cost: 3_145_000, supplier: "meat" },
  { name: "ماهی سالمون", unit: "kg", cost: 6_120_000, supplier: "meat" },
  { name: "بیکن", unit: "kg", cost: 2_465_000, supplier: "meat" },
  { name: "پپرونی", unit: "kg", cost: 2_125_000, supplier: "meat" },
  { name: "کاهو", unit: "kg", cost: 204_000, supplier: "veg" },
  { name: "گوجه‌فرنگی", unit: "kg", cost: 110_500, supplier: "veg" },
  { name: "خیار", unit: "kg", cost: 85_000, supplier: "veg" },
  { name: "هویج", unit: "kg", cost: 68_000, supplier: "veg" },
  { name: "سیب‌زمینی", unit: "kg", cost: 76_500, supplier: "veg" },
  { name: "پیاز", unit: "kg", cost: 51_000, supplier: "veg" },
  { name: "قارچ", unit: "kg", cost: 357_000, supplier: "veg" },
  { name: "بادمجان", unit: "kg", cost: 119_000, supplier: "veg" },
  { name: "آووکادو", unit: "piece", cost: 272_000, supplier: "veg" },
  { name: "پاستا خشک", unit: "kg", cost: 391_000, supplier: "dry" },
  { name: "خامه", unit: "l", cost: 612_000, supplier: "dairy" },
  { name: "شیر", unit: "l", cost: 144_500, supplier: "dairy" },
  { name: "پنیر فتا", unit: "kg", cost: 1_054_000, supplier: "dairy" },
  { name: "قهوه اسپرسو", unit: "kg", cost: 7_820_000, supplier: "coffee" },
  { name: "روغن", unit: "l", cost: 442_000, supplier: "dry" },
  { name: "نان باگت", unit: "piece", cost: 76_500, supplier: "dry" },
  { name: "سس مایونز", unit: "kg", cost: 527_000, supplier: "dry" },
  { name: "شکلات تلخ", unit: "kg", cost: 2_210_000, supplier: "dry" },
  { name: "شکر", unit: "kg", cost: 127_500, supplier: "dry" },
  { name: "شربت میوه", unit: "l", cost: 714_000, supplier: "dry" },
];
const SUPPLIERS: Record<string, { name: string; phone: string; every: number }> = {
  meat: { name: "پروتئین تهران", phone: "02166554433", every: 3 },
  veg: { name: "میوه و تره‌بار سبزینه", phone: "02144332211", every: 2 },
  dairy: { name: "لبنیات کاله", phone: "02188776655", every: 3 },
  dry: { name: "بازرگانی آذوقه", phone: "02133445566", every: 7 },
  coffee: { name: "قهوه رُست مهر", phone: "02122113344", every: 10 },
};

/** Recipe (stock item → quantity per portion) from the dish name and category. */
function recipeFor(name: string, cat: string): [string, number][] {
  const r: [string, number][] = [];
  const has = (...k: string[]) => k.some((x) => name.includes(x));
  if (cat === "pizza") {
    r.push(["آرد نان", 0.2], ["پنیر موزارلا", 0.16], ["سس گوجه", 0.08]);
    if (has("پپرونی")) r.push(["پپرونی", 0.09]);
    if (has("بیکن")) r.push(["بیکن", 0.08]);
    if (has("چیکن")) r.push(["سینه مرغ", 0.12]);
    if (has("بیف", "ویتلو")) r.push(["گوشت گوساله", 0.12], ["قارچ", 0.05]);
    if (has("سیسیلین")) r.push(["قارچ", 0.06]);
    if (has("مارگاریتا")) r.push(["گوجه‌فرنگی", 0.06]);
    return r;
  }
  if (cat === "pasta") {
    r.push(["پاستا خشک", 0.14], ["خامه", 0.08]);
    if (has("چیکن")) r.push(["سینه مرغ", 0.15]);
    if (has("گوشت", "بلونز")) r.push(["گوشت گوساله", 0.15], ["سس گوجه", 0.08]);
    if (has("سبزیجات")) r.push(["قارچ", 0.08], ["هویج", 0.05]);
    return r;
  }
  if (cat === "salads") {
    r.push(["کاهو", 0.15], ["گوجه‌فرنگی", 0.05], ["خیار", 0.05]);
    if (has("مرغ", "سزار")) r.push(["سینه مرغ", 0.13]);
    if (has("میگو")) r.push(["میگو", 0.12]);
    if (has("استیک", "آنتراکت")) r.push(["گوشت گوساله", 0.13]);
    if (has("بیکن")) r.push(["بیکن", 0.06], ["آووکادو", 1]);
    if (has("یونانی")) r.push(["پنیر فتا", 0.07]);
    return r;
  }
  if (cat === "burgers") {
    r.push(["نان باگت", 1], ["کاهو", 0.03], ["سیب‌زمینی", 0.18]);
    if (has("مرغ", "چیکن", "کلاب")) r.push(["سینه مرغ", 0.16]);
    else r.push(["گوشت گوساله", 0.18]);
    if (has("ماشروم")) r.push(["قارچ", 0.07]);
    return r;
  }
  if (cat === "mains") {
    if (has("سالمون")) r.push(["ماهی سالمون", 0.2]);
    else if (has("میگو")) r.push(["میگو", 0.22], ["آرد نان", 0.05], ["روغن", 0.05]);
    else if (has("استیک")) r.push(["گوشت گوساله", 0.27], ["قارچ", 0.05]);
    else r.push(["سینه مرغ", 0.22], ["آرد نان", 0.04], ["روغن", 0.04]);
    r.push(["سیب‌زمینی", 0.2]);
    return r;
  }
  if (cat === "starters") {
    if (has("میگو", "شریمپ")) r.push(["میگو", 0.12], ["سس مایونز", 0.03], ["روغن", 0.04]);
    else if (has("کراکر")) r.push(["سینه مرغ", 0.13], ["آرد نان", 0.04], ["روغن", 0.04]);
    else if (has("سیب")) r.push(["سیب‌زمینی", 0.3], ["روغن", 0.06]);
    else if (has("بادمجان", "قاسمی")) r.push(["بادمجان", 0.3], ["گوجه‌فرنگی", 0.05]);
    else if (has("رول")) r.push(["هویج", 0.05], ["کاهو", 0.03], ["آرد نان", 0.05], ["روغن", 0.05]);
    else r.push(["روغن", 0.03]);
    return r;
  }
  if (cat === "desserts") {
    if (has("چیزکیک"))
      return [
        ["پنیر فتا", 0.06],
        ["خامه", 0.06],
        ["شکر", 0.03],
      ];
    if (has("تیرامیسو"))
      return [
        ["خامه", 0.08],
        ["قهوه اسپرسو", 0.01],
        ["شکر", 0.03],
      ];
    return [
      ["شکلات تلخ", 0.06],
      ["شکر", 0.03],
      ["آرد نان", 0.03],
    ];
  }
  if (cat === "coffee") {
    if (has("ماسالا"))
      return [
        ["شیر", 0.2],
        ["شکر", 0.01],
      ];
    r.push(["قهوه اسپرسو", 0.018]);
    if (has("کاپوچینو", "لاته")) r.push(["شیر", 0.18]);
    return r;
  }
  if (cat === "soft_drinks") {
    if (has("آب معدنی", "نوشابه")) return [];
    return [
      ["شربت میوه", 0.05],
      ["شکر", 0.01],
    ];
  }
  return r;
}

const FIRST = [
  "علی",
  "محمد",
  "رضا",
  "حسین",
  "امیر",
  "مهدی",
  "سارا",
  "مریم",
  "زهرا",
  "نگار",
  "پریسا",
  "نازنین",
  "آرش",
  "کیان",
  "یاسمن",
  "الهام",
  "بهار",
  "سینا",
  "پویا",
  "مهسا",
  "فاطمه",
  "نیما",
  "شیرین",
  "کاوه",
  "ترانه",
  "بردیا",
  "هستی",
  "دانیال",
  "رها",
  "آیدا",
];
const LAST = [
  "احمدی",
  "محمدی",
  "حسینی",
  "رضایی",
  "کریمی",
  "موسوی",
  "جعفری",
  "رحیمی",
  "صادقی",
  "نوری",
  "کاظمی",
  "مرادی",
  "قاسمی",
  "شریفی",
  "فراهانی",
  "تهرانی",
  "اکبری",
  "سلطانی",
  "یزدانی",
  "نیک‌نام",
  "طاهری",
  "بهرامی",
  "زمانی",
  "عباسی",
];
const STREETS = [
  "ولیعصر، کوچه نیلوفر، پلاک ۱۲",
  "شریعتی، خیابان دولت، پلاک ۴۵",
  "پاسداران، گلستان پنجم، پلاک ۸",
  "زعفرانیه، خیابان آصف، پلاک ۲۳",
  "جردن، خیابان ناهید غربی، پلاک ۶",
  "ونک، خیابان ملاصدرا، پلاک ۸۱",
  "سعادت‌آباد، خیابان سرو، پلاک ۱۷",
  "الهیه، خیابان مریم، پلاک ۳",
  "یوسف‌آباد، خیابان ۳۳، پلاک ۹",
  "قیطریه، خیابان صدر، پلاک ۴۰",
];
const REVIEWS: Record<number, string[]> = {
  5: [
    "عالی بود، مخصوصاً پیتزا!",
    "سرویس فوق‌العاده و غذای خوشمزه",
    "بهترین سالاد سزاری که خوردم",
    "فضا خیلی دلنشین بود، حتماً دوباره میایم",
    "پرسنل خیلی مودب بودن",
    "",
  ],
  4: ["خوب بود، فقط کمی شلوغ بود", "غذا عالی، موسیقی کمی بلند", "کیفیت خوب، قیمت‌ها بالاست", ""],
  3: ["معمولی بود", "غذا دیر رسید", "پاستا کمی سرد بود"],
  2: ["سفارش با تاخیر زیاد آمد", "برگر خیلی خشک بود"],
  1: ["سفارش اشتباه آورده شد"],
};
const CANCEL_REASONS = ["مشتری منصرف شد", "اتمام موجودی", "ثبت تکراری", "تاخیر زیاد"];

// ─── Generator ───────────────────────────────────────────────────────────────
export async function seedBrielleHistory(tx: DbOrTx, restaurantId: string, ownerId: string) {
  const [done] = await tx
    .select()
    .from(counters)
    .where(and(eq(counters.restaurantId, restaurantId), eq(counters.name, MARKER)));
  if (done) return null;

  const rid = restaurantId;
  const [restaurant] = await tx.select().from(restaurants).where(eq(restaurants.id, rid));
  const [settings] = await tx
    .select()
    .from(restaurantSettings)
    .where(eq(restaurantSettings.restaurantId, rid));
  if (!restaurant || !settings) return null;
  const tz = restaurant.timezone;
  const currency = restaurant.currency;
  const now = new Date();
  const prefix = settings.orderPrefix || "B";

  // Settings: opening hours, legal details, loyalty, bookings.
  await tx
    .update(restaurantSettings)
    .set({
      openingHours:
        settings.openingHours ??
        Object.fromEntries(
          ["sat", "sun", "mon", "tue", "wed", "thu", "fri"].map((d) => [
            d,
            [{ open: "12:00", close: d === "thu" || d === "fri" ? "00:30" : "23:30" }],
          ]),
        ),
      reservationsEnabled: true,
      loyaltyEnabled: true,
      legalName: settings.legalName ?? "رستوران بریل",
    })
    .where(eq(restaurantSettings.restaurantId, rid));

  // Menu: complete the categories, details on every dish.
  const rates = await tx.select().from(taxRates).where(eq(taxRates.restaurantId, rid));
  const rate = rates.find((r) => r.rateBps === 1000) ?? rates[0];
  const cats = await tx.select().from(categories).where(eq(categories.restaurantId, rid));
  const prodNames = new Set(
    (await tx.select({ n: products.name }).from(products).where(eq(products.restaurantId, rid))).map(
      (p) => p.n,
    ),
  );
  let sort = cats.length;
  for (const extra of EXTRA_MENU) {
    let cat = cats.find((c) => c.templateKey === extra.key || c.name === extra.name);
    if (cat?.deletedAt) continue;
    if (!cat) {
      [cat] = await tx
        .insert(categories)
        .values({ restaurantId: rid, name: extra.name, templateKey: extra.key, sortOrder: sort++ })
        .returning();
      cats.push(cat!);
    }
    const newProducts = extra.items
      .filter((i) => !prodNames.has(i.name))
      .map((i, n) => ({
        restaurantId: rid,
        categoryId: cat!.id,
        name: i.name,
        description: i.desc ? `${i.en} · ${i.desc}` : i.en,
        priceCents: i.price * 1000 * T,
        taxRateId: rate?.id,
        tags: i.tags ?? [],
        caloriesKcal: i.kcal ?? null,
        sortOrder: 50 + n,
      }));
    if (newProducts.length) await tx.insert(products).values(newProducts);
  }
  const menu = await tx
    .select({ p: products, catKey: categories.templateKey, catName: categories.name })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt), isNull(categories.deletedAt)));
  // Calories / weight where missing (rough by category), allergens from the recipe.
  const KCAL: Record<string, [number, number]> = {
    starters: [280, 520],
    salads: [320, 560],
    burgers: [650, 900],
    mains: [600, 950],
    pizza: [850, 1150],
    pasta: [700, 950],
  };
  for (const { p, catKey } of menu) {
    const k = KCAL[catKey ?? ""];
    const allergens = new Set(p.allergens);
    const rec = recipeFor(p.name, catKey ?? "").map(([n]) => n);
    if (rec.some((x) => ["آرد نان", "پاستا خشک", "نان باگت"].includes(x))) allergens.add("gluten");
    if (rec.some((x) => ["پنیر موزارلا", "خامه", "شیر", "پنیر فتا"].includes(x))) allergens.add("milk");
    if (rec.includes("میگو")) allergens.add("crustaceans");
    if (rec.includes("ماهی سالمون")) allergens.add("fish");
    if (rec.includes("سس مایونز")) allergens.add("eggs");
    await tx
      .update(products)
      .set({
        caloriesKcal: p.caloriesKcal ?? (k ? int(k[0], k[1]) : null),
        weightGrams: p.weightGrams ?? (k ? int(28, 45) * 10 : null),
        allergens: [...allergens],
      })
      .where(eq(products.id, p.id));
  }
  const dishes = menu.map(({ p, catKey, catName }) => ({
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    cat: catKey ?? "",
    catName,
    price: p.priceCents,
    rateBps: rate?.rateBps ?? 0,
    // Some dishes sell much more than others (the "popular" badge, the products report).
    weight: /پپرونی|سزار|مارگاریتا|آلفردو|سالمون|شریمپ|سیب زمینی|کاپوچینو|لیموناد/.test(p.name)
      ? between(2.2, 3.2)
      : between(0.5, 1.6),
  }));
  const inCat = (...keys: string[]) => dishes.filter((d) => keys.includes(d.cat));
  const MAIN = inCat("salads", "burgers", "mains", "pizza", "pasta");
  const STARTER = inCat("starters");
  const DRINK = inCat("soft_drinks");
  const HOT = inCat("coffee");
  const DESSERT = inCat("desserts");
  const choose = (list: typeof dishes) => weighted(list.map((d) => [d, d.weight] as const));

  // Floor: two rooms, realistic sizes.
  const tables = await tx
    .select()
    .from(diningTables)
    .where(and(eq(diningTables.restaurantId, rid), isNull(diningTables.deletedAt)));
  const CAPS = [2, 2, 4, 4, 4, 4, 6, 6, 4, 4, 2, 8];
  for (const [i, t] of tables.entries())
    await tx
      .update(diningTables)
      .set({ zone: t.zone ?? (i < 8 ? "سالن اصلی" : "تراس"), capacity: CAPS[i % CAPS.length] })
      .where(eq(diningTables.id, t.id));
  const floor = tables.map((t, i) => ({ id: t.id, label: t.label, cap: CAPS[i % CAPS.length]! }));

  // Team.
  const TEAM = [
    { email: "negar.karimi@brielle.demo", name: "نگار کریمی", role: "admin" as const },
    { email: "maryam.ahmadi@brielle.demo", name: "مریم احمدی", role: "staff" as const },
    { email: "reza.mohammadi@brielle.demo", name: "رضا محمدی", role: "staff" as const },
    { email: "amir.hosseini@brielle.demo", name: "امیر حسینی", role: "staff" as const },
    { email: "hamid.rostami@brielle.demo", name: "حمید رستمی", role: "staff" as const },
  ];
  const team: string[] = [];
  for (const m of TEAM) {
    let [u] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${m.email}`);
    if (!u)
      [u] = await tx
        .insert(users)
        .values({
          email: m.email,
          fullName: m.name,
          passwordHash: await hashPassword(code(24)),
          locale: "fa",
        })
        .returning();
    await tx
      .insert(restaurantMembers)
      .values({ restaurantId: rid, userId: u!.id, role: m.role })
      .onConflictDoNothing();
    team.push(u!.id);
  }
  const [manager, cashier, waiter1, waiter2] = team as [string, string, string, string, string];

  // Kitchen stations.
  const stations = await tx.select().from(kitchenStations).where(eq(kitchenStations.restaurantId, rid));
  if (stations.length === 0) {
    const made = await tx
      .insert(kitchenStations)
      .values([
        { restaurantId: rid, name: "گرم‌خانه", color: "orange", sortOrder: 0 },
        { restaurantId: rid, name: "پیتزا", color: "rose", sortOrder: 1 },
        { restaurantId: rid, name: "سرد و سالاد", color: "emerald", sortOrder: 2 },
        { restaurantId: rid, name: "بار", color: "sky", sortOrder: 3 },
      ])
      .returning();
    const MAP: Record<string, number> = {
      mains: 0,
      burgers: 0,
      pasta: 0,
      pizza: 1,
      starters: 2,
      salads: 2,
      soft_drinks: 3,
      coffee: 3,
      desserts: 3,
    };
    for (const c of cats)
      if (c.templateKey && MAP[c.templateKey] != null)
        await tx
          .update(categories)
          .set({ stationId: made[MAP[c.templateKey]!]!.id })
          .where(eq(categories.id, c.id));
  }

  // Delivery.
  const zones = await tx
    .insert(deliveryZones)
    .values([
      {
        restaurantId: rid,
        name: "محدوده ۱ — تا ۳ کیلومتر",
        feeCents: 60_000 * T,
        minOrderCents: 800_000 * T,
        etaMinutes: 35,
        sortOrder: 0,
      },
      {
        restaurantId: rid,
        name: "محدوده ۲ — تا ۶ کیلومتر",
        feeCents: 95_000 * T,
        minOrderCents: 1_200_000 * T,
        etaMinutes: 50,
        sortOrder: 1,
      },
      {
        restaurantId: rid,
        name: "محدوده ۳ — تا ۱۰ کیلومتر",
        feeCents: 140_000 * T,
        minOrderCents: 1_800_000 * T,
        etaMinutes: 65,
        sortOrder: 2,
      },
    ])
    .returning();
  const riders = await tx
    .insert(couriers)
    .values([
      { restaurantId: rid, name: "جواد صالحی", phone: "09121110001" },
      { restaurantId: rid, name: "مسعود نادری", phone: "09121110002" },
      { restaurantId: rid, name: "حامد یوسفی", phone: "09121110003" },
      { restaurantId: rid, name: "سعید کامرانی", phone: "09121110004", isActive: false },
    ])
    .returning();

  // Customer club: a pool where regulars come back often.
  const usedPhones = new Set(
    (await tx.select({ p: customers.phone }).from(customers).where(eq(customers.restaurantId, rid))).map(
      (c) => c.p,
    ),
  );
  type Cust = {
    id: string;
    phone: string;
    name: string;
    weight: number;
    corporate: boolean;
    orders: number;
    spent: number;
    points: number;
    last: Date | null;
    first: Date | null;
    addresses: { id: string; address: string; zoneId: string }[];
  };
  const pool: Cust[] = [];
  while (pool.length < 520) {
    const phone = `09${pick(["12", "19", "35", "36", "37", "38", "39", "01", "02", "10"])}${String(int(0, 9_999_999)).padStart(7, "0")}`;
    if (usedPhones.has(phone)) continue;
    usedPhones.add(phone);
    const corporate = pool.length < 3;
    pool.push({
      id: uuidv7(),
      phone,
      name: corporate
        ? ["شرکت آریا تجارت", "دفتر معماری نقش", "استودیو پیکسل"][pool.length]!
        : `${pick(FIRST)} ${pick(LAST)}`,
      weight: corporate
        ? 6
        : pool.length < 40
          ? between(4, 9)
          : pool.length < 150
            ? between(1.2, 3)
            : between(0.2, 1),
      corporate,
      orders: 0,
      spent: 0,
      points: 0,
      last: null,
      first: null,
      addresses: [],
    });
  }
  const pickCustomer = () => weighted(pool.map((c) => [c, c.weight] as const));

  const couponRows = [
    {
      id: uuidv7(),
      restaurantId: rid,
      code: "WELCOME10",
      kind: "percent",
      value: 10,
      maxUses: 300,
      usedCount: 0,
      isActive: true,
      minOrderCents: 0,
      endsAt: null as Date | null,
    },
    {
      id: uuidv7(),
      restaurantId: rid,
      code: "BRIELLE200",
      kind: "amount",
      value: 200_000 * T,
      minOrderCents: 2_000_000 * T,
      maxUses: null,
      usedCount: 0,
      isActive: true,
      endsAt: null,
    },
    {
      id: uuidv7(),
      restaurantId: rid,
      code: "PIZZANIGHT",
      kind: "percent",
      value: 15,
      maxUses: 150,
      usedCount: 0,
      isActive: true,
      minOrderCents: 0,
      endsAt: new Date(now.getTime() + 10 * 86_400_000),
    },
  ];

  // ── Orders, day by day ──
  const [counter] = await tx
    .select()
    .from(counters)
    .where(and(eq(counters.restaurantId, rid), eq(counters.name, "order")));
  let seq = counter?.value ?? 1000;
  const cfgSpend = settings.loyaltySpendPerPointCents;

  const O: (typeof orders.$inferInsert)[] = [];
  const I: (typeof orderItems.$inferInsert)[] = [];
  const E: (typeof orderStatusEvents.$inferInsert)[] = [];
  const P: (typeof payments.$inferInsert)[] = [];
  const A: (typeof paymentAllocations.$inferInsert)[] = [];
  const L: (typeof loyaltyEntries.$inferInsert)[] = [];
  const R: (typeof reviews.$inferInsert)[] = [];
  const AC: (typeof customerAccountEntries.$inferInsert)[] = [];
  const AU: (typeof auditLogs.$inferInsert)[] = [];
  const SALES: {
    orderId: string;
    at: Date;
    items: { dishId: string; qty: number }[];
    cancelled: Date | null;
  }[] = [];
  const cashByDay = new Map<string, number>();
  const invoiceable: {
    paymentId: string;
    orderId: string;
    at: Date;
    table: string | null;
    lines: typeof I;
    total: number;
    tax: number;
    provider: string;
  }[] = [];

  let totalGuests = 0;
  const days: string[] = [];
  for (let d = DAYS - 1; d >= 0; d--) days.push(localDay(new Date(now.getTime() - d * 86_400_000), tz));
  const today = days[days.length - 1]!;

  for (const [di, day] of days.entries()) {
    const base = dayStart(day, tz).getTime();
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
    const factor =
      [0.85, 0.9, 0.95, 1.05, 1.25, 1.2, 0.85][dow]! * (0.95 + (di / DAYS) * 0.12) * between(0.9, 1.1);
    let guests = 0;
    const target = Math.round(100 * factor);
    while (guests < target) {
      const channel = weighted([
        ["dine_in", 62],
        ["takeaway", 18],
        ["delivery", 20],
      ] as const);
      const party =
        channel === "dine_in"
          ? weighted([
              [1, 10],
              [2, 40],
              [3, 18],
              [4, 20],
              [5, 6],
              [6, 6],
            ] as const)
          : weighted([
              [1, 55],
              [2, 35],
              [3, 10],
            ] as const);
      guests += party;
      const slot = weighted([
        ["lunch", 38],
        ["afternoon", 14],
        ["dinner", 48],
      ] as const);
      const minute =
        slot === "lunch"
          ? between(12 * 60, 15.5 * 60)
          : slot === "afternoon"
            ? between(15.5 * 60, 19 * 60)
            : (between(19, 23.2) + between(19, 23.2)) * 30;
      const placedAt = new Date(base + minute * MIN + int(0, 59) * 1000);
      // Recent enough to still be in progress: left out (the history only has finished orders).
      if (placedAt.getTime() > now.getTime() - 120 * MIN) continue;
      totalGuests += party;

      // What the party eats.
      const lines = new Map<string, number>();
      const add = (d: (typeof dishes)[number] | undefined) =>
        d && lines.set(d.id, (lines.get(d.id) ?? 0) + 1);
      for (let g = 0; g < party; g++) {
        add(choose(MAIN));
        if (chance(0.72)) add(chance(slot === "afternoon" ? 0.6 : 0.2) ? choose(HOT) : choose(DRINK));
      }
      for (let s = 0; s < Math.ceil(party / 2); s++) if (chance(0.55)) add(choose(STARTER));
      if (chance(channel === "dine_in" ? 0.35 : 0.12)) add(choose(DESSERT));
      if (channel === "dine_in" && chance(0.3))
        for (let g = 0; g < Math.max(1, party - 1); g++) add(choose(HOT));

      const orderId = uuidv7();
      seq++;
      const cust = channel !== "dine_in" || chance(0.42) ? pickCustomer() : null;
      const table = channel === "dine_in" ? pick(floor.filter((t) => t.cap >= Math.min(party, 8))) : null;
      const zone =
        channel === "delivery"
          ? weighted([
              [zones[0]!, 55],
              [zones[1]!, 33],
              [zones[2]!, 12],
            ] as const)
          : null;
      const staffOrder = channel !== "dine_in" || chance(0.3);
      const cancelled = chance(0.03);

      let subtotal = 0;
      let lineTax = 0;
      const myLines: typeof I = [];
      for (const [dishId, qty] of lines) {
        const d = dishes.find((x) => x.id === dishId)!;
        const total = d.price * qty;
        const tax = taxFromGross(total, d.rateBps);
        subtotal += total;
        lineTax += tax;
        myLines.push({
          id: uuidv7(),
          restaurantId: rid,
          orderId,
          productId: d.id,
          categoryId: d.categoryId,
          productName: d.name,
          categoryName: d.catName,
          unitPriceCents: d.price,
          quantity: qty,
          lineTotalCents: total,
          taxRateBps: d.rateBps,
          taxCents: tax,
          createdAt: placedAt,
        });
      }
      let discount = 0;
      let couponId: string | null = null;
      if (cust && !cancelled && chance(0.05)) {
        const c = pick(couponRows.filter((x) => x.minOrderCents <= subtotal));
        if (c) {
          discount = c.kind === "percent" ? round1000((subtotal * c.value) / 100) : c.value;
          couponId = c.id;
          c.usedCount++;
        }
      }
      const fee = zone?.feeCents ?? 0;
      const total = subtotal - discount + fee;
      const taxCents = subtotal > 0 ? Math.round(lineTax * ((subtotal - discount) / subtotal)) : 0;

      // Timeline.
      const acceptedAt = new Date(placedAt.getTime() + between(0.5, 3) * MIN);
      const preparingAt = new Date(acceptedAt.getTime() + between(1, 4) * MIN);
      const readyAt = new Date(preparingAt.getTime() + between(11, 26) * MIN);
      const dispatchedAt = channel === "delivery" ? new Date(readyAt.getTime() + between(2, 9) * MIN) : null;
      const deliveredAt = dispatchedAt ? new Date(dispatchedAt.getTime() + between(14, 42) * MIN) : null;
      const servedAt = deliveredAt ?? new Date(readyAt.getTime() + between(1, 6) * MIN);
      const cancelledAt = cancelled ? new Date(acceptedAt.getTime() + between(1, 6) * MIN) : null;
      const actor = staffOrder ? (channel === "dine_in" ? pick([waiter1, waiter2]) : cashier) : null;

      const courier = channel === "delivery" ? pick(riders.filter((r) => r.isActive || di < 12)) : null;
      const settledAt =
        deliveredAt && (day !== today || chance(0.5))
          ? new Date(dayStart(day, tz).getTime() + 23.75 * 60 * MIN)
          : null;
      O.push({
        id: orderId,
        restaurantId: rid,
        number: `${prefix}-${seq}`,
        seq,
        channel,
        tableId: table?.id ?? null,
        tableLabel: table?.label ?? null,
        status: cancelled ? "cancelled" : "served",
        paymentStatus: cancelled ? "unpaid" : "paid",
        currency,
        subtotalCents: subtotal,
        discountCents: discount,
        taxCents,
        totalCents: total,
        pricesIncludeTax: true,
        customerPhone: cust?.phone ?? null,
        customerId: cust?.id ?? null,
        couponId,
        deliveryAddress: null,
        deliveryZoneId: zone?.id ?? null,
        deliveryFeeCents: fee,
        courierId: courier?.id ?? null,
        dispatchedAt: cancelled ? null : dispatchedAt,
        deliveredAt: cancelled ? null : deliveredAt,
        courierSettledAt: cancelled ? null : settledAt && settledAt < now ? settledAt : null,
        createdByUserId: actor,
        placedAt,
        acceptedAt,
        preparingAt: cancelled ? null : preparingAt,
        readyAt: cancelled ? null : readyAt,
        servedAt: cancelled ? null : servedAt,
        cancelledAt,
        cancelReason: cancelled ? pick(CANCEL_REASONS) : null,
        createdAt: placedAt,
        updatedAt: cancelledAt ?? servedAt,
      });
      if (channel === "delivery" && cust) {
        if (cust.addresses.length === 0 || (cust.addresses.length < 2 && chance(0.1)))
          cust.addresses.push({ id: uuidv7(), address: `تهران، ${pick(STREETS)}`, zoneId: zone!.id });
        O[O.length - 1]!.deliveryAddress = pick(cust.addresses).address;
      }
      I.push(...myLines);
      SALES.push({
        orderId,
        at: placedAt,
        items: myLines.map((l) => ({ dishId: l.productId!, qty: l.quantity })),
        cancelled: cancelledAt,
      });

      const steps: [string | null, string, Date][] = cancelled
        ? [
            [null, "received", placedAt],
            ["received", "accepted", acceptedAt],
            ["accepted", "cancelled", cancelledAt!],
          ]
        : [
            [null, "received", placedAt],
            ["received", "accepted", acceptedAt],
            ["accepted", "preparing", preparingAt],
            ["preparing", "ready", readyAt],
            ["ready", "served", servedAt],
          ];
      for (const [from, to, at] of steps)
        E.push({
          restaurantId: rid,
          orderId,
          fromStatus: from as never,
          toStatus: to as never,
          actorUserId: to === "received" ? actor : pick([manager, cashier, team[4]!]),
          createdAt: at,
        });

      if (cancelled) {
        AU.push({
          restaurantId: rid,
          actorUserId: pick([manager, cashier]),
          actorType: "user",
          action: "order.cancelled",
          entityType: "order",
          entityId: orderId,
          metadata: { number: `${prefix}-${seq}`, reason: O[O.length - 1]!.cancelReason },
          createdAt: cancelledAt!,
        });
        continue;
      }

      // Payment.
      const provider =
        cust?.corporate && chance(0.7)
          ? "account"
          : channel === "delivery"
            ? weighted([
                ["cash", 45],
                ["on_site_terminal", 55],
              ] as const)
            : channel === "takeaway"
              ? weighted([
                  ["cash", 25],
                  ["on_site_terminal", 75],
                ] as const)
              : weighted([
                  ["cash", 22],
                  ["on_site_terminal", 78],
                ] as const);
      const paidAt = channel === "takeaway" ? placedAt : servedAt;
      const paymentId = uuidv7();
      P.push({
        id: paymentId,
        restaurantId: rid,
        provider,
        status: "succeeded",
        amountCents: total,
        currency,
        idempotencyKey: `demo-${orderId}`,
        recordedByUserId: cashier,
        succeededAt: paidAt,
        createdAt: paidAt,
        updatedAt: paidAt,
        metadata: {},
      });
      A.push({ restaurantId: rid, paymentId, orderId, amountCents: total, createdAt: paidAt });
      if (provider === "cash") cashByDay.set(day, (cashByDay.get(day) ?? 0) + total);
      if (provider === "account" && cust)
        AC.push({
          restaurantId: rid,
          customerId: cust.id,
          orderId,
          kind: "charge",
          amountCents: total,
          actorUserId: cashier,
          createdAt: paidAt,
        });
      if (channel === "dine_in" && chance(0.18))
        invoiceable.push({
          paymentId,
          orderId,
          at: paidAt,
          table: table?.label ?? null,
          lines: myLines,
          total,
          tax: taxCents,
          provider,
        });

      if (cust) {
        const points = settings.loyaltyEnabled ? Math.floor(total / Math.max(1, cfgSpend)) : 0;
        L.push({ restaurantId: rid, customerId: cust.id, orderId, kind: "earn", points, createdAt: paidAt });
        cust.orders++;
        cust.spent += total;
        cust.points += points;
        cust.last = paidAt;
        cust.first ??= placedAt;
      }
      if (channel === "dine_in" && chance(0.17)) {
        const rating = weighted([
          [5, 55],
          [4, 28],
          [3, 10],
          [2, 5],
          [1, 2],
        ] as const);
        R.push({
          restaurantId: rid,
          orderId,
          rating,
          comment: pick(REVIEWS[rating]!) || null,
          createdAt: new Date(Math.min(now.getTime(), servedAt.getTime() + between(5, 40) * MIN)),
        });
      }
    }
  }

  // Corporate customers pay part of their house account back.
  for (const c of pool.filter((x) => x.corporate)) {
    const owed = AC.filter((e) => e.customerId === c.id).reduce((s, e) => s + Number(e.amountCents), 0);
    if (owed <= 0) continue;
    const paid = round1000(owed * between(0.55, 0.75));
    AC.push({
      restaurantId: rid,
      customerId: c.id,
      kind: "payment",
      amountCents: -paid,
      method: "transfer",
      note: "واریز ماهانه",
      actorUserId: manager,
      createdAt: new Date(now.getTime() - 6 * 86_400_000),
    });
  }

  // ── Customers ──
  const active = pool.filter((c) => c.orders > 0 || c.corporate);
  await chunked(active, (part) =>
    tx.insert(customers).values(
      part.map((c) => {
        const balance = AC.filter((e) => e.customerId === c.id).reduce(
          (s, e) => s + Number(e.amountCents),
          0,
        );
        return {
          id: c.id,
          restaurantId: rid,
          phone: c.phone,
          name: c.name,
          points: c.points,
          ordersCount: c.orders,
          totalSpentCents: c.spent,
          lastOrderAt: c.last,
          creditLimitCents: c.corporate ? 150_000_000 * T : null,
          balanceCents: c.corporate ? Math.max(0, balance) : 0,
          note: c.corporate ? "مشتری سازمانی — صورتحساب ماهانه" : c.orders >= 8 ? "مشتری ثابت" : null,
          createdAt: c.first ?? now,
          updatedAt: c.last ?? now,
        };
      }),
    ),
  );
  await chunked(
    active.flatMap((c) =>
      c.addresses.map((a, i) => ({
        id: a.id,
        restaurantId: rid,
        customerId: c.id,
        label: i === 0 ? "خانه" : "محل کار",
        address: a.address,
        zoneId: a.zoneId,
      })),
    ),
    (part) => tx.insert(customerAddresses).values(part),
  );
  await tx.insert(coupons).values(couponRows);

  // ── Orders and money ──
  await chunked(O, (part) => tx.insert(orders).values(part));
  await chunked(I, (part) => tx.insert(orderItems).values(part));
  await chunked(E, (part) => tx.insert(orderStatusEvents).values(part), 1000);
  await chunked(P, (part) => tx.insert(payments).values(part));
  await chunked(A, (part) => tx.insert(paymentAllocations).values(part), 1000);
  await chunked(L, (part) => tx.insert(loyaltyEntries).values(part), 1000);
  await chunked(R, (part) => tx.insert(reviews).values(part));
  if (AC.length) await chunked(AC, (part) => tx.insert(customerAccountEntries).values(part));
  await tx
    .insert(counters)
    .values({ restaurantId: rid, name: "order", value: seq })
    .onConflictDoUpdate({
      target: [counters.restaurantId, counters.name],
      set: { value: sql`greatest(${counters.value}, ${seq})` },
    });

  // ── Inventory: stock items, recipes, purchases, sales ──
  const supplierRows = await tx
    .insert(suppliers)
    .values(Object.values(SUPPLIERS).map((s) => ({ restaurantId: rid, name: s.name, phone: s.phone })))
    .returning();
  const supplierId = Object.fromEntries(Object.keys(SUPPLIERS).map((k, i) => [k, supplierRows[i]!.id]));
  const itemRows = await tx
    .insert(stockItems)
    .values(
      STOCK.map((s) => ({
        restaurantId: rid,
        name: s.name,
        unit: s.unit,
        quantity: 0,
        avgCostCents: s.cost * T,
      })),
    )
    .returning();
  const itemId = new Map(STOCK.map((s, i) => [s.name, itemRows[i]!.id]));
  const recipes = new Map<string, [string, number][]>();
  const RI: (typeof recipeItems.$inferInsert)[] = [];
  for (const d of dishes) {
    const rec = recipeFor(d.name, d.cat).filter(([n]) => itemId.has(n));
    recipes.set(d.id, rec);
    for (const [n, q] of rec)
      RI.push({ restaurantId: rid, productId: d.id, stockItemId: itemId.get(n)!, quantity: q });
  }
  await chunked(RI, (part) => tx.insert(recipeItems).values(part).onConflictDoNothing());

  // Consumption per item per day, then purchases that cover it.
  const use = new Map<string, Map<string, number>>(); // item → day → qty
  const MV: (typeof stockMovements.$inferInsert)[] = [];
  for (const s of SALES) {
    const per = new Map<string, number>();
    for (const it of s.items)
      for (const [n, q] of recipes.get(it.dishId) ?? []) per.set(n, (per.get(n) ?? 0) + q * it.qty);
    const day = localDay(s.at, tz);
    for (const [n, q] of per) {
      const m = use.get(n) ?? new Map();
      if (!s.cancelled) m.set(day, (m.get(day) ?? 0) + q);
      use.set(n, m);
      const cost = STOCK.find((x) => x.name === n)!.cost * T;
      MV.push({
        restaurantId: rid,
        stockItemId: itemId.get(n)!,
        kind: "sale",
        quantity: -round3(q),
        unitCostCents: cost,
        orderId: s.orderId,
        createdAt: s.at,
      });
      if (s.cancelled)
        MV.push({
          restaurantId: rid,
          stockItemId: itemId.get(n)!,
          kind: "sale_cancel",
          quantity: round3(q),
          unitCostCents: cost,
          orderId: s.orderId,
          createdAt: s.cancelled,
        });
    }
  }
  const dailyUse = (n: string, from: number, len: number) => {
    let q = 0;
    for (let i = from; i < Math.min(days.length, from + len); i++) q += use.get(n)?.get(days[i]!) ?? 0;
    return q;
  };
  const PU: (typeof purchases.$inferInsert)[] = [];
  const PL: (typeof purchaseLines.$inferInsert)[] = [];
  const level = new Map<string, number>();
  const costAcc = new Map<string, { q: number; c: number }>();
  const start = new Date(dayStart(days[0]!, tz).getTime() + 9 * 60 * MIN);
  for (const s of STOCK) {
    const raw = dailyUse(s.name, 0, SUPPLIERS[s.supplier]!.every + 1) * 1.15 + 1;
    const opening = s.unit === "piece" ? Math.ceil(raw) : round3(raw);
    level.set(s.name, opening);
    costAcc.set(s.name, { q: opening, c: opening * s.cost * T });
    MV.push({
      restaurantId: rid,
      stockItemId: itemId.get(s.name)!,
      kind: "adjustment",
      quantity: opening,
      unitCostCents: s.cost * T,
      note: "موجودی اول دوره (شمارش انبار)",
      userId: manager,
      createdAt: start,
    });
  }
  for (const [di, day] of days.entries()) {
    for (const [key, sup] of Object.entries(SUPPLIERS)) {
      if (di === 0 || di % sup.every !== 0) continue;
      const at = new Date(dayStart(day, tz).getTime() + between(9.5, 11.5) * 60 * MIN);
      const purchaseId = uuidv7();
      let totalCents = 0;
      for (const s of STOCK.filter((x) => x.supplier === key)) {
        const need =
          dailyUse(s.name, di, sup.every + 2) * between(1.05, 1.25) - (level.get(s.name) ?? 0) * 0.4;
        if (need <= 0.05) continue;
        const q = s.unit === "piece" ? Math.ceil(need) : Math.ceil(need * 2) / 2;
        const unit = Math.round(s.cost * between(0.95, 1.08) * (1 + di * 0.002)) * T;
        totalCents += Math.round(q * unit);
        PL.push({ purchaseId, stockItemId: itemId.get(s.name)!, quantity: q, unitCostCents: unit });
        MV.push({
          restaurantId: rid,
          stockItemId: itemId.get(s.name)!,
          kind: "purchase",
          quantity: q,
          unitCostCents: unit,
          purchaseId,
          userId: manager,
          createdAt: at,
        });
        level.set(s.name, (level.get(s.name) ?? 0) + q);
        const acc = costAcc.get(s.name)!;
        costAcc.set(s.name, { q: acc.q + q, c: acc.c + q * unit });
      }
      if (totalCents > 0)
        PU.push({
          id: purchaseId,
          restaurantId: rid,
          supplierId: supplierId[key]!,
          reference: `F-${int(10000, 99999)}`,
          totalCents,
          purchasedAt: at,
          userId: manager,
          createdAt: at,
          updatedAt: at,
        });
    }
    for (const s of STOCK) level.set(s.name, (level.get(s.name) ?? 0) - (use.get(s.name)?.get(day) ?? 0));
  }
  // A few items run low today (the stock alerts), one through recorded waste.
  const LOW = ["آووکادو", "میگو", "خامه"];
  for (const s of STOCK) {
    // Alert below 1.5 days of use (whole units for pieces); unused items never alert.
    const perDay = dailyUse(s.name, days.length - 8, 7) / 7;
    const threshold =
      perDay > 0 ? (s.unit === "piece" ? Math.ceil(perDay * 1.5) : round3(Math.max(0.5, perDay * 1.5))) : 0;
    let q = round3(level.get(s.name) ?? 0);
    if (LOW.includes(s.name) && q > threshold * 0.4) {
      const keep = s.unit === "piece" ? Math.floor(threshold * 0.4) : threshold * 0.4;
      const waste = round3(q - keep);
      MV.push({
        restaurantId: rid,
        stockItemId: itemId.get(s.name)!,
        kind: "waste",
        quantity: -waste,
        unitCostCents: s.cost * T,
        note: "ضایعات / تاریخ گذشته",
        userId: manager,
        createdAt: new Date(now.getTime() - 3 * 60 * MIN),
      });
      q = round3(q - waste);
    }
    if (q < 0) {
      MV.push({
        restaurantId: rid,
        stockItemId: itemId.get(s.name)!,
        kind: "adjustment",
        quantity: -q,
        unitCostCents: s.cost * T,
        note: "اصلاح شمارش",
        userId: manager,
        createdAt: new Date(now.getTime() - 2 * 60 * MIN),
      });
      q = 0;
    }
    const acc = costAcc.get(s.name)!;
    await tx
      .update(stockItems)
      .set({
        quantity: q,
        lowStockThreshold: threshold,
        avgCostCents: Math.round(acc.c / Math.max(acc.q, 0.001)),
      })
      .where(eq(stockItems.id, itemId.get(s.name)!));
  }
  await chunked(PU, (part) => tx.insert(purchases).values(part));
  await chunked(PL, (part) => tx.insert(purchaseLines).values(part), 1000);
  await chunked(MV, (part) => tx.insert(stockMovements).values(part), 1000);

  // ── Till shifts ──
  const openShift = await tx
    .select({ id: cashShifts.id })
    .from(cashShifts)
    .where(and(eq(cashShifts.restaurantId, rid), isNull(cashShifts.closedAt)));
  const SH: (typeof cashShifts.$inferInsert)[] = [];
  const CM: (typeof cashMovements.$inferInsert)[] = [];
  for (const day of days) {
    const base = dayStart(day, tz).getTime();
    const openedAt = new Date(base + 11.5 * 60 * MIN);
    if (openedAt > now) continue;
    const id = uuidv7();
    const float = 2_000_000 * T;
    const isToday = day === today;
    if (isToday && openShift.length) continue;
    let moves = 0;
    if (chance(0.5)) {
      const out = round1000(between(250_000, 900_000) * T);
      CM.push({
        restaurantId: rid,
        shiftId: id,
        direction: "out",
        amountCents: out,
        reason: pick(["خرید نان و سبزی", "خرید یخ", "پیک موتوری", "خرید لوازم تحریر"]),
        userId: cashier,
        createdAt: new Date(base + 16 * 60 * MIN),
      });
      moves -= out;
    }
    if (chance(0.25)) {
      const inn = 1_000_000 * T;
      CM.push({
        restaurantId: rid,
        shiftId: id,
        direction: "in",
        amountCents: inn,
        reason: "پول خرد",
        userId: manager,
        createdAt: new Date(base + 13 * 60 * MIN),
      });
      moves += inn;
    }
    const expected = float + (cashByDay.get(day) ?? 0) + moves;
    const closedAt = isToday ? null : new Date(base + (23.9 + between(0, 0.6)) * 60 * MIN);
    const counted = closedAt
      ? expected +
        weighted([
          [0, 70],
          [-round1000(between(20_000, 150_000) * T), 22],
          [round1000(between(10_000, 50_000) * T), 8],
        ] as const)
      : null;
    SH.push({
      id,
      restaurantId: rid,
      openedByUserId: cashier,
      openedAt,
      openingFloatCents: float,
      closedByUserId: closedAt ? manager : null,
      closedAt,
      expectedCashCents: closedAt ? expected : null,
      countedCashCents: counted,
      note: counted != null && counted !== expected ? "اختلاف صندوق بررسی شد" : null,
      createdAt: openedAt,
      updatedAt: closedAt ?? openedAt,
    });
    if (closedAt) {
      AU.push({
        restaurantId: rid,
        actorUserId: manager,
        actorType: "user",
        action: "cash.shift_closed",
        entityType: "cash_shift",
        entityId: id,
        metadata: { expectedCents: expected, countedCents: counted },
        createdAt: closedAt,
      });
      AU.push({
        restaurantId: rid,
        actorUserId: manager,
        actorType: "user",
        action: "delivery.courier_settled",
        entityType: "courier",
        entityId: pick(riders).id,
        metadata: {},
        createdAt: new Date(closedAt.getTime() - 10 * MIN),
      });
    }
  }
  await chunked(SH, (part) => tx.insert(cashShifts).values(part));
  if (CM.length) await chunked(CM, (part) => tx.insert(cashMovements).values(part));

  // ── Expenses ──
  const dayAt = (d: number, h = 10) =>
    new Date(dayStart(days[Math.max(0, Math.min(days.length - 1, d))]!, tz).getTime() + h * 60 * MIN);
  const EX: [string, number, string, string, number][] = [
    ["rent", 480_000_000, "اجاره ماهانه ملک", "transfer", 3],
    ["salaries", 1_150_000_000, "حقوق پرسنل (۲۴ نفر)", "transfer", 1],
    ["salaries", 260_000_000, "بیمه تأمین اجتماعی پرسنل", "transfer", 2],
    ["salaries", 85_000_000, "اضافه‌کار آخر هفته", "cash", 22],
    ["utilities", 38_000_000, "قبض برق", "card", 8],
    ["utilities", 14_000_000, "قبض گاز", "card", 9],
    ["utilities", 6_500_000, "قبض آب", "card", 9],
    ["utilities", 1_900_000, "اینترنت و تلفن", "card", 12],
    ["marketing", 60_000_000, "تبلیغات اینستاگرام", "card", 5],
    ["marketing", 18_000_000, "عکاسی منوی جدید", "transfer", 19],
    ["maintenance", 6_500_000, "سرویس فر پیتزا", "cash", 11],
    ["maintenance", 4_800_000, "تعمیر یخچال ایستاده", "cash", 24],
    ["supplies", 3_200_000, "مواد شوینده", "cash", 4],
    ["supplies", 7_500_000, "ظروف یکبار مصرف و جعبه پیتزا", "card", 10],
    ["supplies", 3_400_000, "مواد شوینده", "cash", 18],
    ["supplies", 7_900_000, "ظروف یکبار مصرف و جعبه پیتزا", "card", 25],
    ["other", 12_000_000, "کارمزد کارتخوان", "transfer", 28],
    ["other", 30_000_000, "حق‌الزحمه حسابدار", "transfer", 27],
    ["taxes", 95_000_000, "عوارض شهرداری و مالیات علی‌الحساب", "transfer", 15],
  ];
  await tx.insert(expenses).values(
    EX.map(([category, amount, description, method, d]) => ({
      restaurantId: rid,
      category,
      amountCents: amount * T,
      description,
      method,
      paidAt: dayAt(d),
      createdByUserId: manager,
      createdAt: dayAt(d),
    })),
  );

  // ── Bookings and walk-in queue ──
  const RS: (typeof reservations.$inferInsert)[] = [];
  const allDays = [
    ...days,
    ...Array.from({ length: 7 }, (_, i) => localDay(new Date(now.getTime() + (i + 1) * 86_400_000), tz)),
  ];
  for (const day of allDays) {
    const base = dayStart(day, tz).getTime();
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const busy = dow === 4 || dow === 5;
    const n = busy ? int(10, 16) : int(4, 9);
    for (let k = 0; k < n; k++) {
      const startsAt = new Date(base + (chance(0.3) ? int(26, 28) * 30 : int(39, 44) * 30) * MIN);
      const past = startsAt < now;
      const c = chance(0.6) ? pickCustomer() : null;
      const status = past
        ? weighted([
            ["completed", 82],
            ["no_show", 7],
            ["cancelled", 11],
          ] as const)
        : weighted([
            ["confirmed", 85],
            ["pending", 15],
          ] as const);
      const table = floor.length ? pick(floor) : null;
      RS.push({
        restaurantId: rid,
        kind: "booking",
        code: code(),
        name: c?.name ?? `${pick(FIRST)} ${pick(LAST)}`,
        phone: c?.phone ?? `0912${String(int(0, 9_999_999)).padStart(7, "0")}`,
        partySize: weighted([
          [2, 40],
          [3, 15],
          [4, 25],
          [5, 8],
          [6, 8],
          [8, 4],
        ] as const),
        startsAt,
        durationMin: 90,
        area: weighted([
          ["any", 60],
          ["indoor", 25],
          ["outdoor", 15],
        ] as const),
        tableId: status === "cancelled" ? null : (table?.id ?? null),
        status,
        source: weighted([
          ["online", 55],
          ["phone", 45],
        ] as const),
        note: chance(0.12) ? pick(["تولد — لطفاً شمع", "صندلی کودک", "میز کنار پنجره"]) : null,
        customerId: c && active.includes(c) ? c.id : null,
        reminderSentAt:
          past || startsAt.getTime() - now.getTime() < 3 * 3600_000
            ? new Date(startsAt.getTime() - 2 * 3600_000)
            : null,
        seatedAt: status === "completed" ? new Date(startsAt.getTime() + int(0, 15) * MIN) : null,
        createdByUserId: manager,
        createdAt: new Date(startsAt.getTime() - int(1, 72) * 3600_000),
        updatedAt: startsAt,
      });
    }
    // Walk-in queue on busy nights (and today's evening).
    const localHour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now),
    );
    if ((busy && day < today) || (day === today && localHour >= 13)) {
      const q = day === today ? 4 : int(6, 12);
      for (let k = 1; k <= q; k++) {
        const startsAt = new Date(base + (20 * 60 + k * int(6, 12)) * MIN);
        if (startsAt > new Date(now.getTime() + 60 * MIN) && day !== today) continue;
        const waiting = startsAt > now;
        RS.push({
          restaurantId: rid,
          kind: "queue",
          code: code(),
          queueNumber: k,
          name: `${pick(FIRST)} ${pick(LAST)}`,
          phone: `0935${String(int(0, 9_999_999)).padStart(7, "0")}`,
          partySize: weighted([
            [2, 50],
            [3, 20],
            [4, 25],
            [6, 5],
          ] as const),
          startsAt: waiting ? now : startsAt,
          status: waiting
            ? "confirmed"
            : weighted([
                ["completed", 80],
                ["cancelled", 20],
              ] as const),
          source: "walk_in",
          seatedAt: waiting ? null : new Date(startsAt.getTime() + int(10, 30) * MIN),
          createdAt: waiting ? now : startsAt,
          updatedAt: now,
        });
      }
      if (day === today)
        await tx
          .insert(counters)
          .values({ restaurantId: rid, name: `queue:${today}`, value: q })
          .onConflictDoUpdate({
            target: [counters.restaurantId, counters.name],
            set: { value: sql`greatest(${counters.value}, ${q})` },
          });
    }
  }
  await chunked(RS, (part) => tx.insert(reservations).values(part));

  // ── SMS campaigns ──
  await tx.insert(smsCampaigns).values([
    {
      restaurantId: rid,
      message: "پنجشنبه‌شب‌ها پیتزا با ۱۵٪ تخفیف! کد PIZZANIGHT — رستوران بریل",
      audience: "all",
      recipients: active.length - 12,
      sent: active.length - 19,
      createdByUserId: manager,
      createdAt: dayAt(9, 17),
    },
    {
      restaurantId: rid,
      message: "دلمون براتون تنگ شده! با کد WELCOME10 مهمون ما باشید.",
      audience: "inactive",
      recipients: 64,
      sent: 61,
      createdByUserId: manager,
      createdAt: dayAt(21, 12),
    },
  ]);

  // ── Invoices (part of the dine-in bills) ──
  const year0 = jalaliYear(now, tz);
  const [ic] = await tx
    .select()
    .from(counters)
    .where(and(eq(counters.restaurantId, rid), eq(counters.name, `invoice:${year0}`)));
  let iseq = ic?.value ?? 0;
  const INV: (typeof invoices.$inferInsert)[] = [];
  const INVO: (typeof invoiceOrders.$inferInsert)[] = [];
  const orderById = new Map(O.map((o) => [o.id!, o]));
  for (const v of invoiceable.sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (jalaliYear(v.at, tz) !== year0) continue;
    iseq++;
    const o = orderById.get(v.orderId)!;
    const base = v.total - v.tax;
    const snapshot: InvoiceSnapshot = {
      version: 2,
      seller: {
        tradeName: restaurant.name,
        name: settings.legalName || "رستوران بریل",
        nationalId: settings.legalId,
        economicCode: settings.vatNumber,
        registrationNumber: settings.registrationNumber,
        address: restaurant.addressLine1,
        city: restaurant.city,
        postalCode: restaurant.postalCode,
        phone: restaurant.phone,
      },
      buyer: null,
      tableLabel: v.table,
      orders: [{ number: o.number, placedAt: o.placedAt!.toISOString() }],
      lines: v.lines.map((l) => ({
        name: l.productName,
        options: [],
        quantity: l.quantity,
        unitPriceCents: Number(l.unitPriceCents),
        lineTotalCents: Number(l.lineTotalCents),
        taxRateBps: l.taxRateBps ?? 0,
      })),
      pricesIncludeTax: true,
      taxes: [{ rateBps: rate?.rateBps ?? 0, baseCents: base, taxCents: v.tax }],
      subtotalCents: v.lines.reduce((s, l) => s + Number(l.lineTotalCents), 0),
      discountCents: 0,
      taxCents: v.tax,
      totalCents: v.total,
      currency,
      payments: [{ provider: v.provider, amountCents: v.total, at: v.at.toISOString(), reference: null }],
      notes: settings.legalNotice,
    };
    const id = uuidv7();
    INV.push({
      id,
      restaurantId: rid,
      number: invoiceNumber(year0, iseq),
      seq: iseq,
      paymentId: v.paymentId,
      currency,
      totalCents: v.total,
      taxCents: v.tax,
      snapshot,
      publicToken: code(24),
      issuedAt: new Date(v.at.getTime() + 2 * MIN),
      createdAt: v.at,
    });
    INVO.push({ invoiceId: id, orderId: v.orderId, restaurantId: rid });
  }
  await chunked(INV, (part) => tx.insert(invoices).values(part));
  await chunked(INVO, (part) => tx.insert(invoiceOrders).values(part));
  if (INV.length)
    await tx
      .insert(counters)
      .values({ restaurantId: rid, name: `invoice:${year0}`, value: iseq })
      .onConflictDoUpdate({
        target: [counters.restaurantId, counters.name],
        set: { value: sql`greatest(${counters.value}, ${iseq})` },
      });

  // ── Audit trail (security report) ──
  AU.push(
    {
      restaurantId: rid,
      actorUserId: manager,
      actorType: "user",
      action: "product.updated",
      entityType: "product",
      entityId: dishes[0]!.id,
      metadata: { fields: ["priceCents"] },
      createdAt: dayAt(14, 11),
    },
    {
      restaurantId: rid,
      actorUserId: ownerId,
      actorType: "user",
      action: "customer.credit_limit_set",
      entityType: "customer",
      entityId: pool[0]!.id,
      metadata: { limitCents: 150_000_000 * T },
      createdAt: dayAt(0, 12),
    },
  );
  await chunked(AU, (part) => tx.insert(auditLogs).values(part));

  await tx.insert(counters).values({ restaurantId: rid, name: MARKER, value: 1 });
  return {
    orders: O.length,
    guestsPerDay: Math.round(totalGuests / DAYS),
    customers: active.length,
    reservations: RS.length,
    purchases: PU.length,
    invoices: INV.length,
  };
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** Jobs of the Brielle test team (set once; the owner can change them afterwards). */
export async function assignBrielleJobs(tx: DbOrTx, restaurantId: string) {
  const JOBS_BY_EMAIL: Record<string, "manager" | "cashier" | "waiter" | "kitchen"> = {
    "negar.karimi@brielle.demo": "manager",
    "maryam.ahmadi@brielle.demo": "cashier",
    "reza.mohammadi@brielle.demo": "waiter",
    "amir.hosseini@brielle.demo": "waiter",
    "hamid.rostami@brielle.demo": "kitchen",
  };
  // The hot line if the history created it, otherwise the first station.
  const stations = await tx
    .select({ id: kitchenStations.id, name: kitchenStations.name })
    .from(kitchenStations)
    .where(eq(kitchenStations.restaurantId, restaurantId))
    .orderBy(kitchenStations.sortOrder);
  const hot = stations.find((s) => s.name === "گرم‌خانه") ?? stations[0];
  for (const [email, job] of Object.entries(JOBS_BY_EMAIL)) {
    const [u] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (!u) continue;
    const p = JOB_PRESETS[job];
    await tx
      .update(restaurantMembers)
      .set({
        job,
        role: p.role,
        grantedPermissions: p.granted,
        revokedPermissions: p.revoked,
        stationId: job === "kitchen" ? (hot?.id ?? null) : null,
      })
      .where(
        and(
          eq(restaurantMembers.restaurantId, restaurantId),
          eq(restaurantMembers.userId, u.id),
          isNull(restaurantMembers.job),
        ),
      );
  }
}

/**
 * Puts Brielle in the public restaurant guide, once (marker `demo:listing`): what the owner
 * changes afterwards in Settings › Guide is never overwritten.
 */
export async function listBrielle(tx: DbOrTx, restaurantId: string) {
  const [done] = await tx
    .select({ id: counters.restaurantId })
    .from(counters)
    .where(and(eq(counters.restaurantId, restaurantId), eq(counters.name, "demo:listing")));
  if (done) return false;
  await tx
    .update(restaurants)
    .set({
      listed: true,
      cuisines: ["international", "asian", "pizza", "seafood"],
      priceLevel: 3,
      tagline: "آشپزی بین‌المللی: غذاهای آسیایی، پیتزا و پاستا، سالاد و دریایی",
    })
    .where(eq(restaurants.id, restaurantId));
  await tx.insert(counters).values({ restaurantId, name: "demo:listing", value: 1 });
  return true;
}
