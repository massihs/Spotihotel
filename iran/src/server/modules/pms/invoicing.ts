import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/server/db/client";
import {
  diningTables,
  folioLines,
  folios,
  hotelAccounts,
  hotelGuests,
  invoices,
  restaurantSettings,
  restaurants,
  stays,
  type InvoiceParty,
  type InvoiceSnapshot,
} from "@/server/db/schema";
import { recordAudit } from "@/server/audit";
import { conflict, notFound } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { isUuid, randomToken } from "@/lib/ids";
import { jalaliYear } from "@/lib/jalali";
import { toJalali } from "@/lib/jalali-calendar";
import { taxFromGross, taxFromNet } from "@/lib/money";
import {
  buyerSchema,
  invoiceNumber,
  nextInvoiceSeq,
  type BuyerInput,
} from "@/server/modules/invoices/service";

/**
 * The official invoice (فاکتور رسمی) of a hotel stay, issued from one of its folios once it is
 * settled: same gap-free yearly numbering as every other sale of the hotel, seller and buyer
 * identified (national id, economic code) and VAT per rate, so it can be sent to the tax system
 * (سامانه مودیان). One invoice per folio: issuing again returns it.
 */
export async function issueStayInvoice(
  db: Database,
  ctx: RestaurantContext,
  folioId: string,
  rawBuyer?: BuyerInput | null,
) {
  assertCan(ctx, "frontdesk.manage");
  if (!isUuid(folioId)) throw notFound();
  const rid = ctx.restaurant.id;
  const named = rawBuyer ? (buyerSchema.parse(rawBuyer) as InvoiceParty) : null;
  return db.transaction(async (tx) => {
    const [folio] = await tx
      .select()
      .from(folios)
      .where(and(eq(folios.id, folioId), eq(folios.restaurantId, rid)))
      .for("update");
    if (!folio) throw notFound();
    const [existing] = await tx.select().from(invoices).where(eq(invoices.folioId, folio.id));
    if (existing) {
      // Issued to the guest, then asked in a company's name: same number, buyer replaced.
      if (named) {
        const [renamed] = await tx
          .update(invoices)
          .set({ snapshot: { ...existing.snapshot, buyer: named } })
          .where(eq(invoices.id, existing.id))
          .returning();
        return renamed!;
      }
      return existing;
    }

    const lines = await tx
      .select()
      .from(folioLines)
      .where(and(eq(folioLines.folioId, folio.id), isNull(folioLines.voidedAt)))
      .orderBy(asc(folioLines.businessDate), asc(folioLines.createdAt));
    const charges = lines.filter((l) => l.kind === "charge" || l.kind === "adjustment");
    const settlements = lines.filter((l) => l.kind === "payment" || l.kind === "transfer");
    if (!charges.length) throw conflict("folio_empty");
    const balance = lines.reduce((s, l) => s + l.amountCents, 0);
    if (balance > 0) throw conflict("folio_not_settled", { balanceCents: balance });

    const snapshot = await buildStaySnapshot(tx, rid, folio, charges, settlements, named);
    const issuedAt = new Date();
    const year = jalaliYear(issuedAt, ctx.restaurant.timezone);
    const seq = await nextInvoiceSeq(tx, rid, year);
    const [created] = await tx
      .insert(invoices)
      .values({
        restaurantId: rid,
        number: invoiceNumber(year, seq),
        seq,
        folioId: folio.id,
        currency: snapshot.currency,
        totalCents: snapshot.totalCents,
        taxCents: snapshot.taxCents,
        snapshot,
        publicToken: randomToken(24),
        issuedAt,
      })
      .returning();
    await recordAudit(tx, {
      action: "invoice.issued",
      actorUserId: ctx.user.id,
      restaurantId: rid,
      entityType: "invoice",
      entityId: created!.id,
      metadata: { number: created!.number, totalCents: created!.totalCents, folioId: folio.id },
    });
    return created!;
  });
}

