CREATE TABLE "cheque_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"cheque_id" uuid NOT NULL,
	"status" varchar(10) NOT NULL,
	"day" date NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cheques" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"direction" varchar(8) NOT NULL,
	"sayad_id" varchar(16),
	"number" varchar(32),
	"bank" varchar(80),
	"party" varchar(160) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"due_date" date NOT NULL,
	"status" varchar(10) NOT NULL,
	"folio_line_id" uuid,
	"supplier_id" uuid,
	"note" varchar(300),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cheques_amount_chk" CHECK ("cheques"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "pricing_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"room_type_id" uuid,
	"min_occupancy_pct" integer DEFAULT 0 NOT NULL,
	"within_days" integer,
	"adjust_bps" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_rules_chk" CHECK ("pricing_rules"."min_occupancy_pct" between 0 and 100 and "pricing_rules"."adjust_bps" between -9000 and 50000)
);
--> statement-breakpoint
CREATE TABLE "room_block_days" (
	"block_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rooms" integer NOT NULL,
	CONSTRAINT "room_block_days_block_id_room_type_id_day_pk" PRIMARY KEY("block_id","room_type_id","day"),
	CONSTRAINT "room_block_days_rooms_chk" CHECK ("room_block_days"."rooms" between 0 and 1000)
);
--> statement-breakpoint
CREATE TABLE "room_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"account_id" uuid,
	"contact_name" varchar(120),
	"contact_phone" varchar(24),
	"status" varchar(10) DEFAULT 'definite' NOT NULL,
	"arrival" date NOT NULL,
	"departure" date NOT NULL,
	"release_date" date NOT NULL,
	"rate_plan_id" uuid,
	"rate_cents" bigint,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_blocks_dates_chk" CHECK ("room_blocks"."departure" > "room_blocks"."arrival" and "room_blocks"."release_date" <= "room_blocks"."arrival")
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"method" varchar(10) NOT NULL,
	"cheque_id" uuid,
	"paid_on" date NOT NULL,
	"reference" varchar(64),
	"note" varchar(300),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_amount_chk" CHECK ("supplier_payments"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "channel_commissions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "charge_no_shows" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "next_block_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "room_types" ADD COLUMN "overbook_limit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "block_id" uuid;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "precheckin_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "precheckin_signature" varchar(120);--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheque_events" ADD CONSTRAINT "cheque_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_folio_line_id_folio_lines_id_fk" FOREIGN KEY ("folio_line_id") REFERENCES "public"."folio_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block_days" ADD CONSTRAINT "room_block_days_block_id_room_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."room_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block_days" ADD CONSTRAINT "room_block_days_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_block_days" ADD CONSTRAINT "room_block_days_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_account_id_hotel_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."hotel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_blocks" ADD CONSTRAINT "room_blocks_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cheque_id_cheques_id_fk" FOREIGN KEY ("cheque_id") REFERENCES "public"."cheques"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cheque_events_cheque_idx" ON "cheque_events" USING btree ("cheque_id");--> statement-breakpoint
CREATE INDEX "cheques_due_idx" ON "cheques" USING btree ("restaurant_id","direction","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cheques_sayad_uq" ON "cheques" USING btree ("restaurant_id","direction","sayad_id") WHERE "cheques"."sayad_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pricing_rules_restaurant_idx" ON "pricing_rules" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "room_block_days_type_day_idx" ON "room_block_days" USING btree ("restaurant_id","room_type_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "room_blocks_number_uq" ON "room_blocks" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE INDEX "room_blocks_dates_idx" ON "room_blocks" USING btree ("restaurant_id","arrival","departure");--> statement-breakpoint
CREATE INDEX "supplier_payments_idx" ON "supplier_payments" USING btree ("restaurant_id","supplier_id","paid_on");