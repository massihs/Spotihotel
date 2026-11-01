import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct, listProducts } from "@/server/modules/menu/products";
import { listCategories } from "@/server/modules/menu/categories";
import { applyMenuImport, previewMenuImport } from "@/server/modules/menu/import";
import { createOwnerWithRestaurant } from "../helpers/factories";

const csv = (s: string) => new TextEncoder().encode(s);

describe("menu import (database)", () => {
  it("previews, then creates categories and dishes, skipping the ones already on the menu", async () => {
    const o = await createOwnerWithRestaurant("Import", { plan: "professional" });
    const mains = await createCategory(db, o.ctx, { name: "Mains" });
    await createProduct(db, o.ctx, { categoryId: mains.id, name: "Kebab", priceCents: 1_000_000 });
    const file = csv(
      "category,name,price\nmains,kebab,350000\nMains,Joojeh,320000\nDrinks,Doogh,50000\nDrinks,,1\n",
    );

    const preview = await previewMenuImport(db, o.ctx, file);
    expect(preview.newCategories).toEqual(["Drinks"]);
    expect(preview.rows.map((r) => [r.name, r.duplicate, r.error])).toEqual([
      ["kebab", true, null],
      ["Joojeh", false, null],
      ["Doogh", false, null],
      ["", false, "missing_name"],
    ]);

    const res = await applyMenuImport(db, o.ctx, file);
    expect(res).toEqual({ created: 2, skipped: 1, newCategories: 1 });
    expect((await listCategories(db, o.ctx)).map((c) => c.name).sort()).toEqual(["Drinks", "Mains"]);
    const dishes = await listProducts(db, o.ctx);
    expect(dishes.find((d) => d.name === "Joojeh")?.priceCents).toBe(320_000_000);
    // Importing the same file again adds nothing.
    expect(await applyMenuImport(db, o.ctx, file)).toMatchObject({ created: 0, skipped: 3 });
  });

  it("refuses an empty file", async () => {
    const o = await createOwnerWithRestaurant("Empty");
    await expect(previewMenuImport(db, o.ctx, csv("\n\n"))).rejects.toMatchObject({
      message: "import_empty",
    });
  });
});
