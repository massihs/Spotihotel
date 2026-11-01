import { tidy } from "@/lib/nutrition";
import { isCategoryIcon } from "@/lib/category-icons";
import { MAX_AMOUNT_CENTS } from "@/lib/money";
import { z } from "zod";

/** The 14 allergens that must be declared in the EU (Regulation 1169/2011, Annex II). */
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** Suggested tags; restaurants may also use their own (slug format). */
export const SUGGESTED_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "spicy",
  "halal",
  "homemade",
  "new",
  "signature",
] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const cents = z.number().int().min(0).max(MAX_AMOUNT_CENTS);
const optionalInt = (max: number) => z.number().int().min(0).max(max).nullable().optional();
const grams = z.number().min(0).max(5000).optional();

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: text(500),
  /** One of the 80 library icons; empty → none (the template icon or a plate is shown). */
  icon: z
    .string()
    .trim()
    .refine((v) => v === "" || isCategoryIcon(v), "invalid_icon")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  templateKey: text(48),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.input<typeof categorySchema>;

export const productSchema = z
  .object({
    categoryId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    description: text(1000),
    priceCents: cents,
    /** Original price, shown struck through: must be higher than the current price. */
    compareAtPriceCents: cents.nullable().optional(),
    takeawayPriceCents: cents.nullable().optional(),
    deliveryPriceCents: cents.nullable().optional(),
    taxRateId: z.uuid().nullable().optional(),
    ingredients: text(1000),
    allergens: z.array(z.enum(ALLERGENS)).max(ALLERGENS.length).default([]),
    caloriesKcal: optionalInt(10_000),
    weightGrams: optionalInt(100_000),
    /** Per portion; kcal is taken from caloriesKcal. */
    nutrition: z
      .object({
        proteinG: grams,
        carbsG: grams,
        sugarG: grams,
        fatG: grams,
        fiberG: grams,
        saltG: grams,
      })
      .nullable()
      .optional(),
    nutritionSource: z.enum(["manual", "estimated", "auto"]).nullable().optional(),
    tags: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_]{2,24}$/, "invalid_tag"),
      )
      .max(10)
      .default([]),
    isAvailable: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    isActive: z.boolean().default(true),
    optionGroupIds: z.array(z.uuid()).max(20).default([]),
  })
  .refine((p) => p.compareAtPriceCents == null || p.compareAtPriceCents > p.priceCents, {
    message: "compare_at_not_higher",
    path: ["compareAtPriceCents"],
  })
  .transform((p) => {
    if (p.nutrition === undefined) return p;
    const n = tidy({ ...p.nutrition, kcal: p.caloriesKcal ?? undefined });
    const nutrition = Object.keys(n).length ? n : null;
    return { ...p, nutrition, nutritionSource: p.nutritionSource ?? "manual" };
  });
export type ProductInput = z.input<typeof productSchema>;

export const optionValueSchema = z.object({
  /** Present when editing an existing value. */
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  priceDeltaCents: cents.default(0),
  isDefault: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
});

export const optionGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: text(300),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    values: z.array(optionValueSchema).min(1, "values_required").max(40),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: "min_above_max", path: ["minSelect"] })
  .refine((g) => g.minSelect <= g.values.filter((v) => v.isAvailable !== false).length, {
    message: "min_above_values",
    path: ["minSelect"],
  })
  .refine((g) => g.values.filter((v) => v.isDefault).length <= g.maxSelect, {
    message: "too_many_defaults",
    path: ["values"],
  });
export type OptionGroupInput = z.input<typeof optionGroupSchema>;

export const reorderSchema = z.array(z.uuid()).min(1).max(500);

export const MAX_PRODUCT_IMAGES = 5;
