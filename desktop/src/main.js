import {
  app,
  BaseWindow,
  WebContentsView,
  dialog,
  ipcMain,
  Menu,
  net as enet,
  powerSaveBlocker,
  session,
  shell,
} from "electron";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHub, HUB_PORT, lanAddresses } from "./hub.js";
import { isVirtualPrinter } from "./escpos.js";
import { deliver, systemPrinters } from "./printer.js";
import { createStore } from "./store.js";
import { createSync } from "./sync.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const DEFAULT_SERVER = process.env.SPOTIFOOD_URL ?? "https://spotifood.ir";
const BAR_H = 44;
const UUID = /\/dashboard\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;

// A separate data folder (tests, or two restaurants on one PC).
if (process.env.SPOTIFOOD_DATA) app.setPath("userData", process.env.SPOTIFOOD_DATA);
if (!app.requestSingleInstanceLock()) app.quit();

const store = createStore(path.join(app.getPath("userData"), "data"));
let config = { serverUrl: DEFAULT_SERVER, localPrinters: [], ...store.read("config", {}) };
// Older versions could pick OneNote / "Print to PDF" as the ticket printer: drop them.
config.localPrinters = (config.localPrinters ?? []).filter((p) => !isVirtualPrinter(p.system));
store.write("config", config);
const saveConfig = (patch) => {
  config = { ...config, ...patch };
  store.write("config", config);
  pushState();
};
const log = (...a) => console.log(new Date().toISOString(), ...a);

let win = null;
let bar = null;
let content = null;
let hubPort = HUB_PORT;
/** "site" (the website) | "local" (offline screens) | "setup" | "settings" */
let mode = "setup";
let toast = null;

const hub = createHub({
  store,
  staticDir: path.join(root, "offline"),
  appDir: path.join(root, "setup"),
  deliver: (printer, ticket) =>
    deliver(printer, ticket, { rtl: ["fa", "ar"].includes(hub.snapshot?.restaurant.defaultLocale ?? "fa") }),
  localPrinters: () => config.localPrinters ?? [],
  log,
});

const sync = createSync({
  hub,
  version: app.getVersion(),
  getConfig: () => config,
  log,
  fetchImpl: (url, init) => enet.fetch(url, init),
  onChange(e) {
    if (e.online === false && mode === "site") showLocal();
    if (e.synced) flash("synced", { n: e.synced });
    if (e.online === true) flash("online");
    if (e.revoked) {
      saveConfig({ deviceToken: null, deviceId: null });
      flash("revoked");
    }
    pushState();
  },
});

// ─── Views ───────────────────────────────────────────────────────────────────

/** `screen` is a hash route ("#/kitchen"); the key logs this PC in once (cookie). */
const localUrl = (screen = "") => `http://127.0.0.1:${hubPort}/?k=${hub.ownKey}${screen}`;
const siteUrl = () => `${config.serverUrl.replace(/\/+$/, "")}/dashboard/${config.restaurantId ?? ""}`;

function layout() {
  if (!win) return;
  const { width, height } = win.getContentBounds();
  bar.setBounds({ x: 0, y: 0, width, height: BAR_H });
  content.setBounds({ x: 0, y: BAR_H, width, height: Math.max(0, height - BAR_H) });
}

function showSite() {
  mode = "site";
  void content.webContents.loadURL(config.lastUrl?.startsWith(config.serverUrl) ? config.lastUrl : siteUrl());
  pushState();
}
function showLocal(screen = "") {
  mode = "local";
  void content.webContents.loadURL(localUrl(screen));
  pushState();
}
/** First run: straight to the website's sign-in page (the address is rarely changed). */
function showSetup() {
  mode = "setup";
  void content.webContents.loadURL(`${config.serverUrl.replace(/\/+$/, "")}/login`);
  pushState();
}
/** The website could not be reached: offer to check its address. */
function showServerSetup() {
  mode = "setup";
  void content.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/index.html`);
  pushState();
}
function showSettings() {
  mode = "settings";
  void content.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/settings.html`);
  pushState();
}

function flash(key, values = {}) {
  toast = { key, values, at: Date.now() };
  pushState();
}

function state() {
  return {
    mode,
    linked: !!config.deviceToken,
    serverUrl: config.serverUrl,
    restaurantName: config.restaurantName ?? null,
    deviceName: config.deviceName ?? os.hostname(),
    status: hub.status,
    pairCode: hub.pairCode,
    addresses: lanAddresses().map((a) => `http://${a}:${hubPort}`),
    localPrinters: config.localPrinters ?? [],
    stations: hub.snapshot?.stations ?? [],
    locale: hub.snapshot?.restaurant.defaultLocale ?? config.locale ?? "fa",
    version: app.getVersion(),
    toast,
  };
}
function pushState() {
  for (const v of [bar, content]) if (v && !v.webContents.isDestroyed()) v.webContents.send("state", state());
}

