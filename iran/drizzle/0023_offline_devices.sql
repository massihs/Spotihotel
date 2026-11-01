CREATE TABLE "offline_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_by_user_id" uuid,
	"last_seen_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"synced_orders" integer DEFAULT 0 NOT NULL,
	"app_version" varchar(24),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offline_ref" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "offline_number" varchar(24);--> statement-breakpoint
ALTER TABLE "offline_devices" ADD CONSTRAINT "offline_devices_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_devices_restaurant_idx" ON "offline_devices" USING btree ("restaurant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_offline_ref_uq" ON "orders" USING btree ("restaurant_id","offline_ref") WHERE "orders"."offline_ref" is not null;