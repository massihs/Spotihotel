import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/server/db/client";
import { optionValues, taxRates } from "@/server/db/schema";
import { setStorageDriver, type StorageDriver } from "@/server/infra/storage";
import {
  addTemplateCategories,
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "@/server/modules/menu/categories";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  reorderProducts,
  setProductFlags,
  updateProduct,
} from "@/server/modules/menu/products";
import { addProductImage, deleteProductImage, setPrimaryImage } from "@/server/modules/menu/images";
import {
  createOptionGroup,
  deleteOptionGroup,
  listOptionGroups,
  updateOptionGroup,
} from "@/server/modules/menu/options";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

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

const jpeg = () =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c84" } })
    .jpeg()
    .toBuffer();

const base = (categoryId: string) => ({ categoryId, name: "Entrecôte", priceCents: 3200 });

describe("categories", () => {
  it("creates, renames, reorders and deletes empty categories", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const a = await createCategory(db, ctx, { name: "Entrées" });
    const b = await createCategory(db, ctx, { name: "Plats" });
    const c = await createCategory(db, ctx, { name: "Desserts" });
    expect((await listCategories(db, ctx)).map((x) => x.name)).toEqual(["Entrées", "Plats", "Desserts"]);

    await reorderCategories(db, ctx, [c.id, a.id, b.id]);
    expect((await listCategories(db, ctx)).map((x) => x.name)).toEqual(["Desserts", "Entrées", "Plats"]);

    await updateCategory(db, ctx, a.id, { name: "Pour commencer", isActive: false });
    await deleteCategory(db, ctx, b.id);
    const after = await listCategories(db, ctx);
    expect(after.map((x) => [x.name, x.isActive])).toEqual([
      ["Desserts", true],
      ["Pour commencer", false],
    ]);
  });

  it("rejects stale or foreign reorder lists", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const other = await createOwnerWithRestaurant();
    const a = await createCategory(db, ctx, { name: "A" });
    const b = await createCategory(db, ctx, { name: "B" });
    const foreign = await createCategory(db, other.ctx, { name: "X" });
    await expect(reorderCategories(db, ctx, [a.id])).rejects.toMatchObject({ message: "reorder_mismatch" });
    await expect(reorderCategories(db, ctx, [a.id, foreign.id])).rejects.toMatchObject({
      message: "reorder_mismatch",
    });
    await expect(reorderCategories(db, ctx, [a.id, a.id])).rejects.toMatchObject({
      message: "reorder_mismatch",
    });
    await reorderCategories(db, ctx, [b.id, a.id]);
  });

  it("adds predefined categories once, keeping custom ones", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    await createCategory(db, ctx, { name: "Spécialités iraniennes" });
    const r1 = await addTemplateCategories(db, ctx, [
      { key: "pizza", name: "Pizza" },
      { key: "desserts", name: "Desserts" },
      { key: "evil", name: "<script>" },
    ]);
    expect(r1.created).toBe(2);
    const r2 = await addTemplateCategories(db, ctx, [{ key: "pizza", name: "Pizza" }]);
    expect(r2.created).toBe(0);
    expect((await listCategories(db, ctx)).map((c) => c.name)).toEqual([
      "Spécialités iraniennes",
      "Pizza",
      "Desserts",
    ]);
  });

  it("refuses to delete a category that still has products", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const p = await createProduct(db, ctx, base(cat.id));
    const other = await createCategory(db, ctx, { name: "Vide" });
    const counts = Object.fromEntries((await listCategories(db, ctx)).map((c) => [c.id, c.productCount]));
    expect(counts).toEqual({ [cat.id]: 1, [other.id]: 0 });
    await expect(deleteCategory(db, ctx, cat.id)).rejects.toMatchObject({ message: "category_not_empty" });
    await deleteProduct(db, ctx, p.id);
    await deleteCategory(db, ctx, cat.id);
  });
});