/** After the manager signs in on the website: link this PC to the restaurant. */
async function link(restaurantId) {
  const name = config.deviceName ?? os.hostname();
  const res = await session.defaultSession.fetch(`${config.serverUrl.replace(/\/+$/, "")}/api/v1/offline/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ restaurantId, name: name.slice(0, 60) }),
  });
  if (res.status === 403) throw new Error("forbidden");
  if (!res.ok) throw new Error(`link ${res.status}`);
  const { device, restaurant } = await res.json();
  saveConfig({
    deviceToken: device.token,
    deviceId: device.id,
    deviceName: device.name,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
  });
  // A till PC: back on its own after a restart or a power cut.
  app.setLoginItemSettings({ openAtLogin: true });
  await sync.refreshSnapshot().catch((e) => log(`snapshot: ${e.message}`));
  sync.start();
  flash("linked", { name: restaurant.name });
}

function createWindow() {
  win = new BaseWindow({
    width: 1360,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "Spotifood",
    backgroundColor: "#f6f7f9",
    icon: path.join(root, "build", "icon.png"),
    autoHideMenuBar: true,
  });
  const prefs = {
    preload: path.join(here, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
  };
  bar = new WebContentsView({ webPreferences: prefs });
  // The website runs without any access to this PC; the local screens get the small bridge.
  content = new WebContentsView({ webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true } });
  win.contentView.addChildView(content);
  win.contentView.addChildView(bar);
  layout();
  win.on("resize", layout);
  win.on("closed", () => (win = null));
  void bar.webContents.loadURL(`http://127.0.0.1:${hubPort}/_app/bar.html`);

  const wc = content.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(config.serverUrl) || url.startsWith(`http://127.0.0.1:${hubPort}`)) {
      void wc.loadURL(url);
    } else void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("did-navigate", (_e, url) => onNavigate(url));
  wc.on("did-navigate-in-page", (_e, url) => onNavigate(url));
  wc.on("did-fail-load", (_e, code, _desc, url, isMain) => {
    // The website did not answer: go on with the local screens.
    if (isMain && mode === "setup" && code !== -3 && url.startsWith(config.serverUrl)) return showServerSetup();
    if (isMain && mode === "site" && code !== -3 && url.startsWith(config.serverUrl)) {
      hub.setStatus({ online: false });
      showLocal();
    }
  });

  if (config.deviceToken) showSite();
  else showSetup();
}

let asked = false;
function onNavigate(url) {
  if (mode === "site" && url.startsWith(config.serverUrl)) saveConfig({ lastUrl: url });
  const m = UUID.exec(url);
  if (!config.deviceToken && m && url.startsWith(config.serverUrl) && !asked) {
    asked = true;
    void dialog
      .showMessageBox({
        type: "question",
        buttons: ["OK", "×"],
        defaultId: 0,
        message: "Spotifood",
        detail: "Activer ce PC pour ce restaurant ? (mode hors ligne, impression locale)\nاین کامپیوتر برای این رستوران فعال شود؟",
      })
      .then(async ({ response }) => {
        if (response !== 0) return;
        try {
          await link(m[1]);
          mode = "site";
          pushState();
        } catch (e) {
          asked = false;
          flash(e.message === "forbidden" ? "forbidden" : "linkFailed");
        }
      });
  }
}

// ─── Bridge for the bar, setup and local screens ─────────────────────────────

/** Only this PC's own pages may drive the app (never the website or a phone). */
function trusted(e) {
  const url = e.senderFrame?.url ?? "";
  return url.startsWith(`http://127.0.0.1:${hubPort}/`);
}

