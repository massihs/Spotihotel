import { connection } from "next/server";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { getInvoiceByToken } from "@/server/modules/invoices/service";
import { renderInvoicePdf } from "@/server/modules/invoices/pdf";

/**
 * GET /api/v1/invoices/{publicToken}/pdf — the invoice as a PDF (Persian, A4).
 * Access is granted by the unguessable token (shared with the guest), like the invoice page.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/invoices/[token]/pdf">) {
  await connection();
  const { token } = await params;
  const row = await getInvoiceByToken(db, token);
  if (!row) return new Response("Not found", { status: 404 });
  const { invoice, timezone } = row;
  const pdf = await renderInvoicePdf({
    number: invoice.number,
    issuedAt: invoice.issuedAt,
    timezone,
    snapshot: invoice.snapshot,
    publicUrl: new URL(`/invoice/${invoice.publicToken}`, env().APP_URL).toString(),
  });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${invoice.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
