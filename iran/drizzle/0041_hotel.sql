ALTER TYPE "public"."restaurant_kind" ADD VALUE 'hotel';--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "kind" varchar(8) DEFAULT 'table' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "place_kind" varchar(8);