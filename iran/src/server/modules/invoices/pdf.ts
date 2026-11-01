import "server-only";
import path from "node:path";
import bidiFactory from "bidi-js";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { InvoiceSnapshot } from "@/server/db/schema";
import { jalaliDateTime } from "@/lib/jalali";
import { normalizeDigits } from "@/lib/money";

/**
 * Persian PDF invoices with pdfkit.
 * pdfkit shapes Arabic-script words correctly (via fontkit) but lays words out left to right
 * and has no bidi support, so this module does the Unicode Bidirectional Algorithm itself
 * (bidi-js): each line is split into directional runs, RTL runs are placed word by word from
 * the right, LTR runs (numbers, Latin) are drawn as-is, and brackets are mirrored.
 * The "Farsi Digits" build of Vazirmatn draws ASCII digits as Persian digits, so all digits are
 * normalized to ASCII first (Persian digits would otherwise be reversed inside LTR runs).
 */
const bidi = bidiFactory();
const FONT_DIR = path.join(process.cwd(), "node_modules/vazirmatn/misc/Farsi-Digits/fonts/ttf");
const FONTS = {
  regular: path.join(FONT_DIR, "Vazirmatn-FD-Regular.ttf"),
  bold: path.join(FONT_DIR, "Vazirmatn-FD-Bold.ttf"),
};

/** Keeps a value (invoice number, code, phone) together left-to-right inside Persian text. */
export const ltr = (s: string) => `⁦${s}⁩`;
const ISOLATES = /[⁦-⁩]/g;
const PLACEHOLDER = "\uE000";

type Doc = InstanceType<typeof PDFDocument>;
type Style = { size?: number; bold?: boolean; color?: string };
type Align = "right" | "left" | "center";

class RtlWriter {
  constructor(private doc: Doc) {}

  private use({ size = 10, bold = false, color = "#1c1916" }: Style) {
    this.doc
      .font(bold ? "bold" : "regular")
      .fontSize(size)
      .fillColor(color);
  }

  /**
   * Directional runs in visual order. Isolated values (ltr()) are swapped for a private-use
   * placeholder (a strong left-to-right character) before running the algorithm, then drawn
   * as one unbroken LTR token — bidi-js does not implement isolates itself.
   */
  private runs(text: string) {
    const isolated: string[] = [];
    const clean = normalizeDigits(text).replace(/\u2066([^\u2066-\u2069]*)\u2069/g, (_, inner: string) => {
      isolated.push(inner);
      return PLACEHOLDER;
    });
    const { levels } = bidi.getEmbeddingLevels(clean, "rtl");
    const out: { text: string; rtl: boolean }[] = [];
    const push = (chunk: string, rtl: boolean) => {
      const c = chunk.replace(ISOLATES, "");
      if (c)
        out.push({ text: rtl ? [...c].map((ch) => bidi.getMirroredCharacter(ch) ?? ch).join("") : c, rtl });
    };
    let start = 0;
    let k = 0;
    for (let i = 0; i <= clean.length; i++) {
      const boundary = i === clean.length || clean[i] === PLACEHOLDER || levels[i] !== levels[start];
      if (!boundary || i === start) {
        if (i < clean.length && clean[i] === PLACEHOLDER) {
          push(isolated[k++] ?? "", false);
          start = i + 1;
        }
        continue;
      }
      push(clean.slice(start, i), levels[start]! % 2 === 1);
      start = i;
      if (i < clean.length && clean[i] === PLACEHOLDER) {
        push(isolated[k++] ?? "", false);
        start = i + 1;
      }
    }
    return out;
  }

  /** Tokens in visual order from right to left, with their widths. */
  private layout(text: string) {
    const tokens: { text: string; width: number; draw: boolean }[] = [];
    for (const r of this.runs(text)) {
      if (!r.rtl) {
        tokens.push({ text: r.text, width: this.doc.widthOfString(r.text), draw: r.text.trim() !== "" });
        continue;
      }
      for (const tok of r.text.split(/(\s+)/)) {
        if (tok) tokens.push({ text: tok, width: this.doc.widthOfString(tok), draw: tok.trim() !== "" });
      }
    }
    return tokens;
  }

  width(text: string, style: Style = {}) {
    this.use(style);
    return this.layout(text).reduce((s, t) => s + t.width, 0);
  }

