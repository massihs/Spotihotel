import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createHub } from "../src/hub.js";
import { createStore } from "../src/store.js";
import { isVirtualPrinter, toEscPos, toMono } from "../src/escpos.js";
import { ticketHtml, ticketsFor, labelsFor } from "../src/tickets.js";
import { buildLine, parseMoney, totalsOf } from "../offline/model.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const snapshot = {
  version: 1,
  restaurant: { id: "r1", name: "Brielle", currency: "IRR", timezone: "Asia/Tehran", defaultLocale: "fa", pricesIncludeTax: true, orderPrefix: "B" },
  categories: [
    { id: "c-grill", name: "Grill", stationId: "s-grill" },
    { id: "c-bar", name: "Bar", stationId: "s-bar" },
  ],
  products: [
    {
      id: "p-kebab",
      categoryId: "c-grill",
      name: "کباب",
      priceCents: 500_000_000,
      takeawayPriceCents: 450_000_000,
      taxRateBps: 1000,
      isAvailable: true,
      optionGroups: [
        { id: "g-bread", name: "نان", minSelect: 1, maxSelect: 1, values: [
          { id: "v-lavash", name: "لواش", priceDeltaCents: 0, isAvailable: true, isDefault: true },
          { id: "v-sangak", name: "سنگک", priceDeltaCents: 20_000_000, isAvailable: true },
        ] },
      ],
    },
    { id: "p-dough", categoryId: "c-bar", name: "دوغ", priceCents: 80_000_000, takeawayPriceCents: null, taxRateBps: 1000, isAvailable: true, optionGroups: [] },
    { id: "p-off", categoryId: "c-bar", name: "Off", priceCents: 1000, takeawayPriceCents: null, taxRateBps: 0, isAvailable: false, optionGroups: [] },
  ],
  tables: [{ id: "t-7", label: "7", zone: null, capacity: 4 }],
  stations: [{ id: "s-grill", name: "کباب‌پز" }, { id: "s-bar", name: "بار" }],
  printers: [
    { id: "pr-grill", name: "Grill", host: "10.0.0.1", port: 9100, paperMm: 80, target: "station", stationId: "s-grill", copies: 1 },
    { id: "pr-bar", name: "Bar", host: "10.0.0.2", port: 9100, paperMm: 58, target: "station", stationId: "s-bar", copies: 1 },
    { id: "pr-till", name: "Till", host: "10.0.0.3", port: 9100, paperMm: 80, target: "cashier", stationId: null, copies: 1 },
  ],
  staff: [{ userId: "u1", name: "Sara", job: "waiter", role: "staff" }],
  payments: ["cash", "on_site_terminal"],
};

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sfhub-"));
  const store = createStore(dir);
  const printed = [];
  let failHost = null;
  const hub = createHub({
    store,
    staticDir: path.join(root, "offline"),
    appDir: path.join(root, "setup"),
    deliver: async (printer, ticket) => {
      if (printer.host === failHost) throw new Error("unreachable");
      printed.push({ printer: printer.name, ticket });
    },
  });
  hub.setSnapshot(snapshot);
  return { hub, store, printed, failOn: (h) => (failHost = h), dir };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

test("prices, options and totals match the website rules", () => {
  const kebab = snapshot.products[0];
  assert.equal(buildLine(kebab, "dine_in", [], 1).error, "too_few_options");
  const { line } = buildLine(kebab, "takeaway", ["v-sangak"], 2, "", snapshot.categories[0]);
  assert.equal(line.lineTotalCents, (450_000_000 + 20_000_000) * 2);
  assert.equal(line.stationId, "s-grill");
  const totals = totalsOf([line], true, 40_000_000);
  assert.equal(totals.totalCents, 940_000_000 - 40_000_000);
  assert.equal(totals.taxCents, Math.round((940_000_000 * 1000) / 11000));
  assert.equal(parseMoney("۱۲۰٬۰۰۰", "IRR"), 120_000_000);
  assert.equal(parseMoney("19,90", "EUR"), 1990);
});

test("an order goes to each station's printer, the bill to the till, then syncs once", async () => {
  const { hub, printed } = setup();
  const order = hub._createOrder({
    channel: "dine_in",
    tableId: "t-7",
    staffUserId: "u1",
    lines: [
      { productId: "p-kebab", optionValueIds: ["v-lavash"], quantity: 2, note: "بدون پیاز" },
      { productId: "p-dough", optionValueIds: [], quantity: 2 },
    ],
  });
  assert.equal(order.localNumber, "H-1");
  assert.equal(order.totalCents, 2 * 500_000_000 + 2 * 80_000_000);
  assert.equal(order.staffName, "Sara");
  await settle();
  const grill = printed.find((p) => p.printer === "Grill").ticket;
  assert.deepEqual(grill.lines.map((l) => l.name), ["کباب"]);
  assert.equal(grill.lines[0].note, "بدون پیاز");
  assert.equal(grill.where, "میز 7");
  assert.deepEqual(printed.find((p) => p.printer === "Bar").ticket.lines.map((l) => l.name), ["دوغ"]);
  assert.ok(printed.find((p) => p.printer === "Till").ticket.rows.some((r) => r.strong));

  // Sold out and unknown dishes are refused.
  assert.throws(() => hub._createOrder({ channel: "takeaway", lines: [{ productId: "p-off", quantity: 1 }] }), /product_unavailable/);
  assert.throws(() => hub._createOrder({ channel: "dine_in", lines: [{ productId: "p-dough", quantity: 1 }] }), /table_required/);

  // Sync: frozen while sending, read-only afterwards.
  const batch = hub.beginSync();
  assert.equal(batch.length, 1);
  assert.equal(batch[0].syncing, undefined);
  hub.markSynced([{ ref: order.id, ok: true, number: "B-1042" }]);
  assert.equal(hub.pending().length, 0);
});

