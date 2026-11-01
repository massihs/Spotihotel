import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ACTIVE, buildLine, totalsOf } from "../offline/model.js";
import { labelsFor, ticketsFor } from "./tickets.js";

export const HUB_PORT = 7420;
const COOKIE = "sfhub";
const MAX_BODY = 256 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const sha = (s) => createHash("sha256").update(s).digest("hex");
const localDay = (d, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);

/** This PC's addresses on the restaurant's network, for the waiters' phones. */
export function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

/**
 * The restaurant's local server while the internet is down (and, on demand, while it is up):
 * the till PC, the waiters' phones and the kitchen screen on the same Wi-Fi share one list of
 * orders kept on this PC, and the tickets go straight to the network printers.
 *
 * Devices other than this PC join with the 6-digit code shown on it; their key is a cookie.
 */
export function createHub({
  store,
  staticDir,
  appDir = null,
  deliver,
  localPrinters = () => [],
  now = () => new Date(),
  log = () => {},
}) {
  let snapshot = store.read("snapshot", null);
  let orders = store.read("orders", []);
  const local = store.read("hub", {});
  local.pairCode ??= String(randomInt(100000, 1000000));
  local.keys ??= [];
  store.write("hub", local);
  /** This PC's own window: a key that never leaves the machine. */
  const ownKey = randomBytes(24).toString("base64url");
  const clients = new Set();
  let status = { online: false, lastSyncAt: null, syncing: false, lastError: null };

  const saveOrders = () => store.write("orders", orders);
  const broadcast = (type, data = {}) => {
    const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  };

  const labels = () => labelsFor(snapshot?.restaurant.defaultLocale ?? "fa");

  /** Prints and remembers what failed, so the screens can offer a reprint. */
  async function print(order, event) {
    if (!snapshot) return;
    // The website's network printers, plus the ones plugged into this PC.
    const jobs = ticketsFor(order, { ...snapshot, printers: [...(snapshot.printers ?? []), ...localPrinters()] }, event, labels());
    const failed = [];
    await Promise.all(
      jobs.map(async ({ printer, ticket }) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await deliver(printer, ticket);
            log(`printed ${ticket.kind} ${order.localNumber} on ${printer.name}`);
            return;
          } catch (e) {
            if (attempt === 2) {
              failed.push(printer.name);
              log(`print failed on ${printer.name}: ${e.message}`);
            } else await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
          }
        }
      }),
    );
    const o = orders.find((x) => x.id === order.id);
    if (o) {
      // The paid receipt must not hide a kitchen ticket that did not print.
      o.printErrors = event === "paid" ? [...new Set([...(o.printErrors ?? []), ...failed])] : failed;
      saveOrders();
      broadcast("orders");
    }
    return failed;
  }

  function nextNumber() {
    const tz = snapshot?.restaurant.timezone ?? "Asia/Tehran";
    const day = localDay(now(), tz);
    if (local.counterDay !== day) {
      local.counterDay = day;
      local.counter = 0;
    }
    local.counter += 1;
    store.write("hub", local);
    // Latin digits: the number is read aloud and typed, like the website's "B-1042".
    return `H-${local.counter}`;
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  function createOrder(input) {
    if (!snapshot) throw httpError(409, "no_snapshot");
    const channel = input.channel === "dine_in" ? "dine_in" : "takeaway";
    const table = channel === "dine_in" ? snapshot.tables.find((t) => t.id === input.tableId) : null;
    if (channel === "dine_in" && !table) throw httpError(400, "table_required");
    if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 100)
      throw httpError(400, "empty");
    const lines = [];
    for (const l of input.lines) {
      const product = snapshot.products.find((p) => p.id === l.productId);
      if (product && !product.isAvailable) throw httpError(409, "product_unavailable");
      const category = snapshot.categories.find((c) => c.id === product?.categoryId) ?? null;
      const built = buildLine(product, channel, Array.isArray(l.optionValueIds) ? l.optionValueIds : [], Number(l.quantity), l.note, category);
      if (built.error) throw httpError(400, built.error);
      lines.push(built.line);
    }
    const staff = snapshot.staff.find((s) => s.userId === input.staffUserId) ?? null;
    const totals = totalsOf(lines, snapshot.restaurant.pricesIncludeTax, Number(input.discountCents) || 0);
    const order = {
      id: randomUUID(),
      localNumber: nextNumber(),
      placedAt: now().toISOString(),
      channel,
      tableId: table?.id ?? null,
      tableLabel: table?.label ?? null,
      staffUserId: staff?.userId ?? null,
      staffName: staff?.name ?? null,
      status: "accepted",
      note: String(input.note ?? "").slice(0, 500),
      customerPhone: String(input.customerPhone ?? "").slice(0, 32),
      lines,
      ...totals,
      payment: null,
      printErrors: [],
      syncedAt: null,
      cloudNumber: null,
      syncError: null,
      updatedAt: now().toISOString(),
    };
    orders.push(order);
    if (input.payment) pay(order, input.payment, false);
    saveOrders();
    broadcast("orders", { created: order.id });
    // Kitchen and bar first, then the paid receipt.
    void print(order, "created").then(() => (order.payment ? print(order, "paid") : null));
    return order;
  }

  function editable(id) {
    const o = orders.find((x) => x.id === id);
    if (!o) throw httpError(404, "not_found");
    if (o.syncedAt) throw httpError(409, "already_synced");
    // Being sent right now: a change would not reach the website.
    if (o.syncing) throw httpError(409, "syncing");
    return o;
  }

  function pay(order, p, reprint = true) {
    if (order.payment) throw httpError(409, "already_paid");
    if (order.status === "cancelled") throw httpError(409, "cancelled");
    const methods = snapshot?.payments?.length ? snapshot.payments : ["cash"];
    const provider = methods.includes(p?.provider) ? p.provider : null;
    if (!provider) throw httpError(400, "payment_method");
    const tendered = p.tenderedCents == null || p.tenderedCents === "" ? null : Number(p.tenderedCents);
    if (tendered != null && (!Number.isInteger(tendered) || tendered < order.totalCents))
      throw httpError(400, "tendered_too_low");
    order.payment = { provider, tenderedCents: tendered, at: now().toISOString() };
    order.updatedAt = now().toISOString();
    if (reprint) {
      saveOrders();
      broadcast("orders");
      void print(order, "paid");
    }
    return order;
  }

  const FLOW = { accepted: ["preparing", "ready", "served", "cancelled"], preparing: ["ready", "served", "cancelled"], ready: ["served", "cancelled"], served: [] };
  function setStatus(id, to) {
    const o = editable(id);
    if (!FLOW[o.status]?.includes(to)) throw httpError(409, "invalid_transition");
    if (to === "cancelled" && o.payment) throw httpError(409, "paid");
    o.status = to;
    o.updatedAt = now().toISOString();
    saveOrders();
    broadcast("orders");
    return o;
  }

  /** Orders still to send to the cloud, oldest first. */
  const pending = () => orders.filter((o) => !o.syncedAt).sort((a, b) => a.placedAt.localeCompare(b.placedAt));

  /** Freezes the orders about to be sent (edits wait until the website has answered). */
  function beginSync(limit = 100) {
    const batch = pending().slice(0, limit);
    for (const o of batch) o.syncing = true;
    return batch.map(({ syncing: _s, printErrors: _p, ...o }) => o);
  }

  /** The cloud answered for these orders: they become read-only here. */
  function markSynced(results) {
    for (const o of orders) o.syncing = false;
    for (const r of results) {
      const o = orders.find((x) => x.id === r.ref);
      if (!o) continue;
      if (r.ok) {
        o.syncedAt = now().toISOString();
        o.cloudNumber = r.number;
        o.syncError = null;
      } else o.syncError = r.error;
    }
    // Keep two days of synced orders on screen; older ones only take room.
    const cutoff = now().getTime() - 2 * 86_400_000;
    orders = orders.filter((o) => !o.syncedAt || Date.parse(o.placedAt) > cutoff);
    saveOrders();
    broadcast("orders");
  }

  // ─── HTTP ──────────────────────────────────────────────────────────────────

  function httpError(status, code) {
    return Object.assign(new Error(code), { status, code });
  }
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
    res.end(JSON.stringify(body));
  };
  const cookieKey = (req) => /(?:^|;\s*)sfhub=([A-Za-z0-9_-]+)/.exec(req.headers.cookie ?? "")?.[1] ?? null;
  const authorized = (req) => {
    const k = cookieKey(req);
    return !!k && (k === ownKey || local.keys.includes(sha(k)));
  };
  const setKey = (key) => `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`;

  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw httpError(413, "too_large");
      chunks.push(c);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      throw httpError(400, "invalid_json");
    }
  }

  function state() {
    const today = now().getTime() - 24 * 3600_000;
    return {
      snapshot,
      status: { ...status, pending: pending().length },
      orders: orders.filter((o) => !o.syncedAt || Date.parse(o.placedAt) > today),
      addresses: lanAddresses().map((a) => `http://${a}:${HUB_PORT}`),
    };
  }

  function serveStatic(req, res, pathname, dir = staticDir) {
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.join(dir, path.normalize(rel));
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (dir !== staticDir) return send(res, 404, { error: "not_found" });
      // Screens are routed client-side.
      return serveStatic(req, res, "/");
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    });
    fs.createReadStream(file).pipe(res);
  }

  async function route(req, res) {
    const url = new URL(req.url, "http://hub");
    const p = url.pathname;
    // This PC's own screens (status bar, setup): never served to the network.
    if (p.startsWith("/_app/")) {
      const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);
      if (!appDir || !loopback) return send(res, 404, { error: "not_found" });
      return serveStatic(req, res, p.slice("/_app".length), appDir);
    }
    if (!p.startsWith("/api/")) {
      // This PC opens the hub with its key once; the cookie does the rest.
      const k = url.searchParams.get("k");
      if (k && k === ownKey) {
        res.writeHead(302, { location: p, "set-cookie": setKey(ownKey) });
        return res.end();
      }
      return serveStatic(req, res, p);
    }
    if (p === "/api/pair" && req.method === "POST") {
      const { code } = await body(req);
      // Slow down guessing: a wrong code costs a second.
      if (String(code ?? "").trim() !== local.pairCode) {
        await new Promise((r) => setTimeout(r, 1000));
        throw httpError(403, "wrong_code");
      }
      const key = randomBytes(24).toString("base64url");
      local.keys = [...local.keys.slice(-49), sha(key)];
      store.write("hub", local);
      return send(res, 200, { ok: true }, { "set-cookie": setKey(key) });
    }
    if (!authorized(req)) throw httpError(401, "pair_required");

    if (p === "/api/state" && req.method === "GET") return send(res, 200, state());
    if (p === "/api/events" && req.method === "GET") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("retry: 2000\n\n");
      clients.add(res);
      const ping = setInterval(() => res.write(": ping\n\n"), 20_000);
      req.on("close", () => {
        clearInterval(ping);
        clients.delete(res);
      });
      return;
    }
    if (p === "/api/orders" && req.method === "POST") return send(res, 201, createOrder(await body(req)));
    const m = /^\/api\/orders\/([0-9a-f-]{36})\/(status|pay|print)$/.exec(p);
    if (m && req.method === "POST") {
      const input = await body(req);
      if (m[2] === "status") return send(res, 200, setStatus(m[1], input.status));
      if (m[2] === "pay") return send(res, 200, pay(editable(m[1]), input));
      const o = orders.find((x) => x.id === m[1]);
      if (!o) throw httpError(404, "not_found");
      const failed = await print(o, input.kind === "bill" ? "reprint-bill" : "reprint-kitchen");
      return send(res, 200, { failed });
    }
    throw httpError(404, "not_found");
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (!e.status) log(`hub error: ${e.stack ?? e}`);
      if (!res.headersSent) send(res, e.status ?? 500, { error: e.code ?? "internal" });
      else res.end();
    });
  });

  return {
    server,
    ownKey,
    get pairCode() {
      return local.pairCode;
    },
    /** A new code: phones already paired stay paired. */
    newPairCode() {
      local.pairCode = String(randomInt(100000, 1000000));
      store.write("hub", local);
      return local.pairCode;
    },
    /** Forgets every paired phone (lost phone, staff left). */
    unpairAll() {
      local.keys = [];
      store.write("hub", local);
    },
    listen(port = HUB_PORT, host = "0.0.0.0") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve(server.address().port));
      });
    },
    close() {
      // Live screens keep their event stream open: drop them, or closing waits forever.
      for (const res of clients) res.end();
      server.closeAllConnections?.();
      return new Promise((r) => server.close(r));
    },
    setSnapshot(s) {
      snapshot = s;
      store.write("snapshot", s);
      broadcast("snapshot");
    },
    get snapshot() {
      return snapshot;
    },
    setStatus(patch) {
      status = { ...status, ...patch };
      broadcast("status", { ...status, pending: pending().length });
    },
    get status() {
      return { ...status, pending: pending().length };
    },
    pending,
    beginSync,
    markSynced,
    /** The send failed (network): unfreeze, they go with the next attempt. */
    abortSync() {
      for (const o of orders) o.syncing = false;
    },
    /** Open (not sent yet) orders: the app keeps them local until the internet is back. */
    openCount: () => orders.filter((o) => !o.syncedAt && ACTIVE.includes(o.status)).length,
    // For tests.
    _createOrder: createOrder,
  };
}
