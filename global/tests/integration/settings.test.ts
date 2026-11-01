import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/server/db/client";
import { orders, products, categories } from "@/server/db/schema";
import { setStorageDriver, type StorageDriver } from "@/server/infra/storage";
import { processImage, PRODUCT_VARIANTS } from "@/server/infra/images";
import { parsePercentToBps } from "@/server/modules/restaurants/schemas";
import {
  createTaxRate,
  deleteTaxRate,
  getRestaurantSettingsView,
  listTaxRates,
  removeLogo,
  setDefaultTaxRate,
  updateLegal,
  updateProfile,
  updateServiceSettings,
  uploadLogo,
} from "@/server/modules/restaurants/settings";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

class MemoryStorage implements StorageDriver {
  files = new Map<string, { body: Buffer; contentType: string }>();
  async put(key: string, body: Buffer, contentType: string) {
    this.files.set(key, { body, contentType });
  }
  async get(key: string) {
    return this.files.get(key) ?? null;
  }
  async delete(keys: string[]) {
    keys.forEach((k) => this.files.delete(k));
  }
  publicUrl(key: string) {
    return `/files/${key}`;
  }
}

const profile = {
  name: "Brielle",
  email: "Contact@Brielle.fr",
  phone: "+33 1 23 45 67 89",
  addressLine1: "1 rue Test",
  addressLine2: "",
  city: "Paris",
  postalCode: "75001",
  country: "fr",
  currency: "eur",
  timezone: "Europe/Paris",
  defaultLocale: "fr" as const,
};

const photo = (w = 2000, h = 1500) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "secret-gps" } })
    .toBuffer();

describe("restaurant settings", () => {
  it("updates and normalizes the profile", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const r = await updateProfile(db, ctx, profile);
    expect(r).toMatchObject({
      email: "contact@brielle.fr",
      country: "FR",
      currency: "EUR",
      addressLine2: null,
    });
  });

  it("rejects invalid currency, timezone and phone", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    await expect(updateProfile(db, ctx, { ...profile, currency: "XXZ" })).rejects.toBeTruthy();
    await expect(updateProfile(db, ctx, { ...profile, timezone: "Mars/Olympus" })).rejects.toBeTruthy();
    await expect(updateProfile(db, ctx, { ...profile, phone: "<script>" })).rejects.toBeTruthy();
  });

  it("locks the currency once orders exist", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    await db.insert(orders).values({
      restaurantId: restaurant.id,
      number: "B-1000",
      seq: 1000,
      status: "received",
      currency: "EUR",
      subtotalCents: 1000,
      taxCents: 91,
      totalCents: 1000,
    });
    await expect(updateProfile(db, ctx, { ...profile, currency: "USD" })).rejects.toMatchObject({
      message: "currency_locked",
    });
    await expect(updateProfile(db, ctx, profile)).resolves.toBeTruthy();
  });

  it("saves service settings and always keeps the default locale enabled", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const s = await updateServiceSettings(db, ctx, {
      orderPrefix: "br",
      pricesIncludeTax: true,
      sessionAutoCloseMinutes: 120,
      enabledLocales: ["en", "ar"],
      openingHours: { mon: [{ open: "12:00", close: "14:30" }], sun: [] },
    });
    expect(s.orderPrefix).toBe("BR");
    expect(s.enabledLocales.sort()).toEqual(["ar", "en", "fr"]);
    await expect(
      updateServiceSettings(db, ctx, {
        orderPrefix: "B-1",
        pricesIncludeTax: true,
        enabledLocales: ["fr"],
        openingHours: null,
        sessionAutoCloseMinutes: null,
      }),
    ).rejects.toBeTruthy();
  });

  it("validates legal information", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    await expect(updateLegal(db, ctx, { privacyPolicyUrl: "javascript:alert(1)" })).rejects.toBeTruthy();
    const l = await updateLegal(db, ctx, {
      legalName: "Brielle SAS",
      vatNumber: "FR123",
      privacyPolicyUrl: "https://x.fr/p",
    });
    expect(l.legalName).toBe("Brielle SAS");
  });

  it("only managers can change settings", async () => {
    const { restaurant } = await createOwnerWithRestaurant();
    const s = await createUser();
    await addMember(restaurant.id, s.user.id, "staff");
    const sctx = await contextFor(s.sessionUser, restaurant.id);
    await expect(updateProfile(db, sctx, profile)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getRestaurantSettingsView(db, sctx)).resolves.toBeTruthy();
  });
});

