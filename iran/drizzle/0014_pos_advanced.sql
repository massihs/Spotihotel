CREATE TABLE "customer_account_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" varchar(12) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" varchar(16),
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "takeaway_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "delivery_price_cents" bigint;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "credit_limit_cents" bigint;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "balance_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_account_entries_customer_idx" ON "customer_account_entries" USING btree ("customer_id","created_at");