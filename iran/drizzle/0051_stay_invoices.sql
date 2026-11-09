ALTER TABLE "invoices" ADD COLUMN "folio_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_folio_id_folios_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_folio_uq" ON "invoices" USING btree ("folio_id") WHERE "invoices"."folio_id" IS NOT NULL;