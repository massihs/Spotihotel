CREATE TABLE "folio_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"folio_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"kind" varchar(12) NOT NULL,
	"department" varchar(16) NOT NULL,
	"description" varchar(200) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	"tax_rate_bps" integer DEFAULT 0 NOT NULL,
	"tax_cents" bigint DEFAULT 0 NOT NULL,
	"method" varchar(16),
	"reference" varchar(64),
	"source_type" varchar(16) DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" varchar(200),
	"voided_by_user_id" uuid,
	"posted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folio_lines_qty_chk" CHECK ("folio_lines"."quantity" between 1 and 999)
);
--> statement-breakpoint
CREATE TABLE "folios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"stay_id" uuid,
	"account_id" uuid,
	"guest_id" uuid,
	"label" varchar(80),
	"status" varchar(8) DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(8) DEFAULT 'company' NOT NULL,
	"name" varchar(160) NOT NULL,
	"tax_id" varchar(40),
	"email" varchar(320),
	"phone" varchar(24),
	"address" text,
	"credit_limit_cents" bigint DEFAULT 0 NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_guests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"first_name" varchar(80) DEFAULT '' NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"email" varchar(320),
	"phone" varchar(24),
	"nationality" varchar(2),
	"document_type" varchar(16),
	"document_number" varchar(40),
	"birth_date" date,
	"address" text,
	"company" varchar(120),
	"vip" boolean DEFAULT false NOT NULL,
	"preferences" text,
	"notes" text,
	"blacklisted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hotel_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(12) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"opens_at" varchar(5) DEFAULT '08:00' NOT NULL,
	"closes_at" varchar(5) DEFAULT '21:00' NOT NULL,
	"slot_step_min" integer DEFAULT 30 NOT NULL,
	"guest_bookable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "hotel_services_chk" CHECK ("hotel_services"."capacity" between 1 and 500 and "hotel_services"."duration_min" between 5 and 600)
);
--> statement-breakpoint
CREATE TABLE "minibar_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"price_cents" bigint NOT NULL,
	"par_qty" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "night_audits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"rooms_available" integer NOT NULL,
	"rooms_sold" integer NOT NULL,
	"guests" integer NOT NULL,
	"room_revenue_cents" bigint NOT NULL,
	"total_revenue_cents" bigint NOT NULL,
	"payments_cents" bigint NOT NULL,
	"no_shows" integer DEFAULT 0 NOT NULL,
	"revenue" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_settings" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"check_in_time" varchar(5) DEFAULT '14:00' NOT NULL,
	"check_out_time" varchar(5) DEFAULT '12:00' NOT NULL,
	"business_date" date,
	"room_tax_bps" integer DEFAULT 0 NOT NULL,
	"service_tax_bps" integer DEFAULT 0 NOT NULL,
	"city_tax_cents" bigint DEFAULT 0 NOT NULL,
	"auto_charge_room_service" boolean DEFAULT true NOT NULL,
	"minibar_self_service" boolean DEFAULT true NOT NULL,
	"wifi_name" varchar(64),
	"wifi_password" varchar(64),
	"guest_info" text,
	"next_stay_number" integer DEFAULT 1001 NOT NULL,
	"next_folio_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_days" (
	"restaurant_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rate_cents" bigint,
	"closed" boolean DEFAULT false NOT NULL,
	"min_stay" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_days_room_type_id_day_pk" PRIMARY KEY("room_type_id","day")
);
--> statement-breakpoint
CREATE TABLE "rate_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(80) NOT NULL,
	"meal_plan" varchar(2) DEFAULT 'RO' NOT NULL,
	"adjust_bps" integer DEFAULT 0 NOT NULL,
	"adjust_cents" bigint DEFAULT 0 NOT NULL,
	"refundable" boolean DEFAULT true NOT NULL,
	"cancel_hours" integer DEFAULT 24 NOT NULL,
	"min_stay" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"base_occupancy" integer DEFAULT 2 NOT NULL,
	"max_occupancy" integer DEFAULT 2 NOT NULL,
	"base_rate_cents" bigint NOT NULL,
	"extra_adult_cents" bigint DEFAULT 0 NOT NULL,
	"amenities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "room_types_occupancy_chk" CHECK ("room_types"."base_occupancy" between 1 and "room_types"."max_occupancy"),
	CONSTRAINT "room_types_rate_chk" CHECK ("room_types"."base_rate_cents" >= 0 and "room_types"."extra_adult_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"stay_id" uuid,
	"room_label" varchar(48),
	"guest_name" varchar(120) NOT NULL,
	"phone" varchar(24),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"people" integer DEFAULT 1 NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"status" varchar(10) DEFAULT 'booked' NOT NULL,
	"source" varchar(8) DEFAULT 'staff' NOT NULL,
	"staff_name" varchar(80),
	"note" varchar(300),
	"folio_line_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_bookings_people_chk" CHECK ("service_bookings"."people" between 1 and 50),
	CONSTRAINT "service_bookings_time_chk" CHECK ("service_bookings"."ends_at" > "service_bookings"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "stay_nights" (
	"stay_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"day" date NOT NULL,
	"rate_cents" bigint NOT NULL,
	"posted_at" timestamp with time zone,
	CONSTRAINT "stay_nights_stay_id_day_pk" PRIMARY KEY("stay_id","day")
);
--> statement-breakpoint
CREATE TABLE "stays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"code" varchar(16) NOT NULL,
	"status" varchar(12) DEFAULT 'confirmed' NOT NULL,
	"room_type_id" uuid NOT NULL,
	"room_id" uuid,
	"rate_plan_id" uuid,
	"arrival" date NOT NULL,
	"departure" date NOT NULL,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"guest_id" uuid NOT NULL,
	"account_id" uuid,
	"source" varchar(16) DEFAULT 'direct' NOT NULL,
	"channel_ref" varchar(64),
	"eta" varchar(5),
	"guarantee" varchar(8) DEFAULT 'none' NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" varchar(200),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stays_dates_chk" CHECK ("stays"."departure" > "stays"."arrival"),
	CONSTRAINT "stays_people_chk" CHECK ("stays"."adults" between 1 and 20 and "stays"."children" between 0 and 20)
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"memo" varchar(240) NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_id" uuid,
	"reversal_of_id" uuid,
	"posted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_cents" bigint DEFAULT 0 NOT NULL,
	"credit_cents" bigint DEFAULT 0 NOT NULL,
	"department" varchar(16),
	"description" varchar(200),
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_lines_side_chk" CHECK ("journal_lines"."debit_cents" >= 0 and "journal_lines"."credit_cents" >= 0 and ("journal_lines"."debit_cents" = 0) <> ("journal_lines"."credit_cents" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"name" varchar(120) NOT NULL,
	"type" varchar(10) NOT NULL,
	"system_key" varchar(32),
	"reconcilable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_type_chk" CHECK ("ledger_accounts"."type" in ('asset','liability','equity','revenue','expense'))
);
--> statement-breakpoint
CREATE TABLE "ledger_budgets" (
	"restaurant_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_budgets_account_id_month_pk" PRIMARY KEY("account_id","month")
);
--> statement-breakpoint
CREATE TABLE "ledger_settings" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"locked_until" date,
	"next_entry_number" integer DEFAULT 1 NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "room_type_id" uuid;--> statement-breakpoint
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_lines" ADD CONSTRAINT "folio_lines_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_account_id_hotel_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."hotel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folios" ADD CONSTRAINT "folios_guest_id_hotel_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."hotel_guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_accounts" ADD CONSTRAINT "hotel_accounts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_guests" ADD CONSTRAINT "hotel_guests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hotel_services" ADD CONSTRAINT "hotel_services_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minibar_items" ADD CONSTRAINT "minibar_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_audits" ADD CONSTRAINT "night_audits_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "night_audits" ADD CONSTRAINT "night_audits_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_settings" ADD CONSTRAINT "pms_settings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_days" ADD CONSTRAINT "rate_days_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_days" ADD CONSTRAINT "rate_days_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plans" ADD CONSTRAINT "rate_plans_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_service_id_hotel_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."hotel_services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_folio_line_id_folio_lines_id_fk" FOREIGN KEY ("folio_line_id") REFERENCES "public"."folio_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_bookings" ADD CONSTRAINT "service_bookings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_nights" ADD CONSTRAINT "stay_nights_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_nights" ADD CONSTRAINT "stay_nights_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_rate_plan_id_rate_plans_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_guest_id_hotel_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."hotel_guests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_account_id_hotel_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."hotel_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stays" ADD CONSTRAINT "stays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_budgets" ADD CONSTRAINT "ledger_budgets_account_id_ledger_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_settings" ADD CONSTRAINT "ledger_settings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folio_lines_folio_idx" ON "folio_lines" USING btree ("folio_id","created_at");--> statement-breakpoint
CREATE INDEX "folio_lines_restaurant_date_idx" ON "folio_lines" USING btree ("restaurant_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "folio_lines_source_uq" ON "folio_lines" USING btree ("restaurant_id","source_type","source_id") WHERE "folio_lines"."source_id" IS NOT NULL AND "folio_lines"."voided_at" IS NULL AND "folio_lines"."kind" = 'charge';--> statement-breakpoint
CREATE UNIQUE INDEX "folios_number_uq" ON "folios" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE INDEX "folios_stay_idx" ON "folios" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "folios_account_idx" ON "folios" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "hotel_accounts_restaurant_idx" ON "hotel_accounts" USING btree ("restaurant_id","name");--> statement-breakpoint
CREATE INDEX "hotel_guests_name_idx" ON "hotel_guests" USING btree ("restaurant_id",lower("last_name"));--> statement-breakpoint
CREATE INDEX "hotel_guests_phone_idx" ON "hotel_guests" USING btree ("restaurant_id","phone");--> statement-breakpoint
CREATE INDEX "hotel_services_restaurant_idx" ON "hotel_services" USING btree ("restaurant_id","sort_order");--> statement-breakpoint
CREATE INDEX "minibar_items_restaurant_idx" ON "minibar_items" USING btree ("restaurant_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "night_audits_day_uq" ON "night_audits" USING btree ("restaurant_id","business_date");--> statement-breakpoint
CREATE INDEX "rate_days_restaurant_day_idx" ON "rate_days" USING btree ("restaurant_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_plans_code_uq" ON "rate_plans" USING btree ("restaurant_id",lower("code")) WHERE "rate_plans"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "room_types_code_uq" ON "room_types" USING btree ("restaurant_id",lower("code")) WHERE "room_types"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_bookings_service_time_idx" ON "service_bookings" USING btree ("service_id","starts_at");--> statement-breakpoint
CREATE INDEX "service_bookings_restaurant_time_idx" ON "service_bookings" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX "service_bookings_stay_idx" ON "service_bookings" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "stay_nights_restaurant_day_idx" ON "stay_nights" USING btree ("restaurant_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "stays_number_uq" ON "stays" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "stays_code_uq" ON "stays" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stays_restaurant_dates_idx" ON "stays" USING btree ("restaurant_id","arrival","departure");--> statement-breakpoint
CREATE INDEX "stays_room_idx" ON "stays" USING btree ("room_id","arrival");--> statement-breakpoint
CREATE INDEX "stays_guest_idx" ON "stays" USING btree ("guest_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_number_uq" ON "journal_entries" USING btree ("restaurant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_uq" ON "journal_entries" USING btree ("restaurant_id","source_type","source_id") WHERE "journal_entries"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("restaurant_id","date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("restaurant_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_code_uq" ON "ledger_accounts" USING btree ("restaurant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_system_uq" ON "ledger_accounts" USING btree ("restaurant_id","system_key") WHERE "ledger_accounts"."system_key" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_room_type_id_room_types_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_types"("id") ON DELETE set null ON UPDATE no action;