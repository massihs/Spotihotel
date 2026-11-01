import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { cityOf, distanceKm } from "@/lib/directory";
import {
  getListing,
  loadDirectory,
  searchDirectory,
  updateListing,
} from "@/server/modules/directory/service";
import { createOwnerWithRestaurant } from "../helpers/factories";

describe("public restaurant guide", () => {
  it("matches Persian and English city spellings", () => {
    expect(cityOf("تهران")?.key).toBe("tehran");
    expect(cityOf(" Tehran ")?.key).toBe("tehran");
    expect(cityOf("خرم آباد")?.key).toBe("khorramabad");
    expect(cityOf("بندر عباس")?.key).toBe("bandar-abbas");
    expect(cityOf("Paris")).toBeNull();
    // Tehran → Karaj is about 40 km as the crow flies.
    expect(distanceKm({ lat: 35.6892, lng: 51.389 }, { lat: 35.84, lng: 50.9391 })).toBeGreaterThan(35);
  });

  it("lists only opted-in restaurants, filters by city, theme and distance", async () => {
    const a = await createOwnerWithRestaurant("Guide Kebab");
    const b = await createOwnerWithRestaurant("Guide Café");
    const hidden = await createOwnerWithRestaurant("Guide Hidden");
    await updateListing(db, a.ctx, {
      listed: true,
      cuisines: ["kebab", "iranian"],
      priceLevel: 2,
      tagline: "کباب",
      city: "تهران",
      latitude: "35.7575",
      longitude: "51.4106",
    });
    // No position: the city centre stands in.
    await updateListing(db, b.ctx, {
      listed: true,
      cuisines: ["cafe"],
      priceLevel: null,
      showPublicPrices: false,
      tagline: "",
      city: "Shiraz",
      latitude: "",
      longitude: "",
    });
    await updateListing(db, hidden.ctx, {
      listed: false,
      cuisines: ["cafe"],
      priceLevel: null,
      tagline: null,
      city: "تهران",
      latitude: "",
      longitude: "",
    });
    expect((await getListing(db, a.ctx)).cityKey).toBe("tehran");

    const ids = new Set([a.ctx.restaurant.id, b.ctx.restaurant.id, hidden.ctx.restaurant.id]);
    const all = (await loadDirectory(db)).filter((e) => ids.has(e.id));
    expect(all.map((e) => e.name).sort()).toEqual(["Guide Café", "Guide Kebab"]);
    const cafe = all.find((e) => e.name === "Guide Café")!;
    expect(cafe.position).toMatchObject({ approximate: true });
    expect(cafe.city?.key).toBe("shiraz");
    // Prices: shown by default, hidden on the public page when the owner says so.
    expect(cafe.showPrices).toBe(false);
    expect(all.find((e) => e.name === "Guide Kebab")!.showPrices).toBe(true);
    expect((await getListing(db, b.ctx)).showPublicPrices).toBe(false);

    expect(searchDirectory(all, { city: "tehran" }).map((e) => e.name)).toEqual(["Guide Kebab"]);
    expect(searchDirectory(all, { cuisine: "cafe" }).map((e) => e.name)).toEqual(["Guide Café"]);
    expect(searchDirectory(all, { q: "kebab" }).map((e) => e.name)).toEqual(["Guide Kebab"]);
    const near = searchDirectory(all, { near: { lat: 35.745, lng: 51.375 }, radiusKm: 10 });
    expect(near.map((e) => e.name)).toEqual(["Guide Kebab"]);
    expect(near[0]!.distanceKm).toBeLessThan(5);
    // Without a radius everything is ordered nearest first.
    expect(searchDirectory(all, { near: { lat: 29.6, lng: 52.58 } }).map((e) => e.name)).toEqual([
      "Guide Café",
      "Guide Kebab",
    ]);
  });

  it("rejects half a position and more than five themes", async () => {
    const { ctx } = await createOwnerWithRestaurant("Guide Invalid");
    const base = { listed: true, priceLevel: null, tagline: null, city: null } as const;
    await expect(
      updateListing(db, ctx, { ...base, cuisines: [], latitude: "35.7", longitude: "" }),
    ).rejects.toThrow();
    await expect(
      updateListing(db, ctx, {
        ...base,
        cuisines: ["cafe", "kebab", "iranian", "pizza", "asian", "fine"],
        latitude: "",
        longitude: "",
      }),
    ).rejects.toThrow();
  });
});
