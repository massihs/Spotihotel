import { isRtl, translator } from "/i18n.js";
const $ = (id) => document.getElementById(id);
const s = await window.spotihotel.state();
const locale = navigator.language?.startsWith("fr") ? "fr" : navigator.language?.startsWith("en") ? "en" : "fa";
const t = translator(locale);
document.documentElement.dir = isRtl(locale) ? "rtl" : "ltr";
document.documentElement.lang = locale;
$("title").textContent = t("setupTitle");
$("body").textContent = t("setupBody");
$("serverLabel").textContent = t("server");
$("go").textContent = t("signIn");
$("hint").textContent = t("setupHint");
$("version").textContent = t("version", { v: s.version });
$("server").value = s.serverUrl;
$("go").onclick = async () => {
  $("err").textContent = "";
  try {
    await window.spotihotel.action("setServer", $("server").value);
    await window.spotihotel.action("login");
  } catch {
    $("err").textContent = "https://…";
  }
};
