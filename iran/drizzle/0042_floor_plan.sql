ALTER TABLE "dining_tables" ADD COLUMN "pos_x" integer;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "pos_y" integer;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "shape" varchar(8) DEFAULT 'square' NOT NULL;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "occasion" varchar(16);