import { formatMoney } from "../offline/model.js";

/**
 * What each printer gets for an order, mirroring the website's tickets:
 * - a station printer (grill, bar…) gets only its dishes, without prices;
 * - an "all" printer (single kitchen) gets every dish;
 * - a till printer gets the bill with prices.
 * Returns [{ printer, ticket }] (printers with nothing to print are skipped).
 */
export function ticketsFor(order, snapshot, event, labels) {
  const out = [];
  for (const p of snapshot.printers ?? []) {
    if (event === "created") {
      // Paid on the spot: the till gets the receipt (event "paid"), not an unpaid bill first.
      if (p.target === "cashier") {
        if (!order.payment) out.push({ printer: p, ticket: bill(order, snapshot, labels, false) });
      }
      else {
        const lines = p.target === "station" && p.stationId ? order.lines.filter((l) => l.stationId === p.stationId) : order.lines;
        if (!lines.length) continue;
        const station = p.target === "station" ? snapshot.stations?.find((s) => s.id === p.stationId)?.name : null;
        out.push({ printer: p, ticket: kitchen(order, snapshot, labels, lines, station ?? labels.kitchen) });
      }
    } else if (event === "paid" && p.target === "cashier") {
      out.push({ printer: p, ticket: bill(order, snapshot, labels, true) });
    } else if (event === "reprint-kitchen" && p.target !== "cashier") {
      const lines = p.target === "station" && p.stationId ? order.lines.filter((l) => l.stationId === p.stationId) : order.lines;
      if (lines.length) out.push({ printer: p, ticket: kitchen(order, snapshot, labels, lines, labels.kitchen, true) });
    } else if (event === "reprint-bill" && p.target === "cashier") {
      out.push({ printer: p, ticket: bill(order, snapshot, labels, order.payment != null) });
    }
  }
  return out;
}

