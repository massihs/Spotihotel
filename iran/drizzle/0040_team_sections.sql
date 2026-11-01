CREATE TABLE "team_sections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"color" varchar(16) DEFAULT 'orange' NOT NULL,
	"permissions" text[],
	"notify" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"station_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD COLUMN "section_ids" uuid[] DEFAULT ARRAY[]::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "guest_calls" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "section_ids" uuid[];--> statement-breakpoint
ALTER TABLE "team_sections" ADD CONSTRAINT "team_sections_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_sections_restaurant_idx" ON "team_sections" USING btree ("restaurant_id");