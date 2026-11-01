ALTER TABLE "restaurant_settings" ADD COLUMN "kiosk_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "kiosk_token" varchar(32);