ALTER TABLE "outlets" ADD COLUMN "room_service" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "carts" ADD COLUMN "outlet_id" uuid;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;