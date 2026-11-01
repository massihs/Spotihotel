import { describe, expect, it } from "vitest";
import {
  CATEGORY_ICON_KEYS,
  TEMPLATE_ICONS,
  isCategoryIcon,
  resolveCategoryIcon,
} from "@/lib/category-icons";
import { CATEGORY_ICON_COMPONENTS } from "@/components/category-icon";
import { DEFAULT_CATEGORY_TEMPLATES } from "@/server/modules/catalog/defaults";
import { categorySchema } from "@/server/modules/menu/schemas";

describe("category icons", () => {
  it("offers 80 distinct icons, each with a component", () => {
    expect(CATEGORY_ICON_KEYS).toHaveLength(80);
    expect(new Set(CATEGORY_ICON_KEYS).size).toBe(80);
    for (const k of CATEGORY_ICON_KEYS) expect(CATEGORY_ICON_COMPONENTS[k]).toBeTruthy();
  });

  it("gives every category template a library icon", () => {
    for (const key of DEFAULT_CATEGORY_TEMPLATES) expect(isCategoryIcon(TEMPLATE_ICONS[key])).toBe(true);
  });

  it("resolves chosen icon, then template icon, then a plate", () => {
    expect(resolveCategoryIcon("pizza", "desserts")).toBe("pizza");
    expect(resolveCategoryIcon(null, "desserts")).toBe("cake-slice");
    expect(resolveCategoryIcon("not-an-icon", null)).toBe("utensils");
  });

  it("accepts only library icons in the category form", () => {
    expect(categorySchema.parse({ name: "Pizza", icon: "pizza" }).icon).toBe("pizza");
    expect(categorySchema.parse({ name: "Pizza", icon: "" }).icon).toBeNull();
    expect(() => categorySchema.parse({ name: "Pizza", icon: "skull" })).toThrow();
  });
});
