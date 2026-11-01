CREATE TABLE "music_now_playing" (
	"restaurant_id" uuid PRIMARY KEY NOT NULL,
	"track_id" uuid,
	"is_playing" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "music_themes" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "music_now_playing" ADD CONSTRAINT "music_now_playing_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_now_playing" ADD CONSTRAINT "music_now_playing_track_id_music_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."music_tracks"("id") ON DELETE set null ON UPDATE no action;