CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(8) DEFAULT 'booking' NOT NULL,
	"code" varchar(16) NOT NULL,
	"queue_number" integer,
	"name" varchar(120) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"party_size" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 90 NOT NULL,
	"area" varchar(16) DEFAULT 'any' NOT NULL,
	"table_id" uuid,
	"status" varchar(12) DEFAULT 'confirmed' NOT NULL,
	"source" varchar(12) DEFAULT 'phone' NOT NULL,
	"note" text,
	"customer_id" uuid,
	"reminder_sent_at" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_party_chk" CHECK ("reservations"."party_size" between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "reservations_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "reservation_auto_confirm" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "reservation_slot_capacity" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "reservation_max_party" integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "reservation_duration_min" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_code_uq" ON "reservations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "reservations_restaurant_time_idx" ON "reservations" USING btree ("restaurant_id","starts_at");