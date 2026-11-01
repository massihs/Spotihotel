import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { counters, invoices, products, restaurantSettings, restaurants } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { enterTableByQr, loadGuestContext, type GuestContext } from "@/server/modules/guest/sessions";
import { addToCart } from "@/server/modules/cart/service";
import { placeOrder } from "@/server/modules/orders/service";
import { newIdempotencyKey, recordStaffPayment, refundPayment } from "@/server/modules/payments/service";
import {
  getInvoiceByToken,
  invoiceNumber,
  issueInvoiceAsGuest,
  issueInvoiceAsStaff,
  listInvoices,
} from "@/server/modules/invoices/service";
import { renderInvoicePdf } from "@/server/modules/invoices/pdf";
import { jalaliYear } from "@/lib/jalali";
import { addMember, contextFor, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const toman = (t: number) => t * 1000;

async function setup() {
  const owner = await createOwnerWithRestaurant("رستوران فاکتور", { plan: "professional" });
  await db
    .update(restaurants)
    .set({
      addressLine1: "خیابان ولیعصر، پلاک ۱۲",
      city: "تهران",
      postalCode: "1234567890",
      phone: "+98 21 1234 5678",
    })
    .where(eq(restaurants.id, owner.restaurant.id));
  await db
    .update(restaurantSettings)
    .set({
      legalName: "شرکت رستوران نمونه",
      legalId: "14001234567",
      vatNumber: "411111111111",
      registrationNumber: "123456",
      legalNotice: "از انتخاب شما سپاسگزاریم.",
    })
    .where(eq(restaurantSettings.restaurantId, owner.restaurant.id));
  const table = await createTable(db, owner.ctx, { label: "۵" });
  const cat = await createCategory(db, owner.ctx, { name: "کباب" });
  const kabab = await createProduct(db, owner.ctx, {
    categoryId: cat.id,
    name: "چلوکباب کوبیده",
    priceCents: toman(450_000),
  });
  const doogh = await createProduct(db, owner.ctx, {
    categoryId: cat.id,
    name: "دوغ محلی",
    priceCents: toman(60_000),
  });
  return { owner, table, kabab, doogh };
}

async function seat(qrToken: string): Promise<GuestContext> {
  const guestId = randomUUID();
  const e = await enterTableByQr(db, qrToken, guestId);
  return (await loadGuestContext(db, guestId, e!.participant.id))!;
}

async function paidByCash(owner: Awaited<ReturnType<typeof setup>>["owner"], g: GuestContext) {
  return recordStaffPayment(db, owner.ctx, {
    tableSessionId: g.session.id,
    participantId: g.participant.id,
    provider: "cash",
    idempotencyKey: newIdempotencyKey(),
  });
}

describe("Iranian invoices", () => {
  it("issues a numbered, frozen invoice whose total equals the payment", async () => {
    const { owner, table, kabab, doogh } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: kabab.id, optionValueIds: [], quantity: 2 });
    await addToCart(db, g, { productId: doogh.id, optionValueIds: [], quantity: 2 });
    await placeOrder(db, g);
    const payment = await paidByCash(owner, g);

    const inv = await issueInvoiceAsStaff(db, owner.ctx, payment.id, {
      name: "شرکت خریدار",
      nationalId: "10101010101",
      economicCode: "411222333444",
    });
    const year = jalaliYear(new Date());
    expect(inv.number).toBe(invoiceNumber(year, 1));
    expect(inv.number).toMatch(/^14\d\d-000001$/);
    expect(inv.totalCents).toBe(payment.amountCents);
    expect(inv.snapshot).toMatchObject({
      version: 2,
      seller: { name: "شرکت رستوران نمونه", nationalId: "14001234567", economicCode: "411111111111" },
      buyer: { name: "شرکت خریدار" },
      tableLabel: "۵",
      totalCents: toman(1_020_000),
      payments: [{ provider: "cash", amountCents: toman(1_020_000) }],
    });
    // 10 % VAT included: 1,020,000 tomans → 92,727.27… tomans of tax, kept exact in rial minor units.
    expect(inv.snapshot.taxes).toEqual([{ rateBps: 1000, baseCents: 927_272_727, taxCents: 92_727_273 }]);
    expect(inv.taxCents).toBe(92_727_273);

    // Same payment again (double tap / guest asks too): same invoice, same number.
    expect((await issueInvoiceAsStaff(db, owner.ctx, payment.id)).id).toBe(inv.id);
    expect((await issueInvoiceAsGuest(db, g, payment.id)).id).toBe(inv.id);

    // Later menu changes never alter an issued invoice.
    await db
      .update(products)
      .set({ name: "کوبیده ویژه", priceCents: toman(999_000) })
      .where(eq(products.id, kabab.id));
    const again = await getInvoiceByToken(db, inv.publicToken);
    expect(again!.invoice.snapshot.lines[0]).toMatchObject({
      name: "چلوکباب کوبیده",
      unitPriceCents: toman(450_000),
    });

    const pdf = await renderInvoicePdf({
      number: inv.number,
      issuedAt: inv.issuedAt,
      timezone: "Asia/Tehran",
      snapshot: inv.snapshot,
      publicUrl: `http://localhost:3000/invoice/${inv.publicToken}`,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.INVOICE_PDF_OUT) writeFileSync(process.env.INVOICE_PDF_OUT, pdf);
  });

  it("numbers gap-free per restaurant and restarts with the Jalali year", async () => {
    const { owner, table, doogh } = await setup();
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const g = await seat(table.qrToken);
      await addToCart(db, g, { productId: doogh.id, optionValueIds: [], quantity: 1 });
      await placeOrder(db, g);
      numbers.push((await issueInvoiceAsStaff(db, owner.ctx, (await paidByCash(owner, g)).id)).number);
    }
    const y = jalaliYear(new Date());
    expect(numbers).toEqual([invoiceNumber(y, 1), invoiceNumber(y, 2), invoiceNumber(y, 3)]);
    const [c] = await db.select().from(counters).where(eq(counters.restaurantId, owner.restaurant.id));
    expect(c).toBeTruthy();
    // Another restaurant has its own sequence.
    const other = await setup();
    const g = await seat(other.table.qrToken);
    await addToCart(db, g, { productId: other.doogh.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, g);
    const inv = await issueInvoiceAsStaff(db, other.owner.ctx, (await paidByCash(other.owner, g)).id);
    expect(inv.number).toBe(invoiceNumber(y, 1));
  });

  it("concurrent requests for the same payment produce a single invoice", async () => {
    const { owner, table, doogh } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: doogh.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, g);
    const p = await paidByCash(owner, g);
    const results = await Promise.all([
      issueInvoiceAsStaff(db, owner.ctx, p.id),
      issueInvoiceAsGuest(db, g, p.id),
      issueInvoiceAsStaff(db, owner.ctx, p.id),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await db.select().from(invoices).where(eq(invoices.paymentId, p.id))).toHaveLength(1);
  });

  it("guests only get their own invoices; tenants are isolated; staff cash sales are invoiced at once", async () => {
    const { owner, table, doogh } = await setup();
    const a = await seat(table.qrToken);
    const b = await seat(table.qrToken);
    await addToCart(db, a, { productId: doogh.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, a);
    const pa = await paidByCash(owner, a);
    await expect(issueInvoiceAsGuest(db, b, pa.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const intruder = await createOwnerWithRestaurant("دیگری");
    await expect(issueInvoiceAsStaff(db, intruder.ctx, pa.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listInvoices(db, intruder.ctx)).toEqual([]);

    // Cash collected by the staff: invoiced at once; a later refund keeps that invoice.
    const issued = (await listInvoices(db, owner.ctx)).find((i) => i.paymentId === pa.id);
    expect(issued).toBeDefined();
    await refundPayment(db, owner.ctx, pa.id, { amountCents: pa.amountCents });
    expect((await issueInvoiceAsStaff(db, owner.ctx, pa.id)).number).toBe(issued!.number);
  });

  it("staff can issue invoices; buyer details are validated", async () => {
    const { owner, table, doogh } = await setup();
    const g = await seat(table.qrToken);
    await addToCart(db, g, { productId: doogh.id, optionValueIds: [], quantity: 1 });
    await placeOrder(db, g);
    const p = await paidByCash(owner, g);
    const s = await createUser();
    await addMember(owner.restaurant.id, s.user.id, "staff");
    const staff = await contextFor(s.sessionUser, owner.restaurant.id);
    await expect(issueInvoiceAsStaff(db, staff, p.id, { name: "X", postalCode: "123" })).rejects.toThrow();
    const inv = await issueInvoiceAsStaff(db, staff, p.id, { name: "علی", nationalId: "۰۰۱۲۳۴۵۶۷۸" });
    expect(inv.snapshot.buyer).toMatchObject({ name: "علی", nationalId: "۰۰۱۲۳۴۵۶۷۸" });
    expect(await getInvoiceByToken(db, "not-a-token")).toBeNull();
  });
});
