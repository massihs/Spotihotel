ALTER TABLE "dining_tables" ADD COLUMN "housekeeping" varchar(16) DEFAULT 'clean' NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "housekeeping_at" timestamp with time zone;