describe("products", () => {
  it("stores every field and applies the default tax rate", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Steak" });
    const p = await createProduct(db, ctx, {
      ...base(cat.id),
      description: "Race normande",
      compareAtPriceCents: 3600,
      ingredients: "Bœuf, sel, poivre",
      allergens: ["milk", "mustard"],
      caloriesKcal: 1050,
      weightGrams: 300,
      tags: ["Signature", "halal"],
      isFeatured: true,
    });
    const [def] = await db
      .select()
      .from(taxRates)
      .where(eq(taxRates.restaurantId, restaurant.id))
      .then((r) => r.filter((x) => x.isDefault));
    expect(p).toMatchObject({
      priceCents: 3200,
      compareAtPriceCents: 3600,
      allergens: ["milk", "mustard"],
      tags: ["signature", "halal"],
      isFeatured: true,
      taxRateId: def!.id,
      sortOrder: 0,
    });
  });

  it("validates prices, promo, allergens and tags", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Plats" });
    await expect(createProduct(db, ctx, { ...base(cat.id), priceCents: -1 })).rejects.toBeTruthy();
    await expect(createProduct(db, ctx, { ...base(cat.id), priceCents: 19.9 })).rejects.toBeTruthy();
    await expect(
      createProduct(db, ctx, { ...base(cat.id), compareAtPriceCents: 3000 }),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({ message: "compare_at_not_higher" })],
    });
    // @ts-expect-error unknown allergen
    await expect(createProduct(db, ctx, { ...base(cat.id), allergens: ["arsenic"] })).rejects.toBeTruthy();
    await expect(createProduct(db, ctx, { ...base(cat.id), tags: ["<b>x</b>"] })).rejects.toBeTruthy();
  });

  it("never links categories, tax rates or option groups of another restaurant", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    const catA = await createCategory(db, a.ctx, { name: "A" });
    const catB = await createCategory(db, b.ctx, { name: "B" });
    const [rateB] = await db.select().from(taxRates).where(eq(taxRates.restaurantId, b.restaurant.id));
    const groupB = await createOptionGroup(db, b.ctx, {
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "Saignant" }],
    });

    await expect(createProduct(db, a.ctx, base(catB.id))).rejects.toMatchObject({
      message: "invalid_category",
    });
    await expect(createProduct(db, a.ctx, { ...base(catA.id), taxRateId: rateB!.id })).rejects.toMatchObject({
      message: "invalid_tax_rate",
    });
    await expect(
      createProduct(db, a.ctx, { ...base(catA.id), optionGroupIds: [groupB.id] }),
    ).rejects.toMatchObject({
      message: "invalid_option_group",
    });
    const pB = await createProduct(db, b.ctx, base(catB.id));
    await expect(getProduct(db, a.ctx, pB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateProduct(db, a.ctx, pB.id, base(catA.id))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteProduct(db, a.ctx, pB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reorders within a category and appends when moved to another one", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const plats = await createCategory(db, ctx, { name: "Plats" });
    const desserts = await createCategory(db, ctx, { name: "Desserts" });
    const p1 = await createProduct(db, ctx, { ...base(plats.id), name: "P1" });
    const p2 = await createProduct(db, ctx, { ...base(plats.id), name: "P2" });
    const p3 = await createProduct(db, ctx, { ...base(plats.id), name: "P3" });
    await createProduct(db, ctx, { ...base(desserts.id), name: "D1" });

    await reorderProducts(db, ctx, plats.id, [p3.id, p1.id, p2.id]);
    expect((await listProducts(db, ctx, plats.id)).map((p) => p.name)).toEqual(["P3", "P1", "P2"]);
    await expect(reorderProducts(db, ctx, desserts.id, [p1.id])).rejects.toMatchObject({
      message: "reorder_mismatch",
    });

    await updateProduct(db, ctx, p1.id, { ...base(desserts.id), name: "P1" });
    expect((await listProducts(db, ctx, desserts.id)).map((p) => p.name)).toEqual(["D1", "P1"]);
  });

  it("staff can mark a dish sold out but cannot hide or edit it", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const p = await createProduct(db, ctx, base(cat.id));
    const s = await createUser();
    await addMember(restaurant.id, s.user.id, "staff");
    const sctx = await contextFor(s.sessionUser, restaurant.id);
    await expect(setProductFlags(db, sctx, p.id, { isAvailable: false })).resolves.toMatchObject({
      isAvailable: false,
    });
    await expect(setProductFlags(db, sctx, p.id, { isActive: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(updateProduct(db, sctx, p.id, base(cat.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listProducts(db, sctx, cat.id))[0]?.isAvailable).toBe(false);
  });

  it("logs price changes in the audit trail", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const p = await createProduct(db, ctx, base(cat.id));
    await updateProduct(db, ctx, p.id, { ...base(cat.id), priceCents: 3400 });
    const logs = await db.query.auditLogs.findMany({ where: (a, { eq: e }) => e(a.entityId, p.id) });
    expect(logs.find((l) => l.action === "product.updated")?.metadata).toEqual({
      priceCents: { from: 3200, to: 3400 },
    });
  });
});

describe("option groups", () => {
  it("creates groups and validates min/max/defaults", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    await expect(
      createOptionGroup(db, ctx, {
        name: "X",
        minSelect: 2,
        maxSelect: 1,
        values: [{ name: "a" }, { name: "b" }],
      }),
    ).rejects.toBeTruthy();
    await expect(
      createOptionGroup(db, ctx, { name: "X", minSelect: 2, maxSelect: 3, values: [{ name: "a" }] }),
    ).rejects.toBeTruthy();
    await expect(
      createOptionGroup(db, ctx, {
        name: "X",
        minSelect: 0,
        maxSelect: 1,
        values: [
          { name: "a", isDefault: true },
          { name: "b", isDefault: true },
        ],
      }),
    ).rejects.toBeTruthy();
    await expect(
      createOptionGroup(db, ctx, { name: "X", minSelect: 0, maxSelect: 1, values: [] }),
    ).rejects.toBeTruthy();

    const g = await createOptionGroup(db, ctx, {
      name: "Suppléments",
      minSelect: 0,
      maxSelect: 3,
      values: [
        { name: "Fromage", priceDeltaCents: 200 },
        { name: "Bacon", priceDeltaCents: 250 },
      ],
    });
    const [listed] = await listOptionGroups(db, ctx);
    expect(listed?.id).toBe(g.id);
    expect(listed?.values.map((v) => [v.name, v.priceDeltaCents])).toEqual([
      ["Fromage", 200],
      ["Bacon", 250],
    ]);
  });

  it("updates values in place (stable ids), adds new ones and soft-deletes removed ones", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const other = await createOwnerWithRestaurant();
    const g = await createOptionGroup(db, ctx, {
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "Bleu" }, { name: "Saignant" }],
    });
    const [bleu, saignant] = (await listOptionGroups(db, ctx))[0]!.values;
    await updateOptionGroup(db, ctx, g.id, {
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [{ id: saignant!.id, name: "Saignant", isDefault: true }, { name: "À point" }],
    });
    const values = (await listOptionGroups(db, ctx))[0]!.values;
    expect(values.map((v) => v.name)).toEqual(["Saignant", "À point"]);
    expect(values[0]!.id).toBe(saignant!.id);
    const [deleted] = await db.select().from(optionValues).where(eq(optionValues.id, bleu!.id));
    expect(deleted?.deletedAt).not.toBeNull();

    // A value id from another group/restaurant cannot be hijacked.
    const og = await createOptionGroup(db, other.ctx, {
      name: "Taille",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "L" }],
    });
    const foreignValue = (await listOptionGroups(db, other.ctx))[0]!.values[0]!;
    await expect(
      updateOptionGroup(db, ctx, g.id, {
        name: "Cuisson",
        minSelect: 0,
        maxSelect: 1,
        values: [{ id: foreignValue.id, name: "pwn" }],
      }),
    ).rejects.toMatchObject({ message: "invalid_option_value" });
    await expect(deleteOptionGroup(db, ctx, og.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("links groups to products in order and unlinks them on deletion", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Steak" });
    const cuisson = await createOptionGroup(db, ctx, {
      name: "Cuisson",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "Saignant" }],
    });
    const sauce = await createOptionGroup(db, ctx, {
      name: "Sauce",
      minSelect: 0,
      maxSelect: 1,
      values: [{ name: "Poivre", priceDeltaCents: 150 }],
    });
    const p = await createProduct(db, ctx, { ...base(cat.id), optionGroupIds: [sauce.id, cuisson.id] });
    expect((await getProduct(db, ctx, p.id)).optionGroupIds).toEqual([sauce.id, cuisson.id]);
    expect((await listOptionGroups(db, ctx)).find((g) => g.id === sauce.id)?.usage).toBe(1);
    await deleteOptionGroup(db, ctx, sauce.id);
    expect((await getProduct(db, ctx, p.id)).optionGroupIds).toEqual([cuisson.id]);
  });
});

