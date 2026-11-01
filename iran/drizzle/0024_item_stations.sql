ALTER TABLE "products" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "station_id" uuid;--> statement-breakpoint
-- Lines already ordered keep going where they went: their category's station.
UPDATE "order_items" oi SET "station_id" = c."station_id" FROM "categories" c WHERE c."id" = oi."category_id" AND c."station_id" IS NOT NULL;
