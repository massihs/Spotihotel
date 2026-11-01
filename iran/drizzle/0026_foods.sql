CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" varchar(24) NOT NULL,
	"source_ref" varchar(64) NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text,
	"name_fa" text,
	"aliases" text DEFAULT '' NOT NULL,
	"category" varchar(120),
	"per100g" jsonb NOT NULL,
	"portion_g" real,
	"per_portion" jsonb,
	"is_recipe" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_ref_uq" ON "foods" USING btree ("source","source_ref");