test("cash payment checks the amount, prints the receipt; failed printers are reported", async () => {
  const { hub, printed, failOn, store } = setup();
  failOn("10.0.0.2");
  const o = hub._createOrder({
    channel: "takeaway",
    lines: [{ productId: "p-dough", quantity: 1 }],
    payment: { provider: "cash", tenderedCents: 100_000_000 },
  });
  assert.equal(o.payment.provider, "cash");
  await new Promise((r) => setTimeout(r, 2800));
  const receipts = printed.filter((p) => p.printer === "Till");
  assert.equal(receipts.length, 1); // paid at once: only the receipt
  assert.equal(receipts[0].ticket.footer, "پرداخت شده");
  assert.ok(receipts[0].ticket.rows.some((r) => r.value.includes("۲۰")));
  const saved = store.read("orders", []).find((x) => x.id === o.id);
  assert.deepEqual(saved.printErrors, ["Bar"]);
  assert.throws(
    () => hub._createOrder({ channel: "takeaway", lines: [{ productId: "p-dough", quantity: 1 }], payment: { provider: "cash", tenderedCents: 1 } }),
    /tendered_too_low/,
  );
});

test("phones must pair with the code; the API refuses them before", async () => {
  const { hub } = setup();
  const port = await hub.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/pair`, { method: "POST", body: JSON.stringify({ code: "000000" }) })).status, 403);
  const ok = await fetch(`${base}/api/pair`, { method: "POST", body: JSON.stringify({ code: hub.pairCode }) });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get("set-cookie").split(";")[0];
  const state = await (await fetch(`${base}/api/state`, { headers: { cookie } })).json();
  assert.equal(state.snapshot.restaurant.name, "Brielle");
  // Creating, paying and moving an order over HTTP.
  const res = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ channel: "takeaway", lines: [{ productId: "p-dough", quantity: 3 }] }),
  });
  assert.equal(res.status, 201);
  const order = await res.json();
  const st = await fetch(`${base}/api/orders/${order.id}/status`, {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({ status: "ready" }),
  });
  assert.equal((await st.json()).status, "ready");
  // The PC's own screens are not served to the network… (same host here, so only the key matters)
  assert.equal((await fetch(`${base}/index.html`)).status, 200);
  // …and the PC's key logs its own window in.
  const own = await fetch(`${base}/?k=${hub.ownKey}`, { redirect: "manual" });
  assert.equal(own.status, 302);
  // Path traversal stays inside the screens folder.
  const trav = await fetch(`${base}/..%2f..%2fpackage.json`);
  assert.ok(!(await trav.text()).includes("electron-builder"));
  await hub.close();
});

test("tickets render to ESC/POS raster bands", () => {
  const t = ticketsFor(
    { ...setupOrder(), payment: null },
    snapshot,
    "created",
    labelsFor("fa"),
  );
  assert.equal(t.length, 3);
  const html = ticketHtml(t[0].ticket, 576);
  assert.match(html, /dir="rtl"/);
  assert.ok(!html.includes("<script"));
  const w = 16;
  const h = 300;
  const px = Buffer.alloc(w * h * 4, 255);
  px[0] = px[1] = px[2] = 0; // one black pixel
  const mono = toMono(px, w, h);
  assert.equal(mono.data[0], 0x80);
  const bytes = toEscPos(mono, 2);
  // 2 copies × (init + 2 bands + cut)
  assert.equal(bytes.filter((b, i) => b === 0x1d && bytes[i + 1] === 0x76).length, 4);
});

function setupOrder() {
  return {
    id: "x",
    localNumber: "H-9",
    placedAt: new Date().toISOString(),
    channel: "takeaway",
    tableLabel: null,
    lines: [
      buildLine(snapshot.products[0], "takeaway", ["v-lavash"], 1, "", snapshot.categories[0]).line,
      buildLine(snapshot.products[1], "takeaway", [], 1, "", snapshot.categories[1]).line,
    ],
    totalCents: 1,
    discountCents: 0,
    note: "<script>alert(1)</script>",
  };
}

test("screens load their scripts from files (the pages' CSP blocks inline scripts)", () => {
  for (const dir of ["setup", "offline"])
    for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith(".html"))) {
      const html = fs.readFileSync(path.join(root, dir, f), "utf8");
      const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
        ([, attrs, body]) => !/\bsrc=/.test(attrs) || body.trim(),
      );
      assert.equal(inline.length, 0, `${dir}/${f} has an inline script`);
    }
});

test("virtual printers (OneNote, PDF, XPS) are never used for tickets", () => {
  for (const n of ["OneNote (Desktop)", "Send To OneNote 2016", "Microsoft Print to PDF", "Microsoft XPS Document Writer", "Fax"])
    assert.ok(isVirtualPrinter(n), n);
  for (const n of ["XP-80C", "EPSON TM-T20II Receipt", "POS-58"]) assert.ok(!isVirtualPrinter(n), n);
});

test("a dish sent elsewhere than its category prints at its own station", () => {
  const kebab = { ...snapshot.products[0], stationId: "s-bar" };
  const { line } = buildLine(kebab, "dine_in", ["v-lavash"], 1, "", snapshot.categories[0]);
  assert.equal(line.stationId, "s-bar");
});
