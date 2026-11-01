import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { getDisabledModules, setModuleEnabled } from "@/server/modules/restaurants/settings";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("restaurant modules", () => {
  it("switches optional modules off and on, in a stable order", async () => {
    const { ctx } = await createOwnerWithRestaurant("Modules");
    expect(await getDisabledModules(db, ctx)).toEqual([]);
    await setModuleEnabled(db, ctx, "music", false);
    await setModuleEnabled(db, ctx, "delivery", false);
    await setModuleEnabled(db, ctx, "delivery", false);
    expect(await getDisabledModules(db, ctx)).toEqual(["delivery", "music"]);
    await setModuleEnabled(db, ctx, "delivery", true);
    expect(await getDisabledModules(db, ctx)).toEqual(["music"]);
    await expect(setModuleEnabled(db, ctx, "orders", false)).rejects.toThrow();
  });
});
