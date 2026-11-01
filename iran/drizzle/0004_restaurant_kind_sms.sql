CREATE TYPE "public"."restaurant_kind" AS ENUM('restaurant', 'cafe', 'food_court');--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "kind" "restaurant_kind" DEFAULT 'restaurant' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ready_sms_sent_at" timestamp with time zone;