CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(16) DEFAULT 'backgammon' NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"target_points" integer NOT NULL,
	"white_guest_id" uuid NOT NULL,
	"white_name" varchar(60) NOT NULL,
	"white_table" varchar(30),
	"black_guest_id" uuid,
	"black_name" varchar(60),
	"black_table" varchar(30),
	"state" jsonb NOT NULL,
	"turn_deadline" timestamp with time zone,
	"white_seen_at" timestamp with time zone,
	"black_seen_at" timestamp with time zone,
	"winner_guest_id" uuid,
	"finish_reason" varchar(12),
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_restaurant_status_idx" ON "games" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "games_winner_idx" ON "games" USING btree ("restaurant_id","winner_guest_id");