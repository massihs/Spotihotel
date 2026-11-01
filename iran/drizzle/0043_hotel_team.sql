CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid,
	"place_label" varchar(48) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"label" varchar(48),
	"note" varchar(280),
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"taken_by_user_id" uuid,
	"taken_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" varchar(48) NOT NULL,
	"icon" varchar(24) NOT NULL,
	"base_job" varchar(16) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "restaurant_members" ADD COLUMN "team_job_id" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_jobs" ADD CONSTRAINT "team_jobs_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_requests_restaurant_status_idx" ON "service_requests" USING btree ("restaurant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "team_jobs_restaurant_idx" ON "team_jobs" USING btree ("restaurant_id");