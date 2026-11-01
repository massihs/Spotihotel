ALTER TABLE "restaurant_settings" ADD COLUMN "online_ordering_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "online_takeaway" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "online_delivery" boolean DEFAULT false NOT NULL;