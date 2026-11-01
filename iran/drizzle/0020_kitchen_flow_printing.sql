CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"printer_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"leased_until" timestamp with time zone,
	"error" text,
	"printed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"host" varchar(120) NOT NULL,
	"port" integer DEFAULT 9100 NOT NULL,
	"paper_mm" integer DEFAULT 80 NOT NULL,
	"target" varchar(12) DEFAULT 'station' NOT NULL,
	"station_id" uuid,
	"copies" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "printers_copies_chk" CHECK ("printers"."copies" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD COLUMN "job" varchar(16);--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "cashier_acceptance" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "print_agent_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "print_agent_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "print_jobs_queue_idx" ON "print_jobs" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "printers_restaurant_idx" ON "printers" USING btree ("restaurant_id");