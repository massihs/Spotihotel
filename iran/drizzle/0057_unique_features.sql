CREATE TABLE "integrity_seals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"hash" varchar(64) NOT NULL,
	"lines" integer NOT NULL,
	"total_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_tips" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"staff_user_id" uuid NOT NULL,
	"stay_id" uuid,
	"folio_line_id" uuid,
	"amount_cents" bigint NOT NULL,
	"message" varchar(200),
	"paid_out_at" timestamp with time zone,
	"paid_out_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "extras" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD COLUMN "caravan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD COLUMN "leader_token" varchar(32);--> statement-breakpoint
ALTER TABLE "room_blocks" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "index_currency" varchar(8);--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "index_amount_cents" bigint;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "ready_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrity_seals" ADD CONSTRAINT "integrity_seals_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tips" ADD CONSTRAINT "staff_tips_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tips" ADD CONSTRAINT "staff_tips_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tips" ADD CONSTRAINT "staff_tips_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tips" ADD CONSTRAINT "staff_tips_folio_line_id_folio_lines_id_fk" FOREIGN KEY ("folio_line_id") REFERENCES "public"."folio_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tips" ADD CONSTRAINT "staff_tips_paid_out_by_user_id_users_id_fk" FOREIGN KEY ("paid_out_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "integrity_seals_day_uq" ON "integrity_seals" USING btree ("restaurant_id","day");--> statement-breakpoint
CREATE INDEX "staff_tips_restaurant_idx" ON "staff_tips" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "room_blocks_leader_token_uq" ON "room_blocks" USING btree ("leader_token");