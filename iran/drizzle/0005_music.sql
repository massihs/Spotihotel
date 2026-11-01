CREATE TYPE "public"."music_plan" AS ENUM('weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."music_subscription_status" AS ENUM('pending', 'active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "music_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"theme_id" uuid NOT NULL,
	"plan" "music_plan" NOT NULL,
	"status" "music_subscription_status" DEFAULT 'pending' NOT NULL,
	"price_cents" bigint NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"requested_by_user_id" uuid,
	"activated_by_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "music_themes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"color" varchar(7) DEFAULT '#16a34a' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"radio_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "music_tracks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"theme_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"artist" varchar(160),
	"storage_key" text NOT NULL,
	"mime_type" varchar(64) NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_sec" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "music_subscriptions" ADD CONSTRAINT "music_subscriptions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_subscriptions" ADD CONSTRAINT "music_subscriptions_theme_id_music_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."music_themes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_subscriptions" ADD CONSTRAINT "music_subscriptions_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_subscriptions" ADD CONSTRAINT "music_subscriptions_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_theme_id_music_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."music_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_subscriptions_restaurant_idx" ON "music_subscriptions" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "music_themes_slug_uq" ON "music_themes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "music_tracks_theme_idx" ON "music_tracks" USING btree ("theme_id","sort_order");