CREATE TABLE "maintenance_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"room_id" uuid,
	"place" varchar(80),
	"title" varchar(160) NOT NULL,
	"description" varchar(2000),
	"priority" varchar(8) DEFAULT 'normal' NOT NULL,
	"status" varchar(12) DEFAULT 'open' NOT NULL,
	"out_of_order" boolean DEFAULT false NOT NULL,
	"out_from" date,
	"out_until" date,
	"assigned_to_user_id" uuid,
	"created_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "housekeeper_user_id" uuid;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "housekeeper_on" date;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_restaurant_status_idx" ON "maintenance_tickets" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE INDEX "maintenance_room_idx" ON "maintenance_tickets" USING btree ("room_id");