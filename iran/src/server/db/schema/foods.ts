import { boolean, jsonb, pgTable, real, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import type { Nutrition } from "@/lib/nutrition";
import { pk, timestamps } from "./_helpers";

/**
 * Food composition database (shared by every restaurant): USDA FoodData Central SR Legacy
 * (public domain) plus Spotifood's multilingual ingredients and dish recipes. Values per 100 g
 * (for a recipe: per portion, `portionG` grams).
 */
export const foods = pgTable(
  "foods",
  {
    id: pk(),
    /** "usda_sr" | "spotifood_ingredient" | "spotifood_recipe" */
    source: varchar({ length: 24 }).notNull(),
    /** USDA fdc_id, or the catalogue key. */
    sourceRef: varchar({ length: 64 }).notNull(),
    nameEn: text().notNull(),
    nameFr: text(),
    nameFa: text(),
    /** Other names, lower case, for search. */
    aliases: text().notNull().default(""),
    category: varchar({ length: 120 }),
    per100g: jsonb().$type<Nutrition>().notNull(),
    portionG: real(),
    /** Recipe: per portion values. */
    perPortion: jsonb().$type<Nutrition>(),
    isRecipe: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("foods_source_ref_uq").on(t.source, t.sourceRef)],
);
