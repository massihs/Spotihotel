/**
 * Development seed. Idempotent: safe to run several times.
 *   npm run db:seed
 * Creates plans, global category templates, a super admin and "Restaurant Demo" (20 tables, menu).
 */
import "dotenv/config";
import { edition } from "@/config/edition";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { db, type DbOrTx } from "@/server/db/client";
import {
  categories,
  diningTables,
  orders,
  globalCategoryTemplates,
  optionGroups,
  optionValues,
  plans,
  productOptionGroups,
  productImages,
  products,
  restaurants,
  taxRates,
  users,
  restaurantMembers,
  restaurantSettings,
  subscriptions,
} from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { DEFAULT_CATEGORY_TEMPLATES, DEFAULT_PLANS } from "@/server/modules/catalog/defaults";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import { randomToken } from "@/lib/ids";
import { loadRestaurantContext } from "@/server/tenancy";
import { addProductImage, deleteProductImage } from "@/server/modules/menu/images";
import { dishSvg } from "./demo-art";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { enterTableByQr, loadGuestContext, renameParticipant } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { newIdempotencyKey, recordStaffPayment } from "@/server/modules/payments/service";
import type { OrderStatus } from "@/server/modules/orders/status";
import { uploadLogo } from "@/server/modules/restaurants/settings";
import { storage } from "@/server/infra/storage";
import { readFile } from "node:fs/promises";
import { backfillNutrition, syncFoods } from "@/server/modules/nutrition/foods";
import { BRIELLE_MENU } from "./brielle";
import { seedDemoHotel } from "./seed-hotel";
import { assignBrielleJobs, listBrielle, seedBrielleHistory } from "./brielle-history";

const DEMO_OWNER = {
  email: "owner@demo.spotihotel.local",
  password: "DemoOwner!2026",
  fullName: "علی رضایی",
};
const DEMO_STAFF = {
  email: "staff@demo.spotihotel.local",
  password: "DemoStaff!2026",
  fullName: "مریم احمدی",
};

async function upsertUser(email: string, password: string, fullName: string, isSuperAdmin = false) {
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (existing) {
    // The account named by SEED_SUPERADMIN_EMAIL is the platform admin even if it signed up
    // as a restaurant owner first; its password is never touched.
    if (isSuperAdmin && !existing.isSuperAdmin) {
      const [promoted] = await db
        .update(users)
        .set({ isSuperAdmin: true })
        .where(eq(users.id, existing.id))
        .returning();
      return promoted!;
    }
    return existing;
  }
  const [created] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      fullName,
      isSuperAdmin,
    })
    .returning();
  return created!;
}

type DemoProduct = {
  name: string;
  description: string;
  /** Price in tomans (stored ×1000: 1 toman = 10 rials = 1000 minor units). */
  price: number;
  ingredients?: string;
  allergens?: string[];
  kcal?: number;
  weight?: number;
  featured?: boolean;
  tags?: string[];
  options?: ("side" | "extras" | "skewer")[];
};

const toman = (t: number) => t * 1000;

