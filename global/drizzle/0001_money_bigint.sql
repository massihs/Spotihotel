ALTER TABLE "plans" ALTER COLUMN "price_monthly_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "option_values" ALTER COLUMN "price_delta_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "price_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "compare_at_price_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "total_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "tax_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_price_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "options_total_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "line_total_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "tax_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "subtotal_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "discount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "tax_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payment_allocations" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "refunded_cents" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "amount_cents" SET DATA TYPE bigint;