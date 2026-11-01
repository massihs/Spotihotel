import { isRtl, translator } from "/i18n.js";

const $ = (id) => document.getElementById(id);
let t = translator("fa");
let toastUntil = 0;

function render(s) {
  if (!s) return;
  t = translator(s.locale);
  document.documentElement.dir = isRtl(s.locale) ? "rtl" : "ltr";
  $("name").textContent = s.restaurantName ?? "Spotifood";
  const online = s.status.online;
  // Before the PC is linked there is no connection to report.
  $("pill").className = `pill ${online ? "on" : "off"}${s.linked ? "" : " hidden"}`;
  $("pillText").textContent = online ? t("online") : t("offline");
  const msg = $("msg");
  if (s.toast && Date.now() - s.toast.at < 8000) {
    msg.className = "msg toast";
    msg.textContent = t(`toast${s.toast.key[0].toUpperCase()}${s.toast.key.slice(1)}`, s.toast.values);
    toastUntil = s.toast.at + 8000;
  } else if (Date.now() > toastUntil) {
    msg.className = "msg";
    msg.textContent = s.status.syncing
      ? t("syncing")
      : !online && s.linked
        ? t("offlineLong")
        : s.status.pending
          ? t("pending", { n: s.status.pending })
          : "";
  }
  // Phones join the hub with this code (useful mostly offline).
  $("phones").innerHTML =
    s.linked && (s.mode === "local" || !online) && s.addresses[0]
      ? `${t("phones")}: <span dir="ltr">${s.addresses[0]}</span> · ${t("code")} <b class="code">${s.pairCode}</b>`
      : "";
  $("site").textContent = t("site");
  $("site").setAttribute("aria-pressed", String(s.mode === "site" || s.mode === "setup"));
  $("local").textContent = t("local");
  $("local").setAttribute("aria-pressed", String(s.mode === "local"));
  $("local").classList.toggle("hidden", !s.linked);
  $("sync").textContent = t("syncNow");
  $("sync").classList.toggle("hidden", !s.linked || !s.status.pending);
  $("settings").setAttribute("aria-pressed", String(s.mode === "settings"));
}

$("site").onclick = () => window.spotifood.action("site");
$("local").onclick = () => window.spotifood.action("local");
$("sync").onclick = () => window.spotifood.action("sync").then(render);
$("settings").onclick = () => window.spotifood.action("settings");
window.spotifood.onState(render);
window.spotifood.state().then(render);
setInterval(() => window.spotifood.state().then(render), 4000);