/** Demo menu of a typical Iranian restaurant (prices are plausible placeholders, in tomans). */
const MENU: { key: string; name: string; items: DemoProduct[] }[] = [
  {
    key: "starters",
    name: "پیش‌غذا",
    items: [
      {
        name: "کشک بادمجان",
        description: "بادمجان کبابی، کشک محلی، نعناع داغ و گردو.",
        price: 180_000,
        ingredients: "بادمجان، کشک، نعناع، پیاز داغ، گردو",
        allergens: ["milk", "nuts"],
        kcal: 380,
        featured: true,
        tags: ["vegetarian"],
      },
      {
        name: "میرزا قاسمی",
        description: "بادمجان دودی، گوجه، سیر و تخم‌مرغ به سبک گیلان.",
        price: 170_000,
        allergens: ["eggs"],
        kcal: 320,
        tags: ["vegetarian"],
      },
      {
        name: "ماست و خیار",
        description: "ماست پرچرب، خیار، نعناع خشک و گل محمدی.",
        price: 120_000,
        allergens: ["milk"],
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "soups",
    name: "سوپ و آش",
    items: [
      {
        name: "آش رشته",
        description: "رشته، حبوبات، سبزی معطر، کشک و پیاز داغ.",
        price: 150_000,
        allergens: ["gluten", "milk"],
        kcal: 450,
        tags: ["vegetarian"],
      },
      { name: "سوپ جو", description: "جو پرک، مرغ، هویج و جعفری.", price: 120_000, allergens: ["gluten"] },
    ],
  },
  {
    key: "salads",
    name: "سالاد",
    items: [
      {
        name: "سالاد شیرازی",
        description: "خیار، گوجه، پیاز، آبغوره و نعناع.",
        price: 90_000,
        tags: ["vegan"],
      },
      {
        name: "سالاد سزار",
        description: "مرغ گریل، کاهو، پنیر پارمزان و نان تست.",
        price: 260_000,
        allergens: ["gluten", "milk", "eggs"],
      },
    ],
  },
  {
    key: "meat",
    name: "کباب",
    items: [
      {
        name: "چلوکباب کوبیده",
        description: "دو سیخ کوبیده گوسفندی، برنج ایرانی و گوجه کبابی.",
        price: 450_000,
        ingredients: "گوشت گوسفندی، پیاز، برنج، زعفران، کره",
        allergens: ["milk"],
        kcal: 980,
        weight: 450,
        featured: true,
        options: ["side", "extras", "skewer"],
      },
      {
        name: "جوجه کباب",
        description: "سینه مرغ زعفرانی، برنج ایرانی و گوجه کبابی.",
        price: 420_000,
        allergens: ["milk"],
        kcal: 820,
        options: ["side", "extras"],
      },
      {
        name: "کباب برگ",
        description: "فیله گوساله، برنج ایرانی، کره و سماق.",
        price: 890_000,
        allergens: ["milk"],
        kcal: 1050,
        featured: true,
        options: ["side", "extras"],
      },
    ],
  },
  {
    key: "mains",
    name: "خورش و پلو",
    items: [
      {
        name: "قورمه سبزی",
        description: "سبزی سرخ‌شده، لوبیا قرمز، گوشت گوسفندی و لیمو عمانی، با برنج.",
        price: 360_000,
        kcal: 760,
        featured: true,
        options: ["extras"],
      },
      {
        name: "زرشک پلو با مرغ",
        description: "ران مرغ زعفرانی، برنج، زرشک و خلال پسته.",
        price: 380_000,
        allergens: ["nuts"],
        options: ["extras"],
      },
      {
        name: "قیمه",
        description: "لپه، گوشت گوسفندی و سیب‌زمینی سرخ‌کرده، با برنج.",
        price: 340_000,
        options: ["extras"],
      },
      {
        name: "باقالی پلو با ماهیچه",
        description: "ماهیچه گوسفندی، برنج با باقالی و شوید.",
        price: 780_000,
        options: ["extras"],
      },
    ],
  },
  {
    key: "desserts",
    name: "دسر",
    items: [
      {
        name: "بستنی سنتی",
        description: "بستنی زعفرانی با گلاب و پسته.",
        price: 130_000,
        allergens: ["milk", "nuts"],
      },
      { name: "فالوده شیرازی", description: "با آبلیمو تازه و شربت.", price: 110_000, tags: ["vegan"] },
      {
        name: "شله‌زرد",
        description: "برنج، زعفران، گلاب، دارچین و خلال بادام.",
        price: 100_000,
        allergens: ["nuts"],
      },
    ],
  },
  {
    key: "tea",
    name: "چای و دمنوش",
    items: [
      { name: "چای ایرانی", description: "چای دم‌کشیده با نبات.", price: 50_000 },
      { name: "دمنوش گل‌گاوزبان", description: "با لیمو عمانی.", price: 80_000 },
      { name: "قهوه ترک", description: "", price: 90_000 },
    ],
  },
  {
    key: "soft_drinks",
    name: "نوشیدنی",
    items: [
      { name: "دوغ محلی", description: "دوغ گازدار با پونه.", price: 60_000, allergens: ["milk"] },
      { name: "شربت سکنجبین", description: "با خیار رنده‌شده.", price: 80_000 },
      { name: "نوشابه", description: "", price: 40_000 },
      { name: "آب معدنی", description: "", price: 25_000 },
    ],
  },
];

async function seedPlatform() {
  for (const p of DEFAULT_PLANS) {
    await db
      .insert(plans)
      .values({ ...p, currency: edition.platformCurrency })
      // Names, prices and limits are the admin's (Admin > Plans) once a plan exists.
      .onConflictDoUpdate({ target: plans.code, set: { currency: edition.platformCurrency } });
  }
  for (const [i, key] of DEFAULT_CATEGORY_TEMPLATES.entries()) {
    await db.insert(globalCategoryTemplates).values({ key, sortOrder: i }).onConflictDoNothing();
  }
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@spotihotel.local";
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") {
    // Never create a production admin with a well-known password.
    console.warn("! SEED_SUPERADMIN_PASSWORD not set: super admin not created");
  } else {
    // Creates the account, or makes an existing one super admin; its password is left untouched.
    await upsertUser(email, password ?? "ChangeMe!2026", "Platform Admin", true);
    console.log(`✓ super admin ${email}`);
  }
  console.log(
    `✓ platform: ${DEFAULT_PLANS.length} plans, ${DEFAULT_CATEGORY_TEMPLATES.length} category templates`,
  );
}

async function seedDemoRestaurant() {
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (existing) {
    console.log("✓ demo restaurant already present — skipping");
    return;
  }

  // In production (public demo) nobody may sign in with the well-known demo passwords.
  const prod = process.env.NODE_ENV === "production";
  const owner = await upsertUser(
    DEMO_OWNER.email,
    prod ? randomUUID() : DEMO_OWNER.password,
    DEMO_OWNER.fullName,
  );
  const staff = await upsertUser(
    DEMO_STAFF.email,
    prod ? randomUUID() : DEMO_STAFF.password,
    DEMO_STAFF.fullName,
  );

  await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: "گروه نمونه",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const restaurant = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "رستوران نمونه",
    });
    await tx
      .update(restaurants)
      .set({
        // Persian names produce no Latin slug: keep a stable one for the demo.
        slug: "restaurant-demo",
        phone: "+98 21 1234 5678",
        addressLine1: "خیابان ولیعصر، پلاک ۱۲",
        city: "تهران",
        postalCode: "1234567890",
        email: "contact@demo.spotihotel.local",
      })
      .where(eq(restaurants.id, restaurant.id));
    await tx
      .update(restaurantSettings)
      .set({
        orderPrefix: "D",
        // Public demo (/demo): a visitor's table frees itself after 20 idle minutes.
        sessionAutoCloseMinutes: 20,
        legalName: "شرکت نمونه رستوران",
        // Online payment uses whatever this deployment offers (Stripe keys / dev simulator).
        onlinePaymentEnabled: true,
        enabledPaymentProviders: [
          "cash",
          "on_site_terminal",
          "pay_later",
          "stripe",
          "zarinpal",
          "mock_online",
        ],
      })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    await tx
      .insert(restaurantMembers)
      .values({ restaurantId: restaurant.id, userId: staff.id, role: "staff" });

    await tx.insert(diningTables).values(
      Array.from({ length: 20 }, (_, i) => ({
        restaurantId: restaurant.id,
        label: String(i + 1),
        number: i + 1,
        capacity: i < 12 ? 4 : 2,
        zone: i < 14 ? "Salle" : "Terrasse",
        qrToken: randomToken(),
        sortOrder: i,
      })),
    );

    const rates = await tx.select().from(taxRates).where(eq(taxRates.restaurantId, restaurant.id));
    const rate10 = rates.find((r) => r.rateBps === 1000)!;

    // Option groups (reusable across products).
    const [side] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "همراه", minSelect: 1, maxSelect: 1 })
      .returning();
    const [extras] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "افزودنی", minSelect: 0, maxSelect: 4 })
      .returning();
    const [skewer] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "سیخ اضافه", minSelect: 0, maxSelect: 1 })
      .returning();
    await tx.insert(optionValues).values([
      ...["برنج ایرانی", "نان تازه", "نیمی برنج، نیمی نان"].map((name, i) => ({
        restaurantId: restaurant.id,
        groupId: side!.id,
        name,
        sortOrder: i,
        isDefault: i === 0,
      })),
      ...(
        [
          ["ته‌دیگ", 60_000],
          ["گوجه کبابی اضافه", 30_000],
          ["کره", 20_000],
          ["سبزی خوردن", 40_000],
        ] as const
      ).map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: extras!.id,
        name,
        priceDeltaCents: toman(delta),
        sortOrder: i,
      })),
      {
        restaurantId: restaurant.id,
        groupId: skewer!.id,
        name: "یک سیخ کوبیده",
        priceDeltaCents: toman(180_000),
        sortOrder: 0,
      },
    ]);
    const groupByKey = { side: side!.id, extras: extras!.id, skewer: skewer!.id };

    for (const [ci, cat] of MENU.entries()) {
      const [category] = await tx
        .insert(categories)
        .values({ restaurantId: restaurant.id, name: cat.name, templateKey: cat.key, sortOrder: ci })
        .returning();
      for (const [pi, item] of cat.items.entries()) {
        const [product] = await tx
          .insert(products)
          .values({
            restaurantId: restaurant.id,
            categoryId: category!.id,
            name: item.name,
            description: item.description || null,
            priceCents: toman(item.price),
            taxRateId: rate10.id,
            ingredients: item.ingredients,
            allergens: item.allergens ?? [],
            caloriesKcal: item.kcal,
            weightGrams: item.weight,
            isFeatured: item.featured ?? false,
            tags: item.tags ?? [],
            sortOrder: pi,
          })
          .returning();
        for (const [gi, key] of (item.options ?? []).entries()) {
          await tx.insert(productOptionGroups).values({
            restaurantId: restaurant.id,
            productId: product!.id,
            groupId: groupByKey[key],
            sortOrder: gi,
          });
        }
      }
    }
    console.log(
      `✓ demo restaurant ${restaurant.id}: 20 tables, ${MENU.length} categories, ${MENU.reduce((n, c) => n + c.items.length, 0)} products`,
    );
  });
  console.log(`  owner: ${DEMO_OWNER.email} / ${DEMO_OWNER.password}`);
  console.log(`  staff: ${DEMO_STAFF.email} / ${DEMO_STAFF.password}`);
}