  /** Greedy word wrap in logical order. */
  wrap(text: string, maxWidth: number, style: Style = {}) {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && this.width(candidate, style) > maxWidth) {
          lines.push(current);
          current = word;
        } else current = candidate;
      }
      lines.push(current);
    }
    return lines;
  }

  /** Draws one line inside [x, x + width]. */
  line(text: string, x: number, y: number, width: number, align: Align = "right", style: Style = {}) {
    this.use(style);
    const tokens = this.layout(text);
    const total = tokens.reduce((s, t) => s + t.width, 0);
    let cursor = align === "right" ? x + width : align === "left" ? x + total : x + (width + total) / 2;
    for (const t of tokens) {
      cursor -= t.width;
      if (t.draw) this.doc.text(t.text, cursor, y, { lineBreak: false });
    }
  }

  /** Draws wrapped text and returns the height used. */
  block(text: string, x: number, y: number, width: number, align: Align = "right", style: Style = {}) {
    const size = style.size ?? 10;
    const lineHeight = size * 1.6;
    const lines = this.wrap(text, width, style);
    lines.forEach((l, i) => this.line(l, x, y + i * lineHeight, width, align, style));
    return lines.length * lineHeight;
  }
}

/** Rials (stored minor units / 100), grouped: 9900000 → "9,900,000". */
const rial = (cents: number) => new Intl.NumberFormat("en-US").format(Math.round(cents / 100));
const toman = (cents: number) => new Intl.NumberFormat("en-US").format(Math.round(cents / 1000));
const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}٪`;

const PROVIDERS: Record<string, string> = {
  cash: "نقدی",
  on_site_terminal: "کارت‌خوان",
  zarinpal: "درگاه زرین‌پال",
  mock_online: "پرداخت آنلاین (آزمایشی)",
  stripe: "Stripe",
};

export async function renderInvoicePdf(input: {
  number: string;
  issuedAt: Date;
  timezone: string;
  snapshot: InvoiceSnapshot;
  publicUrl: string;
}): Promise<Buffer> {
  const { snapshot: s } = input;
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: { Title: `صورتحساب ${input.number}`, Author: s.seller.tradeName, Creator: "Spotifood" },
  });
  doc.registerFont("regular", FONTS.regular);
  doc.registerFont("bold", FONTS.bold);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const w = new RtlWriter(doc);
  const left = 40;
  const right = doc.page.width - 40;
  const width = right - left;
  const muted = "#6b645c";
  const border = "#d9d4cc";
  let y = 40;

  // Title + QR (link to the online invoice).
  const qr = await QRCode.toBuffer(input.publicUrl, { margin: 0, width: 220 });
  doc.image(qr, left, y, { width: 64 });
  w.line("صورتحساب فروش کالا و خدمات", left, y + 4, width, "center", { size: 16, bold: true });
  w.line(s.seller.tradeName, left, y + 30, width, "center", { size: 11, color: muted });
  y += 80;

  // Invoice meta.
  const meta = [
    `شماره صورتحساب: ${ltr(input.number)}`,
    `تاریخ صدور: ${ltr(jalaliDateTime(input.issuedAt, input.timezone))}`,
    s.tableLabel ? `میز: ${s.tableLabel}` : null,
    s.orders.length ? `سفارش‌ها: ${s.orders.map((o) => ltr(o.number)).join("، ")}` : null,
  ].filter(Boolean) as string[];
  meta.forEach((m, i) => w.line(m, left, y + i * 16, width, "right", { size: 10 }));
  y += meta.length * 16 + 10;

  // Seller / buyer boxes.
  const party = (title: string, lines: (string | null)[]) => {
    const content = lines.filter(Boolean) as string[];
    const h = 22 + content.length * 15;
    doc.roundedRect(left, y, width, h, 6).lineWidth(0.8).strokeColor(border).stroke();
    w.line(title, left + 10, y + 7, width - 20, "right", { size: 10, bold: true });
    content.forEach((l, i) => w.line(l, left + 10, y + 24 + i * 15, width - 20, "right", { size: 9 }));
    y += h + 8;
  };
  const sl = s.seller;
  party("مشخصات فروشنده", [
    `نام: ${sl.name}`,
    sl.nationalId ? `شناسه ملی: ${ltr(sl.nationalId)}` : null,
    sl.economicCode ? `کد اقتصادی: ${ltr(sl.economicCode)}` : null,
    sl.registrationNumber ? `شماره ثبت: ${ltr(sl.registrationNumber)}` : null,
    [sl.city, sl.address].filter(Boolean).length
      ? `نشانی: ${[sl.city, sl.address].filter(Boolean).join("، ")}`
      : null,
    sl.postalCode ? `کد پستی: ${ltr(sl.postalCode)}` : null,
    sl.phone ? `تلفن: ${ltr(sl.phone)}` : null,
  ]);
  const b = s.buyer;
  party(
    "مشخصات خریدار",
    b
      ? [
          `نام: ${b.name}`,
          b.nationalId ? `شناسه / کد ملی: ${ltr(b.nationalId)}` : null,
          b.economicCode ? `کد اقتصادی: ${ltr(b.economicCode)}` : null,
          b.address ? `نشانی: ${b.address}` : null,
          b.postalCode ? `کد پستی: ${ltr(b.postalCode)}` : null,
          b.phone ? `تلفن: ${ltr(b.phone)}` : null,
        ]
      : ["مصرف‌کننده نهایی"],
  );

  // Lines table (columns laid out from the right).
  const cols = [
    { key: "row", title: "ردیف", w: 34 },
    { key: "name", title: "شرح کالا / خدمات", w: width - 34 - 50 - 110 - 120 },
    { key: "qty", title: "تعداد", w: 50 },
    { key: "unit", title: "مبلغ واحد (ریال)", w: 110 },
    { key: "total", title: "مبلغ کل (ریال)", w: 120 },
  ] as const;
  const colX = (i: number) => right - cols.slice(0, i + 1).reduce((sum, c) => sum + c.w, 0);
  const header = () => {
    doc.rect(left, y, width, 22).fillColor("#f3f0eb").fill();
    cols.forEach((c, i) => w.line(c.title, colX(i) + 4, y + 6, c.w - 8, "center", { size: 9, bold: true }));
    y += 22;
  };
  header();
  s.lines.forEach((l, idx) => {
    const name = l.options.length ? `${l.name} (${l.options.join("، ")})` : l.name;
    const nameLines = w.wrap(name, cols[1].w - 8, { size: 9 });
    const h = Math.max(20, nameLines.length * 14 + 6);
    if (y + h > doc.page.height - 200) {
      doc.addPage();
      y = 40;
      header();
    }
    const cells = [String(idx + 1), null, String(l.quantity), rial(l.unitPriceCents), rial(l.lineTotalCents)];
    cells.forEach((c, i) => {
      if (i === 1)
        nameLines.forEach((nl, k) =>
          w.line(nl, colX(1) + 4, y + 5 + k * 14, cols[1].w - 8, "right", { size: 9 }),
        );
      else w.line(c!, colX(i) + 4, y + 5, cols[i].w - 8, "center", { size: 9 });
    });
    doc
      .moveTo(left, y + h)
      .lineTo(right, y + h)
      .lineWidth(0.5)
      .strokeColor(border)
      .stroke();
    y += h;
  });
  y += 12;

  // Totals.
  const totalRow = (label: string, value: string, bold = false) => {
    w.line(label, left + width / 2, y, width / 2, "right", { size: 10, bold });
    w.line(value, left, y, width / 2 - 10, "left", { size: 10, bold });
    y += 18;
  };
  const baseTotal = s.taxes.reduce((sum, t) => sum + t.baseCents, 0) || s.subtotalCents;
  if (s.discountCents > 0) totalRow("تخفیف (ریال)", rial(s.discountCents));
  totalRow("جمع مبلغ قبل از مالیات (ریال)", rial(baseTotal));
  for (const t of s.taxes.filter((t) => t.rateBps > 0)) {
    totalRow(`مالیات بر ارزش افزوده ${pct(t.rateBps)} (ریال)`, rial(t.taxCents));
  }
  doc
    .moveTo(left, y - 4)
    .lineTo(right, y - 4)
    .lineWidth(0.8)
    .strokeColor(border)
    .stroke();
  totalRow("مبلغ قابل پرداخت (ریال)", rial(s.totalCents), true);
  w.line(`معادل ${toman(s.totalCents)} تومان`, left, y, width, "left", { size: 9, color: muted });
  y += 24;

  // Payment.
  for (const p of s.payments) {
    const ref = p.reference ? ` · شماره پیگیری: ${ltr(p.reference)}` : "";
    w.line(
      `پرداخت: ${PROVIDERS[p.provider] ?? p.provider} · ${rial(p.amountCents)} ریال · ${ltr(jalaliDateTime(new Date(p.at), input.timezone))}${ref}`,
      left,
      y,
      width,
      "right",
      { size: 9 },
    );
    y += 16;
  }
  if (s.notes) {
    y += 8;
    y += w.block(s.notes, left, y, width, "right", { size: 8, color: muted });
  }
  w.line("این صورتحساب به‌صورت الکترونیکی صادر شده است.", left, doc.page.height - 50, width, "center", {
    size: 8,
    color: muted,
  });
  doc.end();
  return done;
}
