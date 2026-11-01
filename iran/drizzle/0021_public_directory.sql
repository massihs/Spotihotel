ALTER TABLE "restaurants" ADD COLUMN "listed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "cuisines" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "price_level" smallint;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "tagline" varchar(200);--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "longitude" double precision;--> statement-breakpoint
CREATE INDEX "restaurants_listed_city_idx" ON "restaurants" USING btree ("listed","city");