/** The demo runs on Professional so its 20 tables fit the plan limits. */
async function ensureDemoPlan() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  const [pro] = await db.select().from(plans).where(eq(plans.code, "professional"));
  if (!demo || !pro) return;
  const updated = await db
    .update(subscriptions)
    .set({ planId: pro.id, status: "active" })
    .where(eq(subscriptions.organizationId, demo.organizationId))
    .returning({ id: subscriptions.id });
  if (updated.length === 0) {
    await db
      .insert(subscriptions)
      .values({ organizationId: demo.organizationId, planId: pro.id, status: "active" });
  }
  console.log("✓ demo organization on the Professional plan");
}

/** Marks the illustrated demo photos (older generated placeholders get replaced). */
const DEMO_ART = "demo-art-v2";

/** Illustrated photo for demo products, processed by the same pipeline as real uploads. */
async function placeholderPhoto(name: string, key: string) {
  return sharp(Buffer.from(dishSvg(name, key)))
    .jpeg({ quality: 88 })
    .toBuffer();
}

async function seedDemoImages() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (!demo) return;
  const rows = await db
    .select({ id: products.id, name: products.name, key: categories.templateKey })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.restaurantId, demo.id), isNull(products.deletedAt)));
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_OWNER.email}`);
  const ctx = await loadRestaurantContext(db, { ...owner!, locale: owner!.locale }, demo.id);
  let added = 0;
  for (const p of rows) {
    const images = await db
      .select({
        id: productImages.id,
        altText: productImages.altText,
        width: productImages.width,
        height: productImages.height,
      })
      .from(productImages)
      .where(eq(productImages.productId, p.id));
    // Earlier seeds drew a plain gradient (1200×900, no alt text) or an older illustration:
    // swap it for the current one. Photos the restaurant uploaded itself are kept.
    const stale = images.filter(
      (i) =>
        (i.altText == null && i.width === 1200 && i.height === 900) ||
        (i.altText?.startsWith("demo-art-") && i.altText !== DEMO_ART),
    );
    if (images.length > stale.length) continue;
    for (const i of stale) await deleteProductImage(db, ctx, i.id);
    const img = await addProductImage(db, ctx, p.id, await placeholderPhoto(p.name, p.key ?? ""));
    await db.update(productImages).set({ altText: DEMO_ART }).where(eq(productImages.id, img.id));
    added++;
  }
  console.log(`✓ demo product photos: ${added} generated (${rows.length - added} already present)`);
}

/**
 * Demo service in progress, created through the real flow (scan → cart → order → kitchen),
 * so amounts come from the same pricing code as production.
 */
async function seedDemoOrders() {
  const [demo] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
  if (!demo) return;
  const [existing] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.restaurantId, demo.id))
    .limit(1);
  if (existing) {
    console.log("✓ demo orders already present — skipping");
    return;
  }
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_OWNER.email}`);
  const ctx = await loadRestaurantContext(db, owner!, demo.id);
  const menu = await loadPublicMenu(db, demo.id);
  const byName = (name: string) => Object.values(menu.products).find((p) => p.name === name)!;
  const opt = (product: string, group: string, value: string) =>
    byName(product)
      .optionGroups.find((g) => g.name === group)!
      .values.find((v) => v.name === value)!.id;
  const tables = await db.select().from(diningTables).where(eq(diningTables.restaurantId, demo.id));
  const tableToken = (label: string) => tables.find((t) => t.label === label)!.qrToken;

  type Line = { product: string; options?: [string, string][]; quantity?: number; note?: string };
  async function guestOrders(table: string, lines: Line[], status: OrderStatus, name?: string) {
    const guestId = randomUUID();
    const entry = await enterTableByQr(db, tableToken(table), guestId);
    const guest = (await loadGuestContext(db, guestId, entry!.participant.id))!;
    if (name) await renameParticipant(db, guest, name);
    for (const l of lines) {
      await addToCart(db, guest, {
        productId: byName(l.product).id,
        optionValueIds: (l.options ?? []).map(([g, v]) => opt(l.product, g, v)),
        quantity: l.quantity ?? 1,
        note: l.note,
      });
    }
    const order = await placeOrder(db, guest);
    if (status !== "received") await updateOrderStatus(db, ctx, order.id, status);
    return order;
  }

  // Table 8 — three guests ordering separately (spec §12).
  await guestOrders(
    "8",
    [{ product: "چلوکباب کوبیده", options: [["همراه", "برنج ایرانی"]] }, { product: "دوغ محلی" }],
    "preparing",
    "سارا",
  );
  await guestOrders(
    "8",
    [
      {
        product: "کباب برگ",
        options: [
          ["همراه", "برنج ایرانی"],
          ["افزودنی", "ته‌دیگ"],
        ],
        note: "بدون پیاز",
      },
      { product: "چای ایرانی" },
    ],
    "accepted",
  );
  await guestOrders("8", [{ product: "زرشک پلو با مرغ" }, { product: "شربت سکنجبین" }], "received");
  // Table 4 — already served, Table 12 — ready to go.
  const paidAtTable4 = await guestOrders(
    "4",
    [
      { product: "قورمه سبزی", quantity: 2 },
      { product: "دوغ محلی", quantity: 2 },
    ],
    "served",
  );
  await guestOrders("4", [{ product: "بستنی سنتی" }, { product: "چای ایرانی" }], "served");
  await guestOrders(
    "12",
    [{ product: "جوجه کباب", options: [["همراه", "نان تازه"]] }, { product: "آب معدنی" }],
    "ready",
  );
  // The first guest of table 4 already paid in cash.
  await recordStaffPayment(db, ctx, {
    tableSessionId: paidAtTable4.tableSessionId!,
    participantId: paidAtTable4.participantId!,
    provider: "cash",
    idempotencyKey: newIdempotencyKey(),
  });
  console.log("✓ demo orders: 6 orders on tables 4, 8 (3 guests) and 12, one cash payment");
}

