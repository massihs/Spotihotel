import { describe, expect, it } from "vitest";
import { minibarImage, spaImage } from "@/lib/guest-images";

describe("guest portal photos", () => {
  it("picks a minibar photo from the item's name, the longest match winning", () => {
    expect(minibarImage("آب معدنی")).toBe("/guest/minibar/water.jpg");
    expect(minibarImage("آبمیوه")).toBe("/guest/minibar/juice.jpg");
    expect(minibarImage("ماءالشعیر")).toBe("/guest/minibar/beer.jpg");
    expect(minibarImage("نوشابه")).toBe("/guest/minibar/soda.jpg");
    expect(minibarImage("آجیل مخلوط")).toBe("/guest/minibar/nuts.jpg");
    expect(minibarImage("Dark chocolate")).toBe("/guest/minibar/chocolate.jpg");
    expect(minibarImage("Toblerone")).toBe("/guest/minibar/minibar.jpg");
  });

  it("has a photo for the usual wellness services", () => {
    expect(spaImage("sauna")).toBe("/guest/spa/sauna.jpg");
    expect(spaImage("tennis")).toBeNull();
  });
});
