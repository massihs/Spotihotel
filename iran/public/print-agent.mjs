#!/usr/bin/env node
/**
 * Spotifood print agent — forwards kitchen, bar and till tickets to the network printers of
 * the restaurant (ESC/POS, usually port 9100). Run it on any computer of the restaurant's
 * network that stays on (the till PC, a mini PC, a Raspberry Pi). Node.js 18+, no install.
 *
 *   node print-agent.mjs <server address> <agent token>
 *   e.g. node print-agent.mjs https://spotifood.ir 01a1…xyz
 *
 * The token comes from Settings → Printers → "Connect the print agent".
 */
import net from "node:net";

const [server = process.env.SPOTIFOOD_URL, token = process.env.SPOTIFOOD_PRINT_TOKEN] = process.argv.slice(2);
if (!server || !token) {
  console.error("Usage: node print-agent.mjs <server address> <agent token>");
  process.exit(1);
}
const base = server.replace(/\/+$/, "");
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

/** Sends raw bytes to a printer and resolves once they are flushed. */
function send(host, port, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port, timeout: 8000 }, () => {
      socket.end(data, () => resolve());
    });
    socket.on("timeout", () => socket.destroy(new Error("timeout")));
    socket.on("error", reject);
  });
}

async function ack(id, ok, error) {
  await fetch(`${base}/api/v1/print/agent/jobs/${id}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ok, error }),
  }).catch(() => {});
}

log(`Spotifood print agent → ${base}`);
let backoff = 2000;
for (;;) {
  try {
    const res = await fetch(`${base}/api/v1/print/agent/jobs`, { headers });
    if (res.status === 401) {
      log("Token refused: create a new one in Settings → Printers.");
      await sleep(30000);
      continue;
    }
    if (!res.ok) throw new Error(`server ${res.status}`);
    const { jobs } = await res.json();
    for (const job of jobs) {
      try {
        await send(job.host, job.port, Buffer.from(job.data, "base64"));
        log(`printed on ${job.host}:${job.port}`);
        await ack(job.id, true);
      } catch (e) {
        log(`printer ${job.host}:${job.port} unreachable: ${e.message}`);
        await ack(job.id, false, String(e.message));
      }
    }
    backoff = 2000;
    await sleep(jobs.length ? 300 : 2000);
  } catch (e) {
    log(`connection problem (${e.message}), retrying…`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 30000);
  }
}