/**
 * Brielle (real menu, real photos): the showcase restaurant, also seeded in production.
 * Owned by the platform super admin, so it appears in that account's dashboard.
 */
async function seedBrielle() {
  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? "admin@spotihotel.local").toLowerCase();
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`);
  if (!owner) {
    console.warn("! Brielle not seeded: no super admin account to own it");
    return;
  }
  const [existing] = await db.select().from(restaurants).where(eq(restaurants.slug, "brielle"));
  if (existing) {
    // The super admin may have changed (new SEED_SUPERADMIN_EMAIL): make sure it owns Brielle too.
    await db
      .insert(restaurantMembers)
      .values({ restaurantId: existing.id, userId: owner.id, role: "owner" })
      .onConflictDoNothing();
    console.log(`✓ Brielle already present — owned by ${owner.email}`);
    // An earlier boot may have created only part of the menu: add what is missing.
    const added = await db.transaction((tx) => syncBrielleMenu(tx, existing.id));
    if (added.categories || added.products)
      console.log(`✓ Brielle menu: ${added.categories} categories, ${added.products} dishes added`);
    // Photos/logo may be missing (earlier boot interrupted, or storage reset): fill the gaps.
    await seedBrielleMedia(existing.id, owner);
    await seedBrielleTestData(existing.id, owner.id);
    return;
  }
  const restaurantId = await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: "Brielle",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const restaurant = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "Brielle",
    });
    await tx
      .update(restaurants)
      .set({ slug: "brielle", city: "تهران" })
      .where(eq(restaurants.id, restaurant.id));
    await tx
      .update(restaurantSettings)
      .set({
        orderPrefix: "B",
        legalName: "رستوران بریل",
        enabledPaymentProviders: ["cash", "on_site_terminal", "pay_later"],
      })
      .where(eq(restaurantSettings.restaurantId, restaurant.id));
    await tx.insert(diningTables).values(
      Array.from({ length: 12 }, (_, i) => ({
        restaurantId: restaurant.id,
        label: String(i + 1),
        number: i + 1,
        capacity: 4,
        qrToken: randomToken(),
        sortOrder: i,
      })),
    );
    const [pro] = await tx.select().from(plans).where(eq(plans.code, "professional"));
    if (pro) {
      const updated = await tx
        .update(subscriptions)
        .set({ planId: pro.id, status: "active" })
        .where(eq(subscriptions.organizationId, org.id))
        .returning({ id: subscriptions.id });
      if (updated.length === 0)
        await tx.insert(subscriptions).values({ organizationId: org.id, planId: pro.id, status: "active" });
    }
    await syncBrielleMenu(tx, restaurant.id);
    return restaurant.id;
  });

  console.log(
    `✓ Brielle ${restaurantId}: 12 tables, ${BRIELLE_MENU.length} categories (owner ${owner.email})`,
  );
  await seedBrielleMedia(restaurantId, owner);
  await seedBrielleTestData(restaurantId, owner.id);
}

/** 30 days of activity on Brielle (test data for every dashboard section), once per database. */
async function seedBrielleTestData(restaurantId: string, ownerId: string) {
  if (process.env.SEED_BRIELLE_HISTORY === "false") return;
  const started = Date.now();
  // Test data must never keep the app from starting: on error the transaction leaves nothing behind.
  const res = await db
    .transaction((tx) => seedBrielleHistory(tx, restaurantId, ownerId))
    .catch((e: unknown) => {
      console.warn("! Brielle history not seeded:", e);
      return null;
    });
  await db
    .transaction((tx) => assignBrielleJobs(tx, restaurantId))
    .catch((e: unknown) => {
      console.warn("! Brielle team jobs not set:", e);
    });
  await db
    .transaction((tx) => listBrielle(tx, restaurantId))
    .then((listed) => listed && console.log("✓ Brielle listed in the restaurant guide"))
    .catch((e: unknown) => {
      console.warn("! Brielle not listed:", e);
    });
  if (res)
    console.log(
      `✓ Brielle history: ${res.orders} orders (~${res.guestsPerDay} guests/day), ${res.customers} customers, ` +
        `${res.reservations} bookings, ${res.purchases} purchases, ${res.invoices} invoices in ${Date.now() - started} ms`,
    );
}

/**
 * Creates the Brielle categories and dishes that do not exist yet (matched by name).
 * Soft-deleted rows count as existing, so what the owner removed is never brought back.
 */
async function syncBrielleMenu(tx: DbOrTx, restaurantId: string) {
  const rates = await tx.select().from(taxRates).where(eq(taxRates.restaurantId, restaurantId));
  const rate = rates.find((r) => r.rateBps === 1000) ?? rates[0];
  const cats = await tx.select().from(categories).where(eq(categories.restaurantId, restaurantId));
  const existing = await tx
    .select({ name: products.name })
    .from(products)
    .where(eq(products.restaurantId, restaurantId));
  const names = new Set(existing.map((p) => p.name));
  const added = { categories: 0, products: 0 };
  for (const [ci, cat] of BRIELLE_MENU.entries()) {
    let category = cats.find((c) => c.name === cat.name || c.templateKey === cat.key);
    if (category?.deletedAt) continue;
    if (!category) {
      [category] = await tx
        .insert(categories)
        .values({ restaurantId, name: cat.name, templateKey: cat.key, sortOrder: ci })
        .returning();
      added.categories++;
    }
    for (const [pi, item] of cat.items.entries()) {
      if (names.has(item.name)) continue;
      await tx.insert(products).values({
        restaurantId,
        categoryId: category!.id,
        name: item.name,
        // The restaurant's menu shows the English name with each dish: keep it as the first line.
        description: item.description ? `${item.en} · ${item.description}` : item.en,
        priceCents: toman(item.price * 1000),
        taxRateId: rate?.id,
        isFeatured: item.featured ?? false,
        tags: item.tags ?? [],
        sortOrder: pi,
      });
      added.products++;
    }
  }
  return added;
}

/** Logo and dish photos, only where missing; a failing image never blocks the start-up. */
async function seedBrielleMedia(restaurantId: string, owner: typeof users.$inferSelect) {
  const assets = new URL("./demo-assets/brielle/", `file://${process.cwd()}/scripts/`);
  const ctx = await loadRestaurantContext(db, owner, restaurantId);
  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  // Rows can outlive their files (e.g. written before the storage disk was mounted): check files.
  const store = storage();
  const logoMissing =
    !restaurant?.logoKey || !(await store.get(`${restaurant.logoKey}-256.webp`).catch(() => null));
  if (logoMissing) {
    try {
      await uploadLogo(db, ctx, await readFile(new URL("logo.png", assets)));
    } catch (e) {
      console.warn("! Brielle logo not uploaded:", e);
    }
  }
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      image: productImages.id,
      key: productImages.storageKey,
    })
    .from(products)
    .leftJoin(productImages, eq(productImages.productId, products.id))
    .where(and(eq(products.restaurantId, restaurantId), isNull(products.deletedAt)));
  let added = 0;
  let failed = 0;
  let present = 0;
  const unmatched: string[] = [];
  for (const item of BRIELLE_MENU.flatMap((c) => c.items)) {
    if (!item.photo) continue;
    const product = rows.find((r) => r.name === item.name);
    if (!product) {
      unmatched.push(item.name);
      continue;
    }
    if (product.image && product.key) {
      if (await store.get(`${product.key}-sm.webp`).catch(() => null)) {
        present++;
        continue;
      }
      await db.delete(productImages).where(eq(productImages.id, product.image)); // orphan row
    }
    try {
      await addProductImage(db, ctx, product.id, await readFile(new URL(`${item.photo}.jpg`, assets)));
      added++;
    } catch (e) {
      failed++;
      console.warn(`! Brielle photo ${item.photo} not uploaded:`, e);
    }
  }
  console.log(
    `✓ Brielle media: logo ${restaurant?.logoKey ? "present" : "added"}, photos ${present} present, ${added} added, ${failed} failed` +
      (unmatched.length ? `, ${unmatched.length} without product (${unmatched.join(", ")})` : ""),
  );
}

