import { isRtl, translator } from "/i18n.js";

const $ = (id) => document.getElementById(id);
const api = window.spotifood;
let s = await api.state();
const t = translator(s.locale);
document.documentElement.dir = isRtl(s.locale) ? "rtl" : "ltr";
let printers = structuredClone(s.localPrinters);
let systemList = [];
try {
  systemList = await api.action("systemPrinters");
} catch {
  /* none */
}

for (const [id, key] of Object.entries({
  title: "settings",
  back: "back",
  serverTitle: "server",
  serverSave: "save",
  pcTitle: "pcName",
  pcSave: "save",
  phonesTitle: "phonesTitle",
  phonesBody: "phonesBody",
  newCode: "newCode",
  unpairAll: "unpairAll",
  printersTitle: "printersTitle",
  printersBody: "printersBody",
  addSystem: "systemPrinter",
  addNetwork: "networkPrinter",
  savePrinters: "save",
  syncTitle: "syncTitle",
  syncNow: "syncNow",
  unlink: "unlink",
})) $(id).textContent = t(key);

function renderState() {
  $("pcName").value ||= s.deviceName;
  $("addrs").innerHTML = s.addresses.map((a) => `<span class="addr">${a}</span>`).join("") || "—";
  $("code").textContent = s.pairCode;
  $("syncInfo").textContent = [
    s.status.lastSyncAt ? t("lastSync", { when: new Date(s.status.lastSyncAt).toLocaleString() }) : t("never"),
    s.status.pending ? t("pending", { n: s.status.pending }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  $("version").textContent = `${t("version", { v: s.version })} · ${s.serverUrl}`;
}

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function renderPrinters() {
  $("printers").innerHTML = printers
    .map(
      (p, i) => `<div class="printer" data-i="${i}">
      ${
        p.system !== undefined
          ? `<label>${t("systemPrinter")}<select class="field" data-k="system">${systemList
              .map(
                (x) =>
                  `<option value="${esc(x.name)}" ${x.name === p.system ? "selected" : ""} ${x.virtual ? "disabled" : ""}>${esc(x.displayName)}${x.virtual ? ` (${t("virtualPrinter")})` : ""}</option>`,
              )
              .join("")}</select></label>`
          : `<label>IP<input class="field" dir="ltr" data-k="host" value="${esc(p.host)}" placeholder="192.168.1.50"></label>
             <label>Port<input class="field" dir="ltr" data-k="port" value="${esc(p.port ?? 9100)}"></label>`
      }
      <label>${t("paper")}<select class="field" data-k="paperMm"><option value="80" ${p.paperMm !== 58 ? "selected" : ""}>80 mm</option><option value="58" ${p.paperMm === 58 ? "selected" : ""}>58 mm</option></select></label>
      <label>${t("target")}<select class="field" data-k="target">
        <option value="all" ${p.target === "all" ? "selected" : ""}>${t("targetAll")}</option>
        <option value="cashier" ${p.target === "cashier" ? "selected" : ""}>${t("targetCashier")}</option>
        ${s.stations.length ? `<option value="station" ${p.target === "station" ? "selected" : ""}>${t("targetStation")}</option>` : ""}
      </select></label>
      ${
        p.target === "station"
          ? `<label>&nbsp;<select class="field" data-k="stationId">${s.stations
              .map((x) => `<option value="${esc(x.id)}" ${x.id === p.stationId ? "selected" : ""}>${esc(x.name)}</option>`)
              .join("")}</select></label>`
          : ""
      }
      <div class="row"><button class="btn" data-test="${i}">${t("test")}</button><button class="btn danger" data-remove="${i}">${t("remove")}</button></div>
    </div>`,
    )
    .join("");
}

$("printers").addEventListener("change", (e) => {
  const box = e.target.closest("[data-i]");
  const k = e.target.dataset.k;
  if (!box || !k) return;
  const p = printers[Number(box.dataset.i)];
  p[k] = k === "paperMm" || k === "port" ? Number(e.target.value) : e.target.value;
  if (k === "target" && p.target === "station") p.stationId ??= s.stations[0]?.id ?? null;
  if (k === "host" || k === "system") p.name = e.target.value;
  renderPrinters();
});
$("printers").addEventListener("click", async (e) => {
  const rm = e.target.dataset.remove;
  const test = e.target.dataset.test;
  if (rm !== undefined) {
    printers.splice(Number(rm), 1);
    renderPrinters();
  }
  if (test !== undefined) {
    await api.action("setLocalPrinters", printers);
    $("printerMsg").textContent = "…";
    try {
      await api.action("testPrint", Number(test));
      $("printerMsg").textContent = "✓";
    } catch (err) {
      $("printerMsg").textContent = `✗ ${err.message}`;
    }
  }
});
$("addSystem").onclick = () => {
  // A real printer by default: Windows often defaults to OneNote or "Print to PDF".
  const real = systemList.filter((x) => !x.virtual);
  printers.push({ system: real.find((x) => x.isDefault)?.name ?? real[0]?.name ?? "", paperMm: 80, target: "cashier", copies: 1 });
  if (!real.length) $("printerMsg").textContent = t("noRealPrinter");
  printers.at(-1).name = printers.at(-1).system;
  renderPrinters();
};
$("addNetwork").onclick = () => {
  printers.push({ host: "", port: 9100, paperMm: 80, target: "all", copies: 1, name: "" });
  renderPrinters();
};
$("savePrinters").onclick = async () => {
  await api.action("setLocalPrinters", printers);
  $("printerMsg").textContent = "✓";
};
$("server").value = s.serverUrl;
// The address is tied to the restaurant the PC is linked to: change it only before linking.
$("server").disabled = $("serverSave").disabled = s.linked;
$("serverSave").onclick = async () => {
  try {
    await api.action("setServer", $("server").value);
    await api.action("site");
  } catch {
    $("serverErr").textContent = "https://…";
  }
};
$("pcSave").onclick = () => api.action("setDeviceName", $("pcName").value);
$("newCode").onclick = () => api.action("newCode");
$("unpairAll").onclick = () => api.action("unpairAll");
$("syncNow").onclick = () => api.action("sync");
$("unlink").onclick = () => api.action("unlink");
$("back").onclick = () => api.action("site");

api.onState((next) => {
  s = next;
  renderState();
});
renderState();
renderPrinters();
