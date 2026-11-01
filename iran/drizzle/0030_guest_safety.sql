CREATE TABLE "guest_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"table_label" varchar(50),
	"order_number" varchar(32),
	"reason" varchar(200),
	"blocked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "guest_orders_need_staff" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD COLUMN "confirmed_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "guest_blocks" ADD CONSTRAINT "guest_blocks_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_blocks" ADD CONSTRAINT "guest_blocks_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_blocks" ADD CONSTRAINT "guest_blocks_blocked_by_user_id_users_id_fk" FOREIGN KEY ("blocked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_blocks_restaurant_guest_uq" ON "guest_blocks" USING btree ("restaurant_id","guest_id");