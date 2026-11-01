CREATE TABLE "diner_otps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diner_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"diner_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"phone" varchar(20),
	"phone_verified_at" timestamp with time zone,
	"email" varchar(320),
	"password_hash" text,
	"name" varchar(80),
	"locale" varchar(8),
	"timezone" varchar(64) DEFAULT 'Asia/Tehran' NOT NULL,
	"goals" jsonb,
	"history_since" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "nutrition_source" varchar(12);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "nutrition" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "diner_id" uuid;--> statement-breakpoint
ALTER TABLE "diner_sessions" ADD CONSTRAINT "diner_sessions_diner_id_diners_id_fk" FOREIGN KEY ("diner_id") REFERENCES "public"."diners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "diner_otps_phone_idx" ON "diner_otps" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "diner_sessions_token_uq" ON "diner_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "diner_sessions_diner_idx" ON "diner_sessions" USING btree ("diner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diners_phone_uq" ON "diners" USING btree ("phone") WHERE "diners"."phone" is not null and "diners"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "diners_email_uq" ON "diners" USING btree ("email") WHERE "diners"."email" is not null and "diners"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "orders_diner_placed_idx" ON "orders" USING btree ("diner_id","placed_at");