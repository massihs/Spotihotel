CREATE TABLE "support_articles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" varchar(60) NOT NULL,
	"audience" varchar(8) NOT NULL,
	"title" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"keywords" text DEFAULT '' NOT NULL,
	"href" varchar(200),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"shown" integer DEFAULT 0 NOT NULL,
	"helped" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"thread_id" uuid NOT NULL,
	"author" varchar(10) NOT NULL,
	"user_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"image_key" varchar(200),
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_threads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"channel" varchar(10) NOT NULL,
	"status" varchar(8) DEFAULT 'bot' NOT NULL,
	"requester_user_id" uuid,
	"guest_id" uuid,
	"participant_id" uuid,
	"place" varchar(48),
	"guest_name" varchar(80),
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester_read_at" timestamp with time zone,
	"agent_read_at" timestamp with time zone,
	"assignee_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_support_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."support_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_articles_audience_idx" ON "support_articles" USING btree ("audience","published");--> statement-breakpoint
CREATE INDEX "support_messages_thread_idx" ON "support_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "support_threads_restaurant_idx" ON "support_threads" USING btree ("restaurant_id","channel","last_message_at");--> statement-breakpoint
CREATE INDEX "support_threads_participant_idx" ON "support_threads" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "support_threads_channel_idx" ON "support_threads" USING btree ("channel","status","last_message_at");