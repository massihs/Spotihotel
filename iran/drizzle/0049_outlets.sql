CREATE TABLE "outlets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" varchar(16) DEFAULT 'restaurant' NOT NULL,
	"location" varchar(80),
	"hours" varchar(40),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "outlet_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "outlet_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "outlet_id" uuid;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outlets_restaurant_idx" ON "outlets" USING btree ("restaurant_id","sort_order");--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;