function head(order, snapshot, labels) {
  const tz = snapshot.restaurant.timezone;
  const time = new Intl.DateTimeFormat(labels.locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(
    new Date(order.placedAt),
  );
  return {
    restaurant: snapshot.restaurant.name,
    number: order.localNumber,
    where: order.channel === "takeaway" ? labels.takeaway : `${labels.table} ${order.tableLabel ?? "—"}`,
    time,
    staff: order.staffName ?? null,
  };
}

const qty = (n, labels) => new Intl.NumberFormat(labels.locale).format(n);

function kitchen(order, snapshot, labels, lines, title, reprint = false) {
  return {
    kind: "kitchen",
    ...head(order, snapshot, labels),
    title: reprint ? `${title} · ${labels.reprint}` : title,
    offline: labels.offline,
    lines: lines.map((l) => ({
      quantity: qty(l.quantity, labels),
      name: l.name,
      options: l.options.map((o) => o.valueName),
      note: l.note || null,
    })),
    note: order.note || null,
  };
}

function bill(order, snapshot, labels, paid) {
  const money = (c) => formatMoney(c, snapshot.restaurant.currency, labels.locale);
  return {
    kind: "bill",
    ...head(order, snapshot, labels),
    title: paid ? labels.receipt : labels.bill,
    offline: labels.offline,
    lines: order.lines.map((l) => ({
      quantity: qty(l.quantity, labels),
      name: l.name,
      options: l.options.map((o) => o.valueName),
      note: null,
      price: money(l.lineTotalCents),
    })),
    note: order.note || null,
    rows: [
      ...(order.discountCents ? [{ label: labels.discount, value: `-${money(order.discountCents)}` }] : []),
      { label: labels.total, value: money(order.totalCents), strong: true },
      ...(paid && order.payment?.tenderedCents
        ? [
            { label: labels.tendered, value: money(order.payment.tenderedCents) },
            { label: labels.change, value: money(Math.max(0, order.payment.tenderedCents - order.totalCents)) },
          ]
        : []),
    ],
    footer: paid ? labels.paid : labels.unpaid,
  };
}

/** Ticket wording, in the restaurant's language. */
export const TICKET_LABELS = {
  fa: {
    locale: "fa-IR",
    kitchen: "سفارش آشپزخانه",
    takeaway: "بیرون‌بر",
    table: "میز",
    bill: "صورتحساب",
    receipt: "رسید پرداخت",
    reprint: "چاپ مجدد",
    offline: "ثبت آفلاین",
    discount: "تخفیف",
    total: "جمع کل",
    tendered: "دریافتی",
    change: "باقی‌مانده",
    paid: "پرداخت شده",
    unpaid: "پرداخت نشده",
  },
  fr: {
    locale: "fr-FR",
    kitchen: "Commande cuisine",
    takeaway: "À emporter",
    table: "Table",
    bill: "Addition",
    receipt: "Reçu",
    reprint: "Réimpression",
    offline: "Saisie hors ligne",
    discount: "Remise",
    total: "Total",
    tendered: "Reçu",
    change: "Rendu",
    paid: "Payé",
    unpaid: "Non payé",
  },
  en: {
    locale: "en-GB",
    kitchen: "Kitchen order",
    takeaway: "Takeaway",
    table: "Table",
    bill: "Bill",
    receipt: "Receipt",
    reprint: "Reprint",
    offline: "Taken offline",
    discount: "Discount",
    total: "Total",
    tendered: "Tendered",
    change: "Change",
    paid: "Paid",
    unpaid: "Unpaid",
  },
  ar: {
    locale: "ar",
    kitchen: "طلب المطبخ",
    takeaway: "سفري",
    table: "طاولة",
    bill: "الفاتورة",
    receipt: "إيصال الدفع",
    reprint: "إعادة طباعة",
    offline: "مسجل دون اتصال",
    discount: "خصم",
    total: "المجموع",
    tendered: "المستلم",
    change: "الباقي",
    paid: "مدفوع",
    unpaid: "غير مدفوع",
  },
};
export const labelsFor = (locale) => TICKET_LABELS[locale] ?? TICKET_LABELS.fa;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The ticket as a self-contained page, `widthPx` wide (576 = 80 mm, 384 = 58 mm at 203 dpi). */
export function ticketHtml(t, widthPx, rtl = true, fontCss = "") {
  const lines = t.lines
    .map(
      (l) => `<div class="line"><div class="row"><span class="${t.kind === "kitchen" ? "big" : ""}">${l.quantity} × ${esc(l.name)}</span>${
        l.price ? `<span class="num">${esc(l.price)}</span>` : ""
      }</div>${l.options.length ? `<div class="opt">${esc(l.options.join("، "))}</div>` : ""}${l.note ? `<div class="note">« ${esc(l.note)} »</div>` : ""}</div>`,
    )
    .join("");
  const rows = (t.rows ?? [])
    .map((r) => `<div class="row ${r.strong ? "strong" : ""}"><span>${esc(r.label)}</span><span class="num">${esc(r.value)}</span></div>`)
    .join("");
  return `<!doctype html><html dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff;color:#000;width:${widthPx}px}
body{font-family:Vazirmatn,Tahoma,"Segoe UI",Arial,sans-serif;font-size:22px;line-height:1.35;padding:8px 10px 16px;font-weight:700}
.c{text-align:center}.sm{font-size:18px;font-weight:600}.xl{font-size:56px;font-weight:900;line-height:1.1}.lg{font-size:30px}
.rule{border-top:3px dashed #000;margin:8px 0}.row{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.big{font-size:28px}.opt{font-size:19px;font-weight:600;padding-inline-start:18px}.note{font-size:21px;padding-inline-start:18px}
.line{padding:4px 0}.strong{font-size:28px;font-weight:900}.num{white-space:nowrap;unicode-bidi:isolate}
.tag{display:inline-block;border:2px solid #000;border-radius:6px;padding:0 8px;font-size:17px;margin-top:4px}
</style></head><body>
<div class="c sm">${esc(t.restaurant)}</div>
<div class="c sm">${esc(t.title)}</div>
<div class="c xl">${esc(t.number)}</div>
<div class="c lg">${esc(t.where)}</div>
<div class="c sm">${esc(t.time)}${t.staff ? ` · ${esc(t.staff)}` : ""}</div>
<div class="c"><span class="tag">${esc(t.offline)}</span></div>
<div class="rule"></div>${lines}
${t.note ? `<div class="rule"></div><div>${esc(t.note)}</div>` : ""}
${rows ? `<div class="rule"></div>${rows}` : ""}
${t.footer ? `<div class="c sm" style="margin-top:6px">${esc(t.footer)}</div>` : ""}
</body></html>`;
}
