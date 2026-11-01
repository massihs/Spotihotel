CREATE TABLE "feedback_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"token" varchar(32) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"rating" integer,
	"comment" text,
	"answered_at" timestamp with time zone,
	"prize_label" varchar(60),
	"coupon_code" varchar(32),
	"spun_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_requests_rating_chk" CHECK ("feedback_requests"."rating" IS NULL OR "feedback_requests"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "feedback_sms_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "feedback_delay_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "wheel_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_settings" ADD COLUMN "wheel_prizes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_requests_order_uq" ON "feedback_requests" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_requests_token_uq" ON "feedback_requests" USING btree ("token");--> statement-breakpoint
CREATE INDEX "feedback_requests_due_idx" ON "feedback_requests" USING btree ("due_at") WHERE "feedback_requests"."sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX "feedback_requests_restaurant_idx" ON "feedback_requests" USING btree ("restaurant_id","answered_at");