ipcMain.handle("state", (e) => (trusted(e) ? state() : null));
ipcMain.handle("action", async (e, name, arg) => {
  if (!trusted(e)) throw new Error("forbidden");
  switch (name) {
    case "site":
      return config.deviceToken ? showSite() : showSetup();
    case "local":
      return showLocal(typeof arg === "string" ? arg : "");
    case "settings":
      return showSettings();
    case "sync":
      await sync.now();
      return state();
    case "newCode":
      hub.newPairCode();
      return pushState();
    case "unpairAll":
      hub.unpairAll();
      return pushState();
    case "setServer": {
      const url = String(arg ?? "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error("invalid_url");
      saveConfig({ serverUrl: url });
      return state();
    }
    case "login":
      mode = "setup";
      void content.webContents.loadURL(`${config.serverUrl.replace(/\/+$/, "")}/login`);
      return pushState();
    case "setDeviceName":
      return saveConfig({ deviceName: String(arg ?? "").slice(0, 60) || os.hostname() });
    case "systemPrinters":
      return systemPrinters(content.webContents);
    case "setLocalPrinters": {
      const list = Array.isArray(arg) ? arg : [];
      return saveConfig({
        localPrinters: list.slice(0, 6).map((p, i) => ({
          id: `local-${i}`,
          name: String(p.name ?? p.system ?? "PC").slice(0, 60),
          system: p.system ? String(p.system) : undefined,
          host: p.system ? undefined : String(p.host ?? ""),
          port: Number(p.port) || 9100,
          paperMm: Number(p.paperMm) === 58 ? 58 : 80,
          target: ["cashier", "station", "all"].includes(p.target) ? p.target : "all",
          stationId: p.stationId ?? null,
          copies: Math.min(5, Math.max(1, Number(p.copies) || 1)),
        })),
      });
    }
    case "testPrint": {
      const p = (config.localPrinters ?? [])[Number(arg)];
      if (!p) throw new Error("not_found");
      await deliver(p, {
        kind: "kitchen",
        restaurant: config.restaurantName ?? "Spotifood",
        title: "Test",
        number: "✓",
        where: p.name,
        time: new Date().toLocaleTimeString(),
        offline: "Spotifood",
        lines: [{ quantity: 1, name: "چاپ آزمایشی · Test", options: [], note: null }],
      });
      return true;
    }
    case "unlink": {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        buttons: ["OK", "×"],
        defaultId: 1,
        message: "Spotifood",
        detail: hub.pending().length
          ? "Des commandes hors ligne ne sont pas encore envoyées. Délier quand même ?"
          : "Délier ce PC du restaurant ?",
      });
      if (response !== 0) return state();
      sync.stop();
      saveConfig({ deviceToken: null, deviceId: null, restaurantId: null, restaurantName: null, lastUrl: null });
      showSetup();
      return state();
    }
    default:
      throw new Error("unknown_action");
  }
});

// ─── App ─────────────────────────────────────────────────────────────────────

app.on("second-instance", () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(
    process.platform === "darwin"
      ? Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "viewMenu" }, { role: "windowMenu" }])
      : null,
  );
  // The hub must survive the screen saver: tablets and the kitchen depend on it.
  powerSaveBlocker.start("prevent-app-suspension");
  for (let port = HUB_PORT; port < HUB_PORT + 10; port++) {
    try {
      hubPort = await hub.listen(port);
      break;
    } catch (e) {
      log(`hub port ${port}: ${e.message}`);
    }
  }
  createWindow();
  if (config.deviceToken) sync.start();
  if (process.env.SPOTIFOOD_SMOKE) void smoke(process.env.SPOTIFOOD_SMOKE);
});

/** Test run: screenshots of the bar and each screen, then quit. */
async function smoke(dir) {
  const fs = await import("node:fs");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (name) => {
    await wait(2500);
    const [b, c] = await Promise.all([bar.webContents.capturePage(), content.webContents.capturePage()]);
    fs.writeFileSync(path.join(dir, `${name}-bar.png`), b.toPNG());
    fs.writeFileSync(path.join(dir, `${name}.png`), c.toPNG());
    log(`smoke ${name}: ${content.webContents.getURL()}`);
  };
  await shot(mode);
  if (process.env.SPOTIFOOD_SMOKE_ORDER && hub.snapshot) {
    // A real order through the hub: kitchen tickets and the paid receipt go to the printers.
    const dishes = hub.snapshot.products.filter((p) => p.isAvailable && !p.optionGroups.some((g) => g.minSelect > 0));
    hub._createOrder({
      channel: "dine_in",
      tableId: hub.snapshot.tables[0]?.id,
      note: "تست چاپ آفلاین",
      lines: [
        { productId: dishes[0].id, quantity: 2, note: "بدون پیاز" },
        { productId: dishes[1].id, quantity: 1 },
      ],
      payment: { provider: "cash", tenderedCents: null },
    });
    await wait(6000);
  }
  for (const screen of (process.env.SPOTIFOOD_SMOKE_SCREENS ?? "").split(",").filter(Boolean)) {
    if (screen === "settings") showSettings();
    else showLocal(`#/${screen}`);
    await shot(screen);
  }
  app.quit();
}

app.on("window-all-closed", () => {
  // macOS keeps the app (and the hub) running in the dock.
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (!win) createWindow();
});
app.on("before-quit", () => {
  sync.stop();
  void hub.close();
});
