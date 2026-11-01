import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import {
  categories,
  optionValues,
  productOptionGroups,
  products,
  restaurantSettings,
} from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createOptionGroup } from "@/server/modules/menu/options";
import { copyMenuFrom, createBranch, groupOverview } from "@/server/modules/branches/service";
import { createOwnerWithRestaurant, contextFor } from "../helpers/factories";

const live = (rid: string) => and(eq(products.restaurantId, rid), isNull(products.deletedAt));

describe("branches", () => {
  it("opens a branch with the menu and settings, and copies menus between branches", async () => {
    const { ctx, sessionUser } = await createOwnerWithRestaurant("Kebab Tajrish");
    await db
      .update(restaurantSettings)
      .set({ requirePaymentBeforeOrder: true, loyaltyPointValueCents: 777 })
      .where(eq(restaurantSettings.restaurantId, ctx.restaurant.id));
    const cat = await createCategory(db, ctx, { name: "Kebab" });
    const size = await createOptionGroup(db, ctx, {
      name: "Taille",
      minSelect: 1,
      maxSelect: 1,
      values: [{ name: "Normal" }, { name: "Grand", priceDeltaCents: 200 }],
    });
    await createProduct(db, ctx, {
      categoryId: cat.id,
      name: "Koobideh",
      priceCents: 1500,
      optionGroupIds: [size.id],
    });
    await createProduct(db, ctx, { categoryId: cat.id, name: "Joojeh", priceCents: 1800 });

    const branch = await createBranch(db, ctx, { name: "Kebab Vanak" });
    expect(branch.organizationId).toBe(ctx.restaurant.organizationId);
    const copied = await db.select().from(products).where(live(branch.id));
    expect(copied.map((p) => p.name).sort()).toEqual(["Joojeh", "Koobideh"]);
    const [s] = await db
      .select()
      .from(restaurantSettings)
      .where(eq(restaurantSettings.restaurantId, branch.id));
    expect(s).toMatchObject({ requirePaymentBeforeOrder: true, loyaltyPointValueCents: 777 });
    const koob = copied.find((p) => p.name === "Koobideh")!;
    const [link] = await db
      .select()
      .from(productOptionGroups)
      .where(eq(productOptionGroups.productId, koob.id));
    expect(link!.groupId).not.toBe(size.id);
    expect(await db.select().from(optionValues).where(eq(optionValues.groupId, link!.groupId))).toHaveLength(
      2,
    );

    const branchCtx = await contextFor(sessionUser, branch.id);
    const overview = await groupOverview(db, branchCtx);
    expect(overview.map((b) => b.name).sort()).toEqual(["Kebab Tajrish", "Kebab Vanak"]);

    // Replace: the branch menu is archived and re-imported; append doubles it.
    await copyMenuFrom(db, branchCtx, ctx, { fromId: ctx.restaurant.id, mode: "replace" });
    expect(await db.select().from(products).where(live(branch.id))).toHaveLength(2);
    await copyMenuFrom(db, branchCtx, ctx, { fromId: ctx.restaurant.id, mode: "append" });
    expect(await db.select().from(products).where(live(branch.id))).toHaveLength(4);
    const cats = await db
      .select()
      .from(categories)
      .where(and(eq(categories.restaurantId, branch.id), isNull(categories.deletedAt)));
    expect(cats).toHaveLength(2);

    // Another owner's restaurant cannot be a source.
    const other = await createOwnerWithRestaurant("Ailleurs");
    await expect(
      copyMenuFrom(db, branchCtx, other.ctx, { fromId: other.ctx.restaurant.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