describe("product images", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageDriver(mem);
  });
  afterEach(() => setStorageDriver(undefined));

  it("stores responsive variants, caps the count, sets primary and cleans up on delete", async () => {
    const { ctx } = await createOwnerWithRestaurant();
    const cat = await createCategory(db, ctx, { name: "Plats" });
    const p = await createProduct(db, ctx, base(cat.id));
    const img1 = await addProductImage(db, ctx, p.id, await jpeg());
    expect(mem.files.size).toBe(3);
    expect(img1.urls.md).toMatch(/-md\.webp$/);
    expect(img1.placeholder).toMatch(/^data:image\/webp/);
    const img2 = await addProductImage(db, ctx, p.id, await jpeg());
    for (let i = 0; i < 3; i++) await addProductImage(db, ctx, p.id, await jpeg());
    await expect(addProductImage(db, ctx, p.id, await jpeg())).rejects.toMatchObject({
      message: "too_many_images",
    });
    expect(mem.files.size).toBe(15);

    await setPrimaryImage(db, ctx, img2.id);
    expect((await getProduct(db, ctx, p.id)).images[0]?.id).toBe(img2.id);
    expect((await listProducts(db, ctx, cat.id))[0]?.image?.sm).toBe(img2.urls.sm);

    await deleteProductImage(db, ctx, img2.id);
    expect(mem.files.size).toBe(12);
    expect((await getProduct(db, ctx, p.id)).images.map((i) => i.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it("rejects images for foreign products and non-image files", async () => {
    const a = await createOwnerWithRestaurant();
    const b = await createOwnerWithRestaurant();
    const catB = await createCategory(db, b.ctx, { name: "B" });
    const pB = await createProduct(db, b.ctx, base(catB.id));
    await expect(addProductImage(db, a.ctx, pB.id, await jpeg())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(addProductImage(db, b.ctx, pB.id, Buffer.from("not an image"))).rejects.toMatchObject({
      message: "image_invalid",
    });
    expect(mem.files.size).toBe(0);
  });
});
