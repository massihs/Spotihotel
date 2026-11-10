import net from "node:net";

const HEALTH_EVERY = 8_000;
const SNAPSHOT_EVERY = 5 * 60_000;
const FRONTDESK_EVERY = 2 * 60_000;
/** Two failed checks in a row before calling it an outage: one lost packet is not a cut. */
const FAILS_FOR_OFFLINE = 2;

/** Raw bytes to a network printer (ESC/POS, usually port 9100). */
export function sendToPrinter(host, port, data, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout }, () => socket.end(data, () => resolve()));
    socket.on("timeout", () => socket.destroy(new Error("timeout")));
    socket.on("error", reject);
  });
}

/**
 * Keeps the desktop app in step with the website: watches the connection, refreshes the menu
 * copy and (hotels) the front desk copy, sends the orders taken offline as soon as the internet
 * is back, and prints the website's kitchen tickets (it replaces the separate print agent).
 */
export function createSync({ hub, getConfig, version, onChange = () => {}, log = () => {}, fetchImpl = fetch }) {
  let fails = 0;
  let lastSnapshot = 0;
  let lastFrontdesk = 0;
  let lastHealth = 0;
  let timer = null;
  let printing = false;
  let stopped = false;

  const base = () => getConfig().serverUrl.replace(/\/+$/, "");
  const headers = () => ({
    authorization: `Bearer ${getConfig().deviceToken}`,
    "content-type": "application/json",
    "x-app-version": version,
  });
  const call = async (path, init = {}, ms = 15_000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetchImpl(`${base()}${path}`, { ...init, headers: { ...headers(), ...init.headers }, signal: ctrl.signal });
    } finally {
      clearTimeout(t);
    }
  };

  async function checkHealth() {
    try {
      const res = await call("/api/health", {}, 6_000);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function refreshSnapshot() {
    const res = await call("/api/v1/offline/snapshot");
    if (res.status === 401) {
      hub.setStatus({ lastError: "device_revoked" });
      onChange({ revoked: true });
      return false;
    }
    if (!res.ok) throw new Error(`snapshot ${res.status}`);
    const snap = await res.json();
    if (snap.version > 1) throw new Error("app_too_old");
    hub.setSnapshot(snap);
    lastSnapshot = Date.now();
    if (snap.restaurant?.kind === "hotel") await refreshFrontdesk().catch((e) => log(`frontdesk: ${e.message}`));
    return true;
  }

  /** Hotels: the front desk copy (rooms, guests in house, arrivals, departures, balances). */
  async function refreshFrontdesk() {
    const res = await call("/api/v1/offline/frontdesk", {}, 30_000);
    if (!res.ok) throw new Error(`frontdesk ${res.status}`);
    const copy = await res.json();
    if (copy.version > 1) throw new Error("app_too_old");
    hub.setFrontdesk(copy);
    lastFrontdesk = Date.now();
  }

  /** Sends what was taken offline, in batches; each order is idempotent on the website. */
  async function pushOrders() {
    let sent = 0;
    for (;;) {
      const batch = hub.beginSync(50);
      if (!batch.length) return sent;
      hub.setStatus({ syncing: true });
      let results;
      try {
        const res = await call(
          "/api/v1/offline/orders",
          {
            method: "POST",
            body: JSON.stringify({
              orders: batch.map((o) => ({
                ref: o.id,
                localNumber: o.localNumber,
                placedAt: o.placedAt,
                channel: o.channel,
                tableId: o.tableId,
                staffUserId: o.staffUserId,
                status: o.status,
                note: o.note,
                customerPhone: o.customerPhone,
                discountCents: o.discountCents,
                lines: o.lines,
                payment: o.payment,
              })),
            }),
          },
          60_000,
        );
        if (!res.ok) throw new Error(`orders ${res.status}`);
        results = (await res.json()).results;
      } catch (e) {
        hub.abortSync();
        hub.setStatus({ syncing: false, lastError: e.message });
        throw e;
      }
      hub.markSynced(results);
      sent += results.filter((r) => r.ok).length;
      hub.setStatus({ syncing: false, lastSyncAt: new Date().toISOString(), lastError: null });
      // Orders the website refused stay here with their reason; do not loop on them.
      if (results.some((r) => !r.ok)) return sent;
    }
  }

  /** The website's print queue (orders placed online), forwarded to the network printers. */
  async function printCloudJobs() {
    if (printing) return true;
    printing = true;
    try {
      const res = await call("/api/v1/print/agent/jobs", {}, 8_000);
      if (!res.ok) return res.status < 500;
      const { jobs } = await res.json();
      for (const job of jobs) {
        let ok = true;
        let error;
        try {
          await sendToPrinter(job.host, job.port, Buffer.from(job.data, "base64"));
        } catch (e) {
          ok = false;
          error = String(e.message);
          log(`printer ${job.host}:${job.port} unreachable: ${error}`);
        }
        await call(`/api/v1/print/agent/jobs/${job.id}`, { method: "POST", body: JSON.stringify({ ok, error }) }).catch(() => {});
      }
      return true;
    } catch {
      return false;
    } finally {
      printing = false;
    }
  }

  async function tick() {
    if (stopped || !getConfig().deviceToken) return schedule();
    // While online, the print queue poll is the heartbeat; the health check settles doubts.
    let up = hub.status.online && Date.now() - lastHealth < HEALTH_EVERY ? await printCloudJobs() : false;
    if (!up) {
      up = await checkHealth();
      lastHealth = Date.now();
    }
    const wasOnline = hub.status.online;
    fails = up ? 0 : fails + 1;
    const online = up || (wasOnline && fails < FAILS_FOR_OFFLINE);
    if (online !== wasOnline) {
      hub.setStatus({ online });
      onChange({ online });
      log(online ? "internet back" : "internet lost");
    }
    if (up) {
      try {
        if (hub.pending().length) {
          const n = await pushOrders();
          if (n) onChange({ synced: n });
        }
        if (Date.now() - lastSnapshot > SNAPSHOT_EVERY) await refreshSnapshot();
        // Guests come and go all day: the front desk copy is kept fresher than the menu.
        else if (hub.snapshot?.restaurant?.kind === "hotel" && Date.now() - lastFrontdesk > FRONTDESK_EVERY)
          await refreshFrontdesk();
      } catch (e) {
        log(`sync: ${e.message}`);
      }
    }
    schedule();
  }
  const schedule = () => {
    if (!stopped) timer = setTimeout(tick, hub.status.online ? 2_500 : 5_000);
  };

  return {
    start() {
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
    refreshSnapshot,
    refreshFrontdesk,
    pushOrders,
    /** "Sync now" button. */
    async now() {
      lastSnapshot = 0;
      lastFrontdesk = 0;
      clearTimeout(timer);
      await tick();
    },
  };
}
