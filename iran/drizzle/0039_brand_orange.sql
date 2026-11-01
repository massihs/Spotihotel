ALTER TABLE "restaurants" ALTER COLUMN "brand_color" SET DEFAULT 'orange';--> statement-breakpoint
UPDATE "restaurants" SET "brand_color" = 'orange' WHERE "brand_color" = 'violet';