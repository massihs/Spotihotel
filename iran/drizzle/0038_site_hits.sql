CREATE TABLE "site_hits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" varchar(200) NOT NULL,
	"referrer" varchar(120),
	"visitor" varchar(32) NOT NULL,
	"device" varchar(8) NOT NULL,
	"locale" varchar(8)
);
--> statement-breakpoint
CREATE INDEX "site_hits_at_idx" ON "site_hits" USING btree ("at");--> statement-breakpoint
CREATE INDEX "site_hits_path_idx" ON "site_hits" USING btree ("path","at");