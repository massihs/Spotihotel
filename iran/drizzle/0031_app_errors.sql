CREATE TABLE "app_errors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"message" varchar(500) NOT NULL,
	"route" varchar(300) NOT NULL,
	"method" varchar(10),
	"kind" varchar(16),
	"digest" varchar(64),
	"stack" text,
	"count" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL,
	"alerted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "app_errors_fingerprint_uq" ON "app_errors" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "app_errors_last_idx" ON "app_errors" USING btree ("last_at");