describe("tax rates", () => {
  it("parses percentages to basis points", () => {
    expect(parsePercentToBps("10")).toBe(1000);
    expect(parsePercentToBps("5,5")).toBe(550);
    expect(parsePercentToBps("2.1")).toBe(210);
    expect(parsePercentToBps("101")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
  });

  it("creates, switches default and protects rates in use", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    const custom = await createTaxRate(db, ctx, { name: "TVA 8,5 % (DOM)", rateBps: 850 });
    await setDefaultTaxRate(db, ctx, custom.id);
    const rates = await listTaxRates(db, ctx);
    expect(rates.filter((r) => r.isDefault).map((r) => r.id)).toEqual([custom.id]);
    await expect(deleteTaxRate(db, ctx, custom.id)).rejects.toMatchObject({ message: "tax_rate_default" });

    const used = rates.find((r) => r.rateBps === 2000)!;
    const [cat] = await db
      .insert(categories)
      .values({ restaurantId: restaurant.id, name: "Vins" })
      .returning();
    await db.insert(products).values({
      restaurantId: restaurant.id,
      categoryId: cat!.id,
      name: "Rouge",
      priceCents: 600,
      taxRateId: used.id,
    });
    await expect(deleteTaxRate(db, ctx, used.id)).rejects.toMatchObject({ message: "tax_rate_in_use" });

    const unused = rates.find((r) => r.rateBps === 550)!;
    await deleteTaxRate(db, ctx, unused.id);
    expect((await listTaxRates(db, ctx)).map((r) => r.id)).not.toContain(unused.id);
  });
});

describe("images & logo", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageDriver(mem);
  });
  afterEach(() => setStorageDriver(undefined));

  it("re-encodes uploads, strips metadata and caps dimensions", async () => {
    const out = await processImage(await photo(3000, 2000), PRODUCT_VARIANTS);
    expect(out.variants.map((v) => v.suffix)).toEqual(["sm", "md", "lg"]);
    const lg = await sharp(out.variants[2]!.body).metadata();
    expect(lg.format).toBe("webp");
    expect(lg.width).toBe(1280);
    expect(lg.exif).toBeUndefined();
    expect(out.placeholder).toMatch(/^data:image\/webp;base64,/);
  });

  it("rejects non-images, SVG and empty files", async () => {
    await expect(processImage(Buffer.from("<?php echo 1; ?>"), PRODUCT_VARIANTS)).rejects.toMatchObject({
      message: "image_invalid",
    });
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    );
    await expect(processImage(svg, PRODUCT_VARIANTS)).rejects.toMatchObject({ message: "image_format" });
    await expect(processImage(Buffer.alloc(0), PRODUCT_VARIANTS)).rejects.toMatchObject({
      message: "image_empty",
    });
  });

  it("uploads, replaces and removes the logo, cleaning old files", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const first = await uploadLogo(db, ctx, await photo(800, 800));
    expect([...mem.files.keys()].every((k) => k.startsWith(`r/${ctx.restaurant.id}/logo/`))).toBe(true);
    expect(mem.files.size).toBe(2);
    const second = await uploadLogo(db, ctx, await photo(600, 600));
    expect(second.logoKey).not.toBe(first.logoKey);
    expect(mem.files.size).toBe(2);
    expect([...mem.files.keys()].every((k) => k.startsWith(second.logoKey))).toBe(true);
    await removeLogo(db, ctx);
    expect(mem.files.size).toBe(0);
  });
});
