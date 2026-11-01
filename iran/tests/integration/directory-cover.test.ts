import { afterEach, beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { db } from "@/server/db/client";
import { setStorageDriver, type StorageDriver } from "@/server/infra/storage";
import { createCategory } from "@/server/modules/menu/categories";
import { addProductImage, deleteProductImage } from "@/server/modules/menu/images";
import { createProduct } from "@/server/modules/menu/products";
import {
  chooseDishCover,
  getCoverChoices,
  loadDirectory,
  resetCover,
  updateListing,
  uploadCover,
} from "@/server/modules/directory/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

class MemoryStorage implements StorageDriver {
  files = new Map<string, Buffer>();
  async put(k: string, b: Buffer) {
    this.files.set(k, b);
  }
  async get(k: string) {
    const b = this.files.get(k);
    return b ? { body: b, contentType: "image/webp" } : null;
  }
  async delete(keys: string[]) {
    keys.forEach((k) => this.files.delete(k));
  }
  publicUrl(k: string) {
    return `/f/${k}`;
  }
}

const jpeg = (color: string) =>
  sharp({ create: { width: 1800, height: 1100, channels: 3, background: color } })
    .jpeg()
    .toBuffer();

let store: MemoryStorage;
beforeEach(() => {
  store = new MemoryStorage();
  setStorageDriver(store);
});
afterEach(() => setStorageDriver(undefined));

describe("guide photo", () => {
  it("is automatic, an uploaded photo, or a chosen dish photo", async () => {
    const { ctx } = await createOwnerWithRestaurant("Cover Place");
    await updateListing(db, ctx, {
      listed: true,
      cuisines: [],
      priceLevel: null,
      tagline: null,
      city: "تهران",
      latitude: "",
      longitude: "",
    });
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const dish = await createProduct(db, ctx, { categoryId: cat.id, name: "Kebab", priceCents: 1000 });
    const img = await addProductImage(db, ctx, dish.id, await jpeg("#c84"));
    const coverOf = async () =>
      (await loadDirectory(db)).find((e) => e.id === ctx.restaurant.id)!.cover?.lg ?? null;

    expect((await getCoverChoices(db, ctx)).mode).toBe("auto");
    expect(await coverOf()).toContain(img.storageKey);

    const up = await uploadCover(db, ctx, await jpeg("#48c"));
    expect(await coverOf()).toBe(up.lg);
    expect((await getCoverChoices(db, ctx)).mode).toBe("upload");
    const uploaded = [...store.files.keys()].filter((k) => k.includes("/cover/"));
    expect(uploaded).toHaveLength(2);

    // Choosing a dish photo frees the uploaded files.
    await chooseDishCover(db, ctx, img.id);
    expect((await getCoverChoices(db, ctx)).mode).toBe("dish");
    expect([...store.files.keys()].some((k) => k.includes("/cover/"))).toBe(false);

    // A chosen dish photo that is deleted falls back to automatic.
    await deleteProductImage(db, ctx, img.id);
    expect((await getCoverChoices(db, ctx)).mode).toBe("auto");
    expect(await coverOf()).toBeNull();

    await resetCover(db, ctx);
    expect((await getCoverChoices(db, ctx)).mode).toBe("auto");
  });

  it("refuses another restaurant's dish photo", async () => {
    const a = await createOwnerWithRestaurant("Cover A");
    const b = await createOwnerWithRestaurant("Cover B");
    const cat = await createCategory(db, b.ctx, { name: "Plats" });
    const dish = await createProduct(db, b.ctx, { categoryId: cat.id, name: "Dizi", priceCents: 1000 });
    const img = await addProductImage(db, b.ctx, dish.id, await jpeg("#8c4"));
    await expect(chooseDishCover(db, a.ctx, img.id)).rejects.toThrow();
  });
});
