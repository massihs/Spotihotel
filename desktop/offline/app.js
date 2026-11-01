import { buildLine, formatMoney, parseMoney, priceFor, totalsOf } from "/model.js";
import { isRtl, translator } from "/i18n.js";

/**
 * The screens of the local hub: order taking (till and waiters' phones), the orders list and the
 * kitchen display. Everything goes through the PC's local server, so it works without internet.
 */

const app = document.getElementById("app");
const modal = document.getElementById("modal");
const toastEl = document.getElementById("toast");
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

let data = null; // { snapshot, status, orders, addresses }
let t = translator("fa");
let locale = "fa";
const pref = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(`sf-${k}`);
    localStorage.setItem(`sf-${k}`, v);
  } catch {
    return null;
  }
};
// The ticket being built, kept per device (a waiter may switch screens).
let cart = JSON.parse(pref("cart") ?? "null") ?? { channel: "dine_in", tableId: null, lines: [], note: "" };
const saveCart = () => pref("cart", JSON.stringify(cart));
let category = pref("category") ?? "all";
let station = pref("station") ?? "all";
let ticketOpen = false;
let busy = false;

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? `http_${res.status}`), { status: res.status });
  return json;
}

function toast(text, error = false) {
  toastEl.textContent = text;
  toastEl.className = `toast${error ? " err" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.add("hidden"), error ? 6000 : 3500);
}

const money = (c) => formatMoney(c, data.snapshot.restaurant.currency, locale);
/** Counts in the restaurant's digits (Persian digits for fa). */
const num = (n) => new Intl.NumberFormat(locale).format(n);
const route = () => (location.hash.replace(/^#\/?/, "") || pref("screen") || "order").split("?")[0];

// ─── Loading ─────────────────────────────────────────────────────────────────

async function load() {
  try {
    data = await api("/api/state");
  } catch (e) {
    if (e.status === 401) return renderPair();
    app.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return;
  }
  locale = data.snapshot?.restaurant.defaultLocale ?? navigator.language?.slice(0, 2) ?? "fa";
  t = translator(locale);
  document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
  document.documentElement.lang = locale;
  render();
}

let events = null;
function listen() {
  events?.close();
  events = new EventSource("/api/events");
  let last = 0;
  events.addEventListener("orders", (e) => {
    const created = JSON.parse(e.data || "{}").created;
    if (created && route() === "kitchen") beep();
    void load();
    last = Date.now();
  });
  events.addEventListener("status", () => void load());
  events.addEventListener("snapshot", () => void load());
  // A phone that slept: catch up.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - last > 5000) void load();
  });
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* no audio */
  }
}

// ─── Pairing (phones and tablets) ────────────────────────────────────────────

function renderPair() {
  const lang = navigator.language?.slice(0, 2);
  t = translator(["fr", "en", "ar"].includes(lang) ? lang : "fa");
  document.documentElement.dir = lang === "fr" || lang === "en" ? "ltr" : "rtl";
  app.innerHTML = `<div class="pair"><form class="card" id="pair">
    <h2 style="margin:0">${t("pairTitle")}</h2><p class="muted" style="margin:0">${t("pairBody")}</p>
    <input class="field" id="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" dir="ltr" autofocus>
    <button class="btn primary lg">${t("pairGo")}</button><p class="muted" id="perr"></p></form></div>`;
  document.getElementById("pair").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/api/pair", { code: document.getElementById("code").value.trim() });
      await load();
      listen();
    } catch {
      document.getElementById("perr").textContent = t("wrongCode");
    }
  };
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function header() {
  const s = data.snapshot;
  const st = data.status;
  const screen = route();
  const staff = s.staff ?? [];
  const me = pref("staff");
  return `<header class="top">
    <span class="name">${esc(s.restaurant.name)}</span>
    <span class="badge ${st.online ? "on" : "off"}">${st.online ? t("online") : t("offline")}</span>
    ${st.pending ? `<span class="badge warn">${t("pending", { n: st.pending })}</span>` : ""}
    <nav class="tabs">
      ${["order", "orders", "kitchen"]
        .map((k) => `<a href="#/${k}" ${screen === k ? 'aria-current="page"' : ""}>${t(`tab${k[0].toUpperCase()}${k.slice(1)}`)}</a>`)
        .join("")}
    </nav>
    ${
      staff.length && screen !== "kitchen"
        ? `<label class="staff"><select id="staff" aria-label="${t("whoAmI")}"><option value="">${t("whoAmI")}</option>${staff
            .map((m) => `<option value="${esc(m.userId)}" ${m.userId === me ? "selected" : ""}>${esc(m.name)}</option>`)
            .join("")}</select></label>`
        : ""
    }
  </header>`;
}

function render() {
  if (!data.snapshot) {
    app.innerHTML = `<div class="empty">${t("noMenu")}</div>`;
    return;
  }
  const screen = route();
  pref("screen", screen);
  const body = screen === "orders" ? ordersScreen() : screen === "kitchen" ? kitchenScreen() : orderScreen();
  app.innerHTML = header() + body;
  document.getElementById("staff")?.addEventListener("change", (e) => pref("staff", e.target.value));
}

// ─── Order taking ────────────────────────────────────────────────────────────

const product = (id) => data.snapshot.products.find((p) => p.id === id);
const categoryOf = (p) => data.snapshot.categories.find((c) => c.id === p.categoryId) ?? null;

/** Lines priced with the current sale type (takeaway may differ). */
function pricedLines() {
  return cart.lines
    .map((l) => {
      const built = buildLine(product(l.productId), cart.channel, l.optionValueIds, l.quantity, l.note, product(l.productId) ? categoryOf(product(l.productId)) : null);
      return built.line ? { ...built.line, key: l.key } : null;
    })
    .filter(Boolean);
}

function busyTables() {
  return new Set(
    data.orders
      .filter((o) => o.channel === "dine_in" && !o.syncedAt && !o.payment && o.status !== "cancelled")
      .map((o) => o.tableId),
  );
}

function orderScreen() {
  const s = data.snapshot;
  const cats = s.categories.filter((c) => s.products.some((p) => p.categoryId === c.id));
  const list = s.products.filter((p) => category === "all" || p.categoryId === category);
  const inCart = new Map();
  for (const l of cart.lines) inCart.set(l.productId, (inCart.get(l.productId) ?? 0) + l.quantity);
  const lines = pricedLines();
  const totals = totalsOf(lines, s.restaurant.pricesIncludeTax);
  const table = s.tables.find((x) => x.id === cart.tableId);
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return `<div class="pos">
    <section class="menu">
      <div class="row">
        <div class="seg">
          <button data-channel="dine_in" aria-pressed="${cart.channel === "dine_in"}">${t("dineIn")}</button>
          <button data-channel="takeaway" aria-pressed="${cart.channel === "takeaway"}">${t("takeaway")}</button>
        </div>
        ${cart.channel === "dine_in" ? `<button class="btn ${table ? "dark" : "primary"}" data-act="tables">${table ? esc(t("table", { t: table.label })) : t("chooseTable")}</button>` : ""}
      </div>
      <div class="scroll">
        <button class="chip" data-cat="all" aria-pressed="${category === "all"}">${t("all")}</button>
        ${cats.map((c) => `<button class="chip" data-cat="${esc(c.id)}" aria-pressed="${category === c.id}">${esc(c.name)}</button>`).join("")}
      </div>
      <div class="grid">
        ${list
          .map(
            (p) => `<button class="prod" data-add="${esc(p.id)}" ${p.isAvailable ? "" : "disabled"}>
              <b>${esc(p.name)}</b>
              ${inCart.get(p.id) ? `<span class="in num">${num(inCart.get(p.id))}</span>` : ""}
              <span class="price num">${p.isAvailable ? money(priceFor(p, cart.channel)) : t("soldOut")}</span>
            </button>`,
          )
          .join("")}
      </div>
    </section>
    <aside class="card ticket ${ticketOpen ? "open" : ""}" id="ticket">
      <div class="head"><b>${t("ticket")}${table && cart.channel === "dine_in" ? ` · ${esc(t("table", { t: table.label }))}` : cart.channel === "takeaway" ? ` · ${t("takeaway")}` : ""}</b>
        <button class="btn" data-act="closeTicket" style="height:32px">✕</button></div>
      <div class="lines">
        ${
          lines.length
            ? lines
                .map(
                  (l) => `<div class="line"><div><b>${esc(l.name)}</b></div>
                <div class="qty"><button data-dec="${esc(l.key)}">−</button><span class="num">${num(l.quantity)}</span><button data-inc="${esc(l.key)}">+</button></div>
                ${l.options.length || l.note ? `<div class="opts">${esc(l.options.map((o) => o.valueName).join(" · "))}${l.note ? ` « ${esc(l.note)} »` : ""}</div>` : ""}
                <div class="opts num" style="color:var(--fg);font-weight:700">${money(l.lineTotalCents)}</div></div>`,
                )
                .join("")
            : `<div class="empty">${t("empty")}</div>`
        }
      </div>
      <div class="foot">
        <input class="field" id="note" placeholder="${t("note")}" value="${esc(cart.note)}" maxlength="500">
        <div class="total"><span>${t("total")}</span><span class="num">${money(totals.totalCents)}</span></div>
        <div class="row" style="flex-wrap:nowrap">
          <button class="btn lg" style="flex:1" data-act="send" ${lines.length && !busy ? "" : "disabled"}>${t("send")}</button>
          <button class="btn primary lg" style="flex:1" data-act="pay" ${lines.length && !busy ? "" : "disabled"}>${t("payNow")}</button>
        </div>
      </div>
    </aside>
    <div class="mobile-bar"><button class="btn dark" data-act="openTicket"><span>${t("ticket")} · <span class="num">${num(count)}</span></span><span class="num">${money(totals.totalCents)}</span></button></div>
  </div>`;
}

function addLine(p, optionValueIds, quantity, note) {
  const key = `${p.id}|${[...optionValueIds].sort().join(",")}|${note.trim()}`;
  const same = cart.lines.find((l) => l.key === key);
  if (same) same.quantity = Math.min(99, same.quantity + quantity);
  else cart.lines.push({ key, productId: p.id, optionValueIds, quantity, note: note.trim() });
  saveCart();
  render();
}

function openOptions(p) {
  if (!p.optionGroups.length) return addLine(p, [], 1, "");
  const chosen = new Set(p.optionGroups.flatMap((g) => g.values.filter((v) => v.isDefault && v.isAvailable).map((v) => v.id)));
  let qty = 1;
  const draw = () => {
    const built = buildLine(p, cart.channel, [...chosen], qty, "", categoryOf(p));
    modal.innerHTML = `<div class="sheet"><h3>${esc(p.name)}</h3>
      ${p.optionGroups
        .map(
          (g) => `<div class="group"><h4>${esc(g.name)} <small>${g.minSelect ? t("required") : ""} ${g.maxSelect > 1 ? t("upTo", { n: g.maxSelect }) : ""}</small></h4>
          ${g.values
            .map(
              (v) => `<div class="opt" role="checkbox" tabindex="0" data-opt="${esc(v.id)}" data-group="${esc(g.id)}" aria-checked="${chosen.has(v.id)}" ${v.isAvailable ? "" : 'aria-disabled="true" style="opacity:.45"'}>
                <span>${esc(v.name)}</span><span class="num muted">${v.priceDeltaCents ? `+${money(v.priceDeltaCents)}` : ""}</span></div>`,
            )
            .join("")}</div>`,
        )
        .join("")}
      <input class="field" id="optNote" placeholder="${t("note")}" maxlength="280">
      <div class="row" style="justify-content:space-between">
        <div class="qty"><button data-q="-1">−</button><span class="num">${num(qty)}</span><button data-q="1">+</button></div>
        <div class="row"><button class="btn" data-close>${t("cancel")}</button>
        <button class="btn primary" data-ok ${built.line ? "" : "disabled"}>${t("add")} · <span class="num">${built.line ? money(built.line.lineTotalCents) : ""}</span></button></div>
      </div></div>`;
  };
  draw();
  modal.classList.remove("hidden");
  modal.onclick = (e) => {
    const opt = e.target.closest("[data-opt]");
    if (opt && opt.getAttribute("aria-disabled") !== "true") {
      const g = p.optionGroups.find((x) => x.id === opt.dataset.group);
      const id = opt.dataset.opt;
      if (chosen.has(id)) chosen.delete(id);
      else {
        // Single choice: picking one replaces the other.
        if (g.maxSelect === 1) for (const v of g.values) chosen.delete(v.id);
        if (g.values.filter((v) => chosen.has(v.id)).length < g.maxSelect) chosen.add(id);
      }
      const note = document.getElementById("optNote")?.value ?? "";
      draw();
      document.getElementById("optNote").value = note;
      return;
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      qty = Math.min(99, Math.max(1, qty + Number(q.dataset.q)));
      const note = document.getElementById("optNote")?.value ?? "";
      draw();
      document.getElementById("optNote").value = note;
      return;
    }
    if (e.target.closest("[data-ok]")) {
      const note = document.getElementById("optNote").value;
      closeModal();
      return addLine(p, [...chosen], qty, note);
    }
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  };
}

function closeModal() {
  modal.classList.add("hidden");
  modal.innerHTML = "";
  modal.onclick = null;
}

function chooseTable() {
  const busyNow = busyTables();
  modal.innerHTML = `<div class="sheet"><h3>${t("chooseTable")}</h3><div class="tables">
    ${data.snapshot.tables
      .map(
        (x) => `<button data-table="${esc(x.id)}" aria-pressed="${x.id === cart.tableId}">${esc(x.label)}${busyNow.has(x.id) ? `<small>${t("tableBusy")}</small>` : ""}</button>`,
      )
      .join("")}</div><button class="btn" data-close>${t("cancel")}</button></div>`;
  modal.classList.remove("hidden");
  modal.onclick = (e) => {
    const b = e.target.closest("[data-table]");
    if (b) {
      cart.tableId = b.dataset.table;
      saveCart();
      closeModal();
      return render();
    }
    if (e.target === modal || e.target.closest("[data-close]")) closeModal();
  };
}

/** Payment sheet: method, cash received, change. Resolves with the payment or null. */
function askPayment(totalCents) {
  return new Promise((resolve) => {
    const methods = data.snapshot.payments?.length ? data.snapshot.payments : ["cash"];
    let method = methods[0];
    const draw = () => {
      const tendered = parseMoney(document.getElementById("tendered")?.value ?? "", data.snapshot.restaurant.currency);
      modal.innerHTML = `<div class="sheet"><h3>${t("payNow")}</h3>
        <div class="big num" style="text-align:center">${money(totalCents)}</div>
        <div class="pay">${methods.map((m) => `<button data-m="${m}" aria-pressed="${m === method}">${t(m)}</button>`).join("")}</div>
        ${
          method === "cash"
            ? `<label class="muted" for="tendered">${t("tendered")}</label><input class="field num" id="tendered" inputmode="numeric" dir="ltr" value="${
                tendered != null ? esc(document.getElementById("tendered")?.value ?? "") : ""
              }">
               <div class="total"><span>${t("change")}</span><span class="num" id="change">${tendered != null && tendered >= totalCents ? money(tendered - totalCents) : "—"}</span></div>`
            : ""
        }
        <div class="row" style="justify-content:flex-end"><button class="btn" data-close>${t("cancel")}</button><button class="btn primary lg" data-ok>${t("confirmPay")}</button></div></div>`;
      document.getElementById("tendered")?.addEventListener("input", (e) => {
        const v = parseMoney(e.target.value, data.snapshot.restaurant.currency);
        document.getElementById("change").textContent = v != null && v >= totalCents ? money(v - totalCents) : "—";
      });
    };
    draw();
    modal.classList.remove("hidden");
    modal.onclick = (e) => {
      const m = e.target.closest("[data-m]");
      if (m) {
        method = m.dataset.m;
        return draw();
      }
      if (e.target.closest("[data-ok]")) {
        const raw = document.getElementById("tendered")?.value ?? "";
        const tendered = raw ? parseMoney(raw, data.snapshot.restaurant.currency) : null;
        if (raw && (tendered == null || tendered < totalCents)) {
          document.getElementById("tendered").focus();
          return;
        }
        closeModal();
        return resolve({ provider: method, tenderedCents: method === "cash" ? tendered : null });
      }
      if (e.target === modal || e.target.closest("[data-close]")) {
        closeModal();
        resolve(null);
      }
    };
  });
}

async function submit(withPayment) {
  if (cart.channel === "dine_in" && !cart.tableId) return chooseTable();
  const totals = totalsOf(pricedLines(), data.snapshot.restaurant.pricesIncludeTax);
  const payment = withPayment ? await askPayment(totals.totalCents) : null;
  if (withPayment && !payment) return;
  busy = true;
  render();
  try {
    const order = await api("/api/orders", {
      channel: cart.channel,
      tableId: cart.channel === "dine_in" ? cart.tableId : null,
      staffUserId: pref("staff") || null,
      note: document.getElementById("note")?.value ?? cart.note,
      lines: cart.lines.map((l) => ({ productId: l.productId, optionValueIds: l.optionValueIds, quantity: l.quantity, note: l.note })),
      payment,
    });
    cart = { channel: cart.channel, tableId: null, lines: [], note: "" };
    saveCart();
    ticketOpen = false;
    toast(t("sentOk", { n: order.localNumber }));
  } catch (e) {
    toast(t("errorGeneric", { e: e.message }), true);
  } finally {
    busy = false;
    await load();
  }
}

// ─── Orders list ─────────────────────────────────────────────────────────────

const statusLabel = (s) => t(`status${s[0].toUpperCase()}${s.slice(1)}`);
const NEXT = { accepted: "ready", preparing: "ready", ready: "served" };

function orderCard(o) {
  const editable = !o.syncedAt;
  const items = o.lines
    .map((l) => `<li>${num(l.quantity)} × ${esc(l.name)}${l.options.length ? ` <span>${esc(l.options.map((x) => x.valueName).join(" · "))}</span>` : ""}</li>`)
    .join("");
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(o.placedAt));
  return `<article class="card ocard">
    <div class="top2"><div><div class="no num" dir="ltr">${esc(o.localNumber)}</div>
      <div class="muted" style="font-size:13px">${o.channel === "takeaway" ? t("takeaway") : esc(t("table", { t: o.tableLabel ?? "—" }))} · ${time}${o.staffName ? ` · ${esc(o.staffName)}` : ""}</div></div>
      <span class="st ${o.status}">${statusLabel(o.status)}</span></div>
    <ul>${items}</ul>
    <div class="total" style="font-size:16px"><span>${o.payment ? t("paid") : t("unpaid")}</span><span class="num">${money(o.totalCents)}</span></div>
    ${o.printErrors?.length ? `<div class="warnline">${esc(t("printFailed", { p: o.printErrors.join("، ") }))}</div>` : ""}
    ${o.syncedAt ? `<div class="muted" style="font-size:13px">✓ ${esc(t("synced", { n: o.cloudNumber ?? "" }))}</div>` : o.syncError ? `<div class="warnline">${esc(t("syncError", { e: o.syncError }))}</div>` : `<div class="muted" style="font-size:13px">${t("waitingSync")}</div>`}
    <div class="acts">
      ${editable && !o.payment && o.status !== "cancelled" ? `<button class="btn primary" data-pay="${o.id}">${t("payNow")}</button>` : ""}
      ${editable && NEXT[o.status] ? `<button class="btn dark" data-status="${o.id}" data-to="${NEXT[o.status]}">${t(NEXT[o.status] === "ready" ? "toReady" : "toServed")}</button>` : ""}
      <button class="btn" data-print="${o.id}" data-kind="kitchen">${t("reprintKitchen")}</button>
      <button class="btn" data-print="${o.id}" data-kind="bill">${t("reprintBill")}</button>
      ${editable && !o.payment && !["served", "cancelled"].includes(o.status) ? `<button class="btn danger" data-cancel="${o.id}" data-no="${esc(o.localNumber)}">${t("toCancel")}</button>` : ""}
    </div></article>`;
}

function ordersScreen() {
  const list = [...data.orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  const open = list.filter((o) => ["accepted", "preparing", "ready"].includes(o.status) || (!o.payment && o.status === "served" && !o.syncedAt));
  const done = list.filter((o) => !open.includes(o));
  return `<div class="orders">
    <h2 class="sec">${t("open")} · <span class="num">${num(open.length)}</span></h2>
    ${open.length ? `<div class="cards">${open.map(orderCard).join("")}</div>` : `<div class="empty">${t("noOrders")}</div>`}
    ${done.length ? `<h2 class="sec">${t("done")}</h2><div class="cards">${done.map(orderCard).join("")}</div>` : ""}
  </div>`;
}

// ─── Kitchen display ─────────────────────────────────────────────────────────

function kitchenScreen() {
  const s = data.snapshot;
  const active = data.orders
    .filter((o) => ["accepted", "preparing", "ready"].includes(o.status))
    .sort((a, b) => a.placedAt.localeCompare(b.placedAt));
  const now = Date.now();
  const cards = active
    .map((o) => {
      const lines = station === "all" ? o.lines : o.lines.filter((l) => l.stationId === station);
      if (!lines.length) return "";
      const min = Math.max(0, Math.floor((now - Date.parse(o.placedAt)) / 60_000));
      return `<article class="kcard ${o.status !== "ready" && min >= 20 ? "late" : o.status !== "ready" && min >= 10 ? "warn" : ""}">
        <div class="top2" style="display:flex;justify-content:space-between;gap:8px"><div><div class="no num" dir="ltr">${esc(o.localNumber)}</div>
          <div style="color:#aab2bf;font-size:14px">${o.channel === "takeaway" ? t("takeaway") : esc(t("table", { t: o.tableLabel ?? "—" }))}</div></div>
          <div style="text-align:end"><span class="st ${o.status}">${statusLabel(o.status)}</span><div class="num" style="margin-top:6px;font-weight:800">${t("min", { n: num(min) })}</div></div></div>
        <ul>${lines
          .map(
            (l) => `<li>${num(l.quantity)} × ${esc(l.name)}${l.options.length ? `<span>${esc(l.options.map((x) => x.valueName).join(" · "))}</span>` : ""}${l.note ? `<em>↳ ${esc(l.note)}</em>` : ""}</li>`,
          )
          .join("")}</ul>
        ${o.note ? `<div class="warnline">${esc(o.note)}</div>` : ""}
        ${
          !o.syncedAt
            ? `<div class="row">${o.status === "accepted" ? `<button class="btn" data-status="${o.id}" data-to="preparing">${t("toPreparing")}</button>` : ""}
          ${o.status !== "ready" ? `<button class="btn primary lg" style="flex:1" data-status="${o.id}" data-to="ready">${t("toReady")}</button>` : `<button class="btn lg" style="flex:1" data-status="${o.id}" data-to="served">${t("toServed")}</button>`}</div>`
            : ""
        }
      </article>`;
    })
    .join("");
  return `<div class="kds">
    <div class="scroll" style="margin-bottom:12px">
      <button class="chip" data-station="all" aria-pressed="${station === "all"}">${t("all")}</button>
      ${(s.stations ?? []).map((x) => `<button class="chip" data-station="${esc(x.id)}" aria-pressed="${station === x.id}">${esc(x.name)}</button>`).join("")}
    </div>
    ${cards.trim() ? `<div class="cards">${cards}</div>` : `<div class="empty" style="color:#aab2bf">${t("noOrders")}</div>`}
  </div>`;
}

// ─── Events ──────────────────────────────────────────────────────────────────

app.addEventListener("click", async (e) => {
  const el = e.target.closest("button, [data-cat]");
  if (!el) return;
  const d = el.dataset;
  if (d.channel) {
    cart.channel = d.channel;
    saveCart();
    return render();
  }
  if (d.cat) {
    category = d.cat;
    pref("category", category);
    return render();
  }
  if (d.station) {
    station = d.station;
    pref("station", station);
    return render();
  }
  if (d.add) return openOptions(product(d.add));
  if (d.inc || d.dec) {
    const l = cart.lines.find((x) => x.key === (d.inc ?? d.dec));
    if (!l) return;
    l.quantity += d.inc ? 1 : -1;
    if (l.quantity <= 0) cart.lines = cart.lines.filter((x) => x !== l);
    saveCart();
    return render();
  }
  if (d.act === "tables") return chooseTable();
  if (d.act === "openTicket" || d.act === "closeTicket") {
    ticketOpen = d.act === "openTicket";
    return render();
  }
  if (d.act === "send") return submit(false);
  if (d.act === "pay") return submit(true);
  try {
    if (d.pay) {
      const o = data.orders.find((x) => x.id === d.pay);
      const payment = await askPayment(o.totalCents);
      if (payment) await api(`/api/orders/${d.pay}/pay`, payment);
    } else if (d.status) await api(`/api/orders/${d.status}/status`, { status: d.to });
    else if (d.cancel) {
      if (!confirm(t("cancelConfirm", { n: d.no }))) return;
      await api(`/api/orders/${d.cancel}/status`, { status: "cancelled" });
    } else if (d.print) {
      const { failed } = await api(`/api/orders/${d.print}/print`, { kind: d.kind });
      toast(failed.length ? t("printFailed", { p: failed.join("، ") }) : "✓", failed.length > 0);
    }
  } catch (err) {
    toast(t("errorGeneric", { e: err.message }), true);
  }
  await load();
});
app.addEventListener("input", (e) => {
  if (e.target.id === "note") {
    cart.note = e.target.value;
    saveCart();
  }
});
window.addEventListener("hashchange", render);
// The kitchen timers move on their own.
setInterval(() => route() === "kitchen" && data?.snapshot && render(), 30_000);

await load();
if (data) listen();