async function main() {
  await seedPlatform();
  // Food database + nutrition of every dish (and of past order lines that lack it).
  const foodsSync = await syncFoods(db);
  const filled = await backfillNutrition(db);
  console.log(
    `✓ foods: ${foodsSync.usdaAdded} USDA added, ${foodsSync.catalogue} catalogue entries; nutrition: ${filled.dishes} dishes, ${filled.lines} order lines completed`,
  );
  // The showcase restaurant: on by default, SEED_BRIELLE=false to skip.
  if (process.env.SEED_BRIELLE !== "false") await seedBrielle();
  // Production containers run this on every start with SEED_DEMO unset: platform data only.
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === "production" ? "false" : "true");
  // SEED_PUBLIC_DEMO=true: the demo restaurant behind /demo, in production too (no demo orders).
  if (process.env.SEED_PUBLIC_DEMO === "true" && demo !== "true") {
    await seedDemoRestaurant();
    await ensureDemoPlan();
    await seedDemoImages();
    return;
  }
  if (demo !== "true") return;
  await seedDemoRestaurant();
  await ensureDemoPlan();
  await seedDemoImages();
  await seedDemoOrders();
  const [owner] = await db.select().from(users).where(eq(users.email, DEMO_OWNER.email));
  if (owner) await seedDemoHotel(owner.id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
