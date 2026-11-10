CREATE TABLE "desk_shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opening_float_cents" bigint DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone,
	"expected" jsonb,
	"expected_foreign" jsonb,
	"counted_cash_cents" bigint,
	"counted_foreign" jsonb,
	"handed_to_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "folio_lines" ADD COLUMN "currency" varchar(3);--> statement-breakpoint
ALTER TABLE "folio_lines" ADD COLUMN "foreign_cents" bigint;--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "currencies" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pms_settings" ADD COLUMN "desk_float_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "desk_shifts" ADD CONSTRAINT "desk_shifts_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_shifts" ADD CONSTRAINT "desk_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_shifts" ADD CONSTRAINT "desk_shifts_handed_to_user_id_users_id_fk" FOREIGN KEY ("handed_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desk_shifts_restaurant_idx" ON "desk_shifts" USING btree ("restaurant_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "desk_shifts_one_open_uq" ON "desk_shifts" USING btree ("restaurant_id","user_id") WHERE "desk_shifts"."closed_at" IS NULL;