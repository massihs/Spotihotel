ALTER TABLE "diners" ADD COLUMN "track_calories" boolean;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "sex" varchar(8);--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "weight_kg" real;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "height_cm" real;--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "activity" varchar(16);--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "weight_goal" varchar(12);--> statement-breakpoint
ALTER TABLE "diners" ADD COLUMN "goals_manual" boolean DEFAULT false NOT NULL;