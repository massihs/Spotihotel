/**
 * Development seed. Idempotent: safe to run several times.
 *   npm run db:seed
 * Creates plans, global category templates, a super admin and "Restaurant Demo" (20 tables, menu).
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db/client";
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
import { edition } from "@/config/edition";
import { DEFAULT_CATEGORY_TEMPLATES, DEFAULT_PLANS } from "@/server/modules/catalog/defaults";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import { randomToken } from "@/lib/ids";
import { loadRestaurantContext } from "@/server/tenancy";
import { addProductImage } from "@/server/modules/menu/images";
import { loadPublicMenu } from "@/server/modules/menu/public";
import { enterTableByQr, loadGuestContext, renameParticipant } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder, updateOrderStatus } from "@/server/modules/orders/service";
import { newIdempotencyKey, recordStaffPayment } from "@/server/modules/payments/service";
import type { OrderStatus } from "@/server/modules/orders/status";

const DEMO_OWNER = {
  email: "owner@demo.spotifood.local",
  password: "DemoOwner!2026",
  fullName: "Alex Martin",
};
const DEMO_STAFF = { email: "staff@demo.spotifood.local", password: "DemoStaff!2026", fullName: "Sam Leroy" };

async function upsertUser(email: string, password: string, fullName: string, isSuperAdmin = false) {
  const [existing] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  if (existing) return existing;
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
  price: number;
  ingredients?: string;
  allergens?: string[];
  kcal?: number;
  weight?: number;
  featured?: boolean;
  tags?: string[];
  options?: ("cuisson" | "supplements" | "sauce")[];
  alcohol?: boolean;
};

const MENU: { key: string; name: string; items: DemoProduct[] }[] = [
  {
    key: "starters",
    name: "Entrées",
    items: [
      {
        name: "Burrata crémeuse",
        description: "Tomates anciennes, basilic, huile d'olive vierge.",
        price: 1250,
        ingredients: "Burrata, tomates, basilic, huile d'olive",
        allergens: ["milk"],
        kcal: 420,
        weight: 200,
        featured: true,
        tags: ["vegetarian"],
      },
      {
        name: "Carpaccio de bœuf",
        description: "Parmesan, roquette, câpres.",
        price: 1350,
        allergens: ["milk"],
        kcal: 310,
      },
      {
        name: "Soupe à l'oignon",
        description: "Gratinée au comté.",
        price: 900,
        allergens: ["gluten", "milk"],
        kcal: 380,
      },
    ],
  },
  {
    key: "salads",
    name: "Salades",
    items: [
      {
        name: "César au poulet",
        description: "Poulet grillé, croûtons, parmesan, sauce César.",
        price: 1590,
        allergens: ["gluten", "eggs", "milk", "fish"],
        kcal: 640,
      },
      {
        name: "Salade de chèvre chaud",
        description: "Toasts de chèvre, miel, noix.",
        price: 1490,
        allergens: ["gluten", "milk", "nuts"],
        kcal: 580,
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "mains",
    name: "Plats",
    items: [
      {
        name: "Burger signature",
        description: "Bœuf 180 g, cheddar affiné, oignons confits, frites maison.",
        price: 1990,
        allergens: ["gluten", "milk", "mustard", "sesame"],
        kcal: 980,
        featured: true,
        options: ["cuisson", "supplements"],
      },
      {
        name: "Saumon rôti",
        description: "Purée de patate douce, beurre citronné.",
        price: 2290,
        allergens: ["fish", "milk"],
        kcal: 720,
      },
      {
        name: "Risotto aux champignons",
        description: "Arborio, cèpes, parmesan.",
        price: 1890,
        allergens: ["milk"],
        kcal: 690,
        tags: ["vegetarian"],
      },
    ],
  },
  {
    key: "steak",
    name: "Steak",
    items: [
      {
        name: "Entrecôte 300 g",
        description: "Race normande, frites maison, salade.",
        price: 3200,
        weight: 300,
        kcal: 1050,
        featured: true,
        options: ["cuisson", "sauce", "supplements"],
      },
      {
        name: "Tartare de bœuf",
        description: "Préparé minute, frites.",
        price: 1950,
        allergens: ["eggs", "mustard"],
        kcal: 760,
      },
    ],
  },
  {
    key: "pasta",
    name: "Pâtes",
    items: [
      {
        name: "Tagliatelles carbonara",
        description: "Guanciale, pecorino, jaune d'œuf.",
        price: 1690,
        allergens: ["gluten", "eggs", "milk"],
        kcal: 850,
      },
      {
        name: "Penne all'arrabbiata",
        description: "Tomate, piment, ail.",
        price: 1450,
        allergens: ["gluten"],
        kcal: 620,
        tags: ["vegan", "spicy"],
      },
    ],
  },
  {
    key: "desserts",
    name: "Desserts",
    items: [
      {
        name: "Cheesecake",
        description: "Coulis de fruits rouges.",
        price: 850,
        allergens: ["gluten", "milk", "eggs"],
        kcal: 480,
        featured: true,
      },
      {
        name: "Moelleux au chocolat",
        description: "Cœur coulant, glace vanille.",
        price: 900,
        allergens: ["gluten", "milk", "eggs"],
        kcal: 560,
      },
      {
        name: "Café gourmand",
        description: "Expresso et trois mignardises.",
        price: 950,
        allergens: ["gluten", "milk", "eggs", "nuts"],
      },
    ],
  },
  {
    key: "coffee",
    name: "Café",
    items: [
      { name: "Expresso", description: "", price: 250 },
      { name: "Cappuccino", description: "", price: 450, allergens: ["milk"] },
      { name: "Thé glacé maison", description: "Pêche, menthe.", price: 500 },
    ],
  },
  {
    key: "soft_drinks",
    name: "Boissons",
    items: [
      { name: "Coca-Cola 33 cl", description: "", price: 450 },
      { name: "Eau pétillante 50 cl", description: "", price: 400 },
      { name: "Limonade artisanale", description: "", price: 500 },
      {
        name: "Verre de vin rouge",
        description: "Côtes-du-Rhône, 12 cl.",
        price: 650,
        allergens: ["sulphites"],
        alcohol: true,
      },
    ],
  },
];

async function seedPlatform() {
  for (const p of DEFAULT_PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.code,
        set: {
          name: p.name,
          limits: p.limits,
          priceMonthlyCents: p.priceMonthlyCents,
          sortOrder: p.sortOrder,
        },
      });
  }
  for (const [i, key] of DEFAULT_CATEGORY_TEMPLATES.entries()) {
    await db.insert(globalCategoryTemplates).values({ key, sortOrder: i }).onConflictDoNothing();
  }
  const email = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@spotifood.local";
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password && process.env.NODE_ENV === "production") {
    // Never create a production admin with a well-known password.
    console.warn("! SEED_SUPERADMIN_PASSWORD not set: super admin not created");
  } else {
    // Only creates the account; an existing account (and its changed password) is left untouched.
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

  const owner = await upsertUser(DEMO_OWNER.email, DEMO_OWNER.password, DEMO_OWNER.fullName);
  const staff = await upsertUser(DEMO_STAFF.email, DEMO_STAFF.password, DEMO_STAFF.fullName);

  await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: "Demo Group",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const restaurant = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "Restaurant Demo",
    });
    await tx
      .update(restaurants)
      .set({
        phone: "+33 1 23 45 67 89",
        addressLine1: "12 rue de la Paix",
        city: "Paris",
        postalCode: "75002",
        email: "contact@demo.spotifood.local",
      })
      .where(eq(restaurants.id, restaurant.id));
    await tx
      .update(restaurantSettings)
      .set({
        orderPrefix: "D",
        legalName: "Demo Restauration SAS",
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
    const rate20 = rates.find((r) => r.rateBps === 2000) ?? rate10;

    // Option groups (reusable across products).
    const [cuisson] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Cuisson", minSelect: 1, maxSelect: 1 })
      .returning();
    const [supplements] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Suppléments", minSelect: 0, maxSelect: 4 })
      .returning();
    const [sauce] = await tx
      .insert(optionGroups)
      .values({ restaurantId: restaurant.id, name: "Sauce", minSelect: 0, maxSelect: 1 })
      .returning();
    await tx.insert(optionValues).values([
      ...["Bleu", "Saignant", "À point", "Bien cuit"].map((name, i) => ({
        restaurantId: restaurant.id,
        groupId: cuisson!.id,
        name,
        sortOrder: i,
        isDefault: name === "À point",
      })),
      ...[
        ["Fromage", 200],
        ["Bacon", 250],
        ["Champignons", 200],
        ["Frites", 300],
      ].map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: supplements!.id,
        name: String(name),
        priceDeltaCents: edition.demoPrice(Number(delta)),
        sortOrder: i,
      })),
      ...[
        ["Poivre", 150],
        ["Béarnaise", 150],
        ["Roquefort", 200],
      ].map(([name, delta], i) => ({
        restaurantId: restaurant.id,
        groupId: sauce!.id,
        name: String(name),
        priceDeltaCents: edition.demoPrice(Number(delta)),
        sortOrder: i,
      })),
    ]);
    const groupByKey = { cuisson: cuisson!.id, supplements: supplements!.id, sauce: sauce!.id };

    for (const [ci, cat] of MENU.entries()) {
      const [category] = await tx
        .insert(categories)
        .values({ restaurantId: restaurant.id, name: cat.name, templateKey: cat.key, sortOrder: ci })
        .returning();
      // No alcohol on the Iranian edition's demo menu (prohibited there).
      const items = edition.edition === "iran" ? cat.items.filter((i) => !i.alcohol) : cat.items;
      for (const [pi, item] of items.entries()) {
        const [product] = await tx
          .insert(products)
          .values({
            restaurantId: restaurant.id,
            categoryId: category!.id,
            name: item.name,
            description: item.description || null,
            priceCents: edition.demoPrice(item.price),
            taxRateId: item.alcohol ? rate20.id : rate10.id,
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

const PALETTE: Record<string, [string, string]> = {
  starters: ["#f4a261", "#e76f51"],
  salads: ["#8ac926", "#2a9d8f"],
  mains: ["#e9c46a", "#d62828"],
  steak: ["#9d0208", "#370617"],
  pasta: ["#ffb703", "#fb8500"],
  desserts: ["#ffafcc", "#cdb4db"],
  coffee: ["#7f5539", "#3e2723"],
  soft_drinks: ["#48cae4", "#0077b6"],
};

const escapeXml = (v: string) => v.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Placeholder photo for demo products, processed by the same pipeline as real uploads. */
async function placeholderPhoto(name: string, key: string) {
  const [a, b] = PALETTE[key] ?? ["#adb5bd", "#495057"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
    <rect width="1200" height="900" fill="url(#g)"/>
    <circle cx="600" cy="400" r="230" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="28"/>
    <circle cx="600" cy="400" r="150" fill="rgba(255,255,255,0.18)"/>
    <text x="600" y="780" font-family="DejaVu Sans, sans-serif" font-size="64" font-weight="700" fill="white" text-anchor="middle">${escapeXml(name)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
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
    const [has] = await db
      .select({ id: productImages.id })
      .from(productImages)
      .where(eq(productImages.productId, p.id))
      .limit(1);
    if (has) continue;
    await addProductImage(db, ctx, p.id, await placeholderPhoto(p.name, p.key ?? ""));
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
    [{ product: "Burger signature", options: [["Cuisson", "À point"]] }, { product: "Coca-Cola 33 cl" }],
    "preparing",
    "Léa",
  );
  await guestOrders(
    "8",
    [
      {
        product: "Entrecôte 300 g",
        options: [
          ["Cuisson", "Saignant"],
          ["Suppléments", "Frites"],
        ],
        note: "Sauce à part",
      },
      { product: "Expresso" },
    ],
    "accepted",
  );
  await guestOrders("8", [{ product: "César au poulet" }, { product: "Limonade artisanale" }], "received");
  // Table 4 — already served, Table 12 — ready to go.
  const paidAtTable4 = await guestOrders(
    "4",
    [
      { product: "Tagliatelles carbonara", quantity: 2 },
      { product: edition.edition === "iran" ? "Limonade artisanale" : "Verre de vin rouge", quantity: 2 },
    ],
    "served",
  );
  await guestOrders("4", [{ product: "Cheesecake" }, { product: "Cappuccino" }], "served");
  await guestOrders("12", [{ product: "Saumon rôti" }, { product: "Eau pétillante 50 cl" }], "ready");
  // The first guest of table 4 already paid in cash.
  await recordStaffPayment(db, ctx, {
    tableSessionId: paidAtTable4.tableSessionId!,
    participantId: paidAtTable4.participantId!,
    provider: "cash",
    idempotencyKey: newIdempotencyKey(),
  });
  console.log("✓ demo orders: 6 orders on tables 4, 8 (3 guests) and 12, one cash payment");
}

async function main() {
  await seedPlatform();
  // Production containers run this on every start with SEED_DEMO unset: platform data only.
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === "production" ? "false" : "true");
  if (demo !== "true") return;
  await seedDemoRestaurant();
  await ensureDemoPlan();
  await seedDemoImages();
  await seedDemoOrders();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
