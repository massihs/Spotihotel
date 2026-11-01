import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { adjustedPrice } from "@/lib/price-adjust";
import { createCategory } from "@/server/modules/menu/categories";
import {
  adjustPrices,
  createProduct,
  listProducts,
  setProductFlags,
  setProductPrice,
} from "@/server/modules/menu/products";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

describe("menu pricing tools", () => {
  it("rounds a percent change to the step, never below one step", () => {
    expect(adjustedPrice(790_000_000, 10, 1_000_000)).toBe(869_000_000);
    expect(adjustedPrice(1_319_000_000, 10, 5_000_000)).toBe(1_450_000_000);
    expect(adjustedPrice(400_000, -50, 1_000_000)).toBe(1_000_000);
    expect(adjustedPrice(1999, 10, 0)).toBe(2199);
  });

  it("reprices a category or the whole menu, and edits one price in place", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Pricing", { plan: "professional" });
    const mains = await createCategory(db, ctx, { name: "Mains" });
    const drinks = await createCategory(db, ctx, { name: "Drinks" });
    const kebab = await createProduct(db, ctx, {
      categoryId: mains.id,
      name: "کباب",
      priceCents: 2_000_000_000,
    });
    const tea = await createProduct(db, ctx, { categoryId: drinks.id, name: "چای", priceCents: 150_000_000 });

    const res = await adjustPrices(db, ctx, { categoryId: mains.id, percent: 15, roundTo: 10_000_000 });
    expect(res.changed).toBe(1);
    const price = async (id: string) => (await listProducts(db, ctx)).find((p) => p.id === id)!.priceCents;
    expect(await price(kebab.id)).toBe(2_300_000_000);
    expect(await price(tea.id)).toBe(150_000_000);

    await adjustPrices(db, ctx, { categoryId: null, percent: -10, roundTo: 0 });
    expect(await price(tea.id)).toBe(135_000_000);
    await expect(adjustPrices(db, ctx, { categoryId: null, percent: 0, roundTo: 0 })).rejects.toThrow();
    await expect(adjustPrices(db, ctx, { categoryId: null, percent: 500, roundTo: 0 })).rejects.toThrow();

    await setProductPrice(db, ctx, tea.id, 160_000_000);
    expect(await price(tea.id)).toBe(160_000_000);
    await setProductFlags(db, ctx, tea.id, { isFeatured: true });
    expect((await listProducts(db, ctx)).find((p) => p.id === tea.id)!.isFeatured).toBe(true);

    // Staff may mark a dish sold out, but not reprice or feature it.
    const s = await createUser();
    await addMember(restaurant.id, s.user.id, "staff");
    const staff = await contextFor(s.sessionUser, restaurant.id);
    await expect(setProductPrice(db, staff, tea.id, 1)).rejects.toThrow();
    await expect(setProductFlags(db, staff, tea.id, { isFeatured: false })).rejects.toThrow();
    await setProductFlags(db, staff, tea.id, { isAvailable: false });
  });
});
