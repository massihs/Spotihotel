ALTER TABLE "rate_days" ADD COLUMN "closed_to_arrival" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_days" ADD COLUMN "closed_to_departure" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_days" ADD COLUMN "max_stay" integer;--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "promo_code" varchar(32);--> statement-breakpoint
ALTER TABLE "stays" ADD COLUMN "discount_cents" bigint DEFAULT 0 NOT NULL;