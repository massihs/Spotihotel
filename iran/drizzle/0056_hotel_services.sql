CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"category" varchar(40),
	"location" varchar(80),
	"room_id" uuid,
	"serial" varchar(60),
	"interval_days" integer,
	"last_service_on" date,
	"next_service_on" date,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hk_logbook" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"room_id" uuid,
	"category" varchar(16) NOT NULL,
	"text" text NOT NULL,
	"status" varchar(8) DEFAULT 'open' NOT NULL,
	"user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internet_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"username" varchar(40) NOT NULL,
	"password" varchar(40) NOT NULL,
	"profile_id" uuid,
	"stay_id" uuid,
	"room_id" uuid,
	"guest_name" varchar(120),
	"status" varchar(12) DEFAULT 'active' NOT NULL,
	"valid_until" timestamp with time zone,
	"used_mb" integer DEFAULT 0 NOT NULL,
	"note" varchar(200),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "internet_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"down_kbps" integer DEFAULT 0 NOT NULL,
	"up_kbps" integer DEFAULT 0 NOT NULL,
	"quota_mb" integer,
	"days" integer,
	"devices" integer DEFAULT 2 NOT NULL,
	"price_cents" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"name" varchar(80) NOT NULL,
	"category" varchar(40),
	"price_cents" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_ticket_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticket_id" uuid NOT NULL,
	"item_id" uuid,
	"name" varchar(80) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cents" bigint NOT NULL,
	"amount_cents" bigint NOT NULL,
	CONSTRAINT "service_ticket_lines_qty_chk" CHECK ("service_ticket_lines"."quantity" between 1 and 999)
);
--> statement-breakpoint
CREATE TABLE "service_tickets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"kind" varchar(16) NOT NULL,
	"number" integer NOT NULL,
	"stay_id" uuid,
	"room_id" uuid,
	"guest_name" varchar(120),
	"status" varchar(16) NOT NULL,
	"express" boolean DEFAULT false NOT NULL,
	"note" text,
	"total_cents" bigint NOT NULL,
	"settlement" varchar(12) DEFAULT 'pending' NOT NULL,
	"settled_at" timestamp with time zone,
	"settled_by_user_id" uuid,
	"business_date" date NOT NULL,
	"due_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"room_id" uuid,
	"stay_id" uuid,
	"event" varchar(16) NOT NULL,
	"detail" varchar(300),
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_rooms" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"package" varchar(60),
	"message" varchar(300),
	"since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "services" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hk_logbook" ADD CONSTRAINT "hk_logbook_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hk_logbook" ADD CONSTRAINT "hk_logbook_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hk_logbook" ADD CONSTRAINT "hk_logbook_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_accounts" ADD CONSTRAINT "internet_accounts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_accounts" ADD CONSTRAINT "internet_accounts_profile_id_internet_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."internet_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_accounts" ADD CONSTRAINT "internet_accounts_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_accounts" ADD CONSTRAINT "internet_accounts_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_accounts" ADD CONSTRAINT "internet_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internet_profiles" ADD CONSTRAINT "internet_profiles_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_ticket_id_service_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."service_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_ticket_lines" ADD CONSTRAINT "service_ticket_lines_item_id_service_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."service_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_settled_by_user_id_users_id_fk" FOREIGN KEY ("settled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_tickets" ADD CONSTRAINT "service_tickets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_events" ADD CONSTRAINT "tv_events_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_events" ADD CONSTRAINT "tv_events_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_events" ADD CONSTRAINT "tv_events_stay_id_stays_id_fk" FOREIGN KEY ("stay_id") REFERENCES "public"."stays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_events" ADD CONSTRAINT "tv_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_rooms" ADD CONSTRAINT "tv_rooms_room_id_dining_tables_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."dining_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tv_rooms" ADD CONSTRAINT "tv_rooms_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_restaurant_next_idx" ON "equipment" USING btree ("restaurant_id","next_service_on");--> statement-breakpoint
CREATE INDEX "hk_logbook_restaurant_day_idx" ON "hk_logbook" USING btree ("restaurant_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "internet_accounts_username_uq" ON "internet_accounts" USING btree ("restaurant_id","username");--> statement-breakpoint
CREATE INDEX "internet_accounts_stay_idx" ON "internet_accounts" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "internet_profiles_restaurant_idx" ON "internet_profiles" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "service_items_restaurant_kind_idx" ON "service_items" USING btree ("restaurant_id","kind","sort_order");--> statement-breakpoint
CREATE INDEX "service_ticket_lines_ticket_idx" ON "service_ticket_lines" USING btree ("ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_tickets_number_uq" ON "service_tickets" USING btree ("restaurant_id","kind","number");--> statement-breakpoint
CREATE INDEX "service_tickets_day_idx" ON "service_tickets" USING btree ("restaurant_id","kind","business_date");--> statement-breakpoint
CREATE INDEX "service_tickets_stay_idx" ON "service_tickets" USING btree ("stay_id");--> statement-breakpoint
CREATE INDEX "tv_events_restaurant_time_idx" ON "tv_events" USING btree ("restaurant_id","created_at");