async function buildStaySnapshot(
  tx: DbOrTx,
  rid: string,
  folio: typeof folios.$inferSelect,
  charges: (typeof folioLines.$inferSelect)[],
  settlements: (typeof folioLines.$inferSelect)[],
  named: InvoiceParty | null,
): Promise<InvoiceSnapshot> {
  const [rs] = await tx
    .select({ r: restaurants, s: restaurantSettings })
    .from(restaurants)
    .innerJoin(restaurantSettings, eq(restaurantSettings.restaurantId, restaurants.id))
    .where(eq(restaurants.id, rid));
  const r = rs!.r;
  const st = rs!.s;
  const [stay] = folio.stayId
    ? await tx
        .select({ stay: stays, room: diningTables.label })
        .from(stays)
        .leftJoin(diningTables, eq(diningTables.id, stays.roomId))
        .where(eq(stays.id, folio.stayId))
    : [];
  const guestId = folio.guestId ?? stay?.stay.guestId ?? null;
  const [guest] = guestId ? await tx.select().from(hotelGuests).where(eq(hotelGuests.id, guestId)) : [];
  const accountId = folio.accountId ?? stay?.stay.accountId ?? null;
  const [account] =
    accountId && folio.accountId
      ? await tx.select().from(hotelAccounts).where(eq(hotelAccounts.id, accountId))
      : [];
  const guestName = guest ? [guest.firstName, guest.lastName].filter(Boolean).join(" ") : "";

  // Buyer: as asked, else the company the folio is billed to, else the guest.
  const buyer: InvoiceParty | null =
    named ??
    (account
      ? { name: account.name, economicCode: account.taxId, address: account.address, phone: account.phone }
      : guest
        ? {
            name: guestName,
            nationalId:
              (!guest.nationality || guest.nationality === "IR") && guest.documentType === "id_card"
                ? guest.documentNumber
                : null,
            address: guest.address,
            phone: guest.phone,
          }
        : null);

  const byRate = new Map<number, { base: number; tax: number }>();
  for (const l of charges) {
    const acc = byRate.get(l.taxRateBps) ?? { base: 0, tax: 0 };
    byRate.set(l.taxRateBps, { base: acc.base + l.amountCents - l.taxCents, tax: acc.tax + l.taxCents });
  }
  const taxes = [...byRate.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rateBps, v]) => ({ rateBps, baseCents: v.base, taxCents: v.tax }));
  const totalCents = charges.reduce((s, l) => s + l.amountCents, 0);
  return {
    version: 2,
    seller: {
      tradeName: r.name,
      name: st.legalName || r.name,
      nationalId: st.legalId,
      economicCode: st.vatNumber,
      registrationNumber: st.registrationNumber,
      address: [r.addressLine1, r.addressLine2].filter(Boolean).join("، ") || null,
      city: r.city,
      postalCode: r.postalCode,
      phone: r.phone,
    },
    buyer,
    tableLabel: null,
    orders: [],
    lines: charges.map((l) => ({
      name: l.description,
      options: [],
      quantity: l.quantity,
      unitPriceCents: l.unitCents,
      lineTotalCents: l.amountCents,
      taxRateBps: l.taxRateBps,
    })),
    pricesIncludeTax: true,
    taxes,
    subtotalCents: totalCents,
    discountCents: 0,
    taxCents: taxes.reduce((s, t) => s + t.taxCents, 0),
    totalCents,
    currency: r.currency,
    payments: settlements.map((l) => ({
      provider: l.kind === "transfer" ? "city_ledger" : (l.method ?? "other"),
      amountCents: -l.amountCents,
      at: l.createdAt.toISOString(),
      reference: l.reference,
    })),
    notes: st.legalNotice,
    stay: stay
      ? {
          number: stay.stay.number,
          room: stay.room,
          arrival: stay.stay.arrival,
          departure: stay.stay.departure,
          guest: guestName,
        }
      : null,
  };
}

/** The invoice already issued for each folio of a stay (the folio panel shows its number). */
export async function stayInvoices(db: DbOrTx, restaurantId: string, folioIds: string[]) {
  if (!folioIds.length) return [];
  return db
    .select({ folioId: invoices.folioId, number: invoices.number, publicToken: invoices.publicToken })
    .from(invoices)
    .where(and(eq(invoices.restaurantId, restaurantId), inArray(invoices.folioId, folioIds)));
}

// ─── Export for the tax system (سامانه مودیان) ───────────────────────────────

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/**
 * Every invoice issued between two days, one row per line, with what the tax system's bulk
 * upload asks for: number, Jalali date, invoice type (type 1 with an identified buyer, type 2
 * for a final consumer), buyer ids, description, quantity, unit price, amount before tax, VAT
 * rate and amount, total, all in rials.
 */
export async function moadianCsv(db: DbOrTx, ctx: RestaurantContext, from: string, to: string) {
  assertCan(ctx, "invoices.view");
  const tz = ctx.restaurant.timezone;
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.restaurantId, ctx.restaurant.id),
        sql`(${invoices.issuedAt} at time zone ${tz})::date between ${from}::date and ${to}::date`,
      ),
    )
    .orderBy(asc(invoices.seq), asc(invoices.issuedAt));
  const rial = (cents: number) => Math.round(cents / 100);
  const day = (d: Date) => {
    const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
    const j = toJalali(local);
    return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
  };
  const header = [
    "شماره فاکتور",
    "تاریخ صدور",
    "نوع فاکتور",
    "نام خریدار",
    "شناسه/کد ملی خریدار",
    "کد اقتصادی خریدار",
    "کد پستی خریدار",
    "شرح کالا یا خدمت",
    "تعداد",
    "مبلغ واحد (ریال)",
    "مبلغ قبل از مالیات (ریال)",
    "نرخ مالیات بر ارزش افزوده",
    "مالیات بر ارزش افزوده (ریال)",
    "مبلغ کل (ریال)",
    "اقامت",
  ];
  const out = [header.map(csvCell).join(",")];
  for (const inv of rows) {
    const s = inv.snapshot;
    const identified = !!(s.buyer?.nationalId || s.buyer?.economicCode);
    for (const l of s.lines) {
      const tax = s.pricesIncludeTax
        ? taxFromGross(l.lineTotalCents, l.taxRateBps)
        : taxFromNet(l.lineTotalCents, l.taxRateBps);
      const base = s.pricesIncludeTax ? l.lineTotalCents - tax : l.lineTotalCents;
      out.push(
        [
          inv.number,
          day(inv.issuedAt),
          identified ? "نوع اول" : "نوع دوم",
          s.buyer?.name ?? "",
          s.buyer?.nationalId ?? "",
          s.buyer?.economicCode ?? "",
          s.buyer?.postalCode ?? "",
          l.name,
          l.quantity,
          rial(l.unitPriceCents),
          rial(base),
          `${l.taxRateBps / 100}%`,
          rial(tax),
          rial(base + tax),
          s.stay ? `#${s.stay.number}` : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return { csv: out.join("\n"), count: rows.length };
}
