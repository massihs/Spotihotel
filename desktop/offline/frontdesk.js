import { formatMoney } from "/model.js";

/**
 * Hotels: the front desk's emergency copy, shown on this PC when the internet or the website is
 * down. Guests in house, the coming arrivals, today's departures, the room board and the police
 * register, searchable and printable. The copy is refreshed every two minutes while online; it is
 * read-only (check-ins and payments taken during the outage are written down and entered on the
 * website when it is back).
 */

export const DESK_TABS = ["inHouse", "arrivals", "departures", "rooms", "police"];
/** Older than this, the copy is flagged (the reception should know it may have moved since). */
const STALE_MIN = 15;

const latin = (s) =>
  String(s ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .toLowerCase();

export function deskUi({ t, esc, locale, desk }) {
  const cal = locale.startsWith("fa") ? "fa-IR-u-ca-persian" : locale;
  const fmtDay = new Intl.DateTimeFormat(cal, { day: "numeric", month: "short", timeZone: "UTC" });
  const fmtLong = new Intl.DateTimeFormat(cal, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: desk.hotel.timezone });
  let regions = null;
  try {
    regions = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    regions = null;
  }
  const num = (n) => new Intl.NumberFormat(locale).format(n);
  return {
    t,
    esc,
    num,
    day: (d) => (d ? fmtDay.format(new Date(`${d}T00:00:00Z`)) : "—"),
    longDay: (d) => fmtLong.format(new Date(`${d}T00:00:00Z`)),
    time: (iso) => fmtTime.format(new Date(iso)),
    money: (c) => formatMoney(c, desk.hotel.currency, locale),
    country: (code) => {
      if (!code) return "—";
      try {
        return regions?.of(code) ?? code;
      } catch {
        return code;
      }
    },
    nights: (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000),
  };
}

const guestName = (s) => `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
const haystack = (s) =>
  latin([guestName(s), s.roomLabel, s.number, s.documentNumber, s.phone, s.account, s.fatherName].join(" "));

function filter(list, q) {
  const needle = latin(q).trim();
  if (!needle) return list;
  const words = needle.split(/\s+/);
  return list.filter((s) => {
    const h = haystack(s);
    return words.every((w) => h.includes(w));
  });
}

function balance(ui, cents) {
  if (!cents) return `<span class="muted">—</span>`;
  return cents > 0
    ? `<b class="owe num">${ui.money(cents)}</b>`
    : `<span class="credit num">${ui.money(-cents)} ${ui.t("fdCredit")}</span>`;
}

function guestCell(ui, s) {
  const tags = [
    s.vip ? `<span class="tag vip">VIP</span>` : "",
    s.status === "tentative" ? `<span class="tag">${ui.t("fdTentative")}</span>` : "",
    s.precheckin ? `<span class="tag ok">${ui.t("fdPrecheckin")}</span>` : "",
  ].join("");
  return `<td><b>${ui.esc(guestName(s))}</b> ${tags}${s.account ? `<div class="sub">${ui.esc(s.account)}</div>` : ""}${
    s.notes ? `<div class="sub note">${ui.esc(s.notes)}</div>` : ""
  }</td>`;
}

const pax = (ui, s) => `${ui.num(s.adults)}${s.children ? ` + ${ui.num(s.children)}` : ""}`;
const room = (ui, s) =>
  s.roomLabel ? `<b class="room num">${ui.esc(s.roomLabel)}</b>` : `<span class="tag warn">${ui.t("fdNoRoom")}</span>`;

function table(ui, head, rows) {
  if (!rows.length) return `<div class="empty">${ui.t("fdNoRows")}</div>`;
  return `<div class="fd-table"><table><thead><tr>${head.map((h) => `<th>${ui.t(h)}</th>`).join("")}</tr></thead><tbody>${rows.join(
    "",
  )}</tbody></table></div>`;
}

function inHouse(ui, list) {
  return table(
    ui,
    ["colRoom", "colGuest", "colNationality", "colPax", "colArrival", "colDeparture", "colPlan", "colPhone", "colBalance"],
    list.map(
      (s) => `<tr><td>${room(ui, s)}<div class="sub">${ui.esc(s.typeCode)}</div></td>${guestCell(ui, s)}
        <td>${ui.esc(ui.country(s.nationality))}</td><td class="num">${pax(ui, s)}</td>
        <td class="num">${ui.day(s.arrival)}</td><td class="num">${ui.day(s.departure)}</td>
        <td>${ui.esc(s.plan ?? "—")}</td><td class="num" dir="ltr">${ui.esc(s.phone ?? "")}</td><td>${balance(ui, s.balanceCents)}</td></tr>`,
    ),
  );
}

function arrivals(ui, list) {
  if (!list.length) return `<div class="empty">${ui.t("fdNoRows")}</div>`;
  const days = [...new Set(list.map((s) => s.arrival))];
  return days
    .map((d) => {
      const rows = list.filter((s) => s.arrival === d);
      return `<h3 class="fd-day">${ui.esc(ui.longDay(d))} <span class="muted">· ${ui.t("fdCount", { n: ui.num(rows.length) })}</span></h3>${table(
        ui,
        ["colNo", "colGuest", "colRoom", "colPax", "colNights", "colPlan", "colEta", "colPhone", "colBalance"],
        rows.map(
          (s) => `<tr><td class="num">${ui.num(s.number)}</td>${guestCell(ui, s)}<td>${room(ui, s)}<div class="sub">${ui.esc(s.typeCode)}</div></td>
            <td class="num">${pax(ui, s)}</td><td class="num">${ui.num(ui.nights(s.arrival, s.departure))}</td><td>${ui.esc(s.plan ?? "—")}</td>
            <td class="num" dir="ltr">${ui.esc(s.eta ?? "")}</td><td class="num" dir="ltr">${ui.esc(s.phone ?? "")}</td><td>${balance(ui, s.balanceCents)}</td></tr>`,
        ),
      )}`;
    })
    .join("");
}

function departures(ui, list) {
  return table(
    ui,
    ["colRoom", "colGuest", "colStatus", "colArrival", "colPhone", "colBalance"],
    list.map(
      (s) => `<tr><td>${room(ui, s)}</td>${guestCell(ui, s)}
        <td>${s.status === "checked_out" ? `<span class="tag ok">${ui.t("fdLeft")}</span>` : `<span class="tag warn">${ui.t("fdStillIn")}</span>`}</td>
        <td class="num">${ui.day(s.arrival)}</td><td class="num" dir="ltr">${ui.esc(s.phone ?? "")}</td><td>${balance(ui, s.balanceCents)}</td></tr>`,
    ),
  );
}

const DOCS = { id_card: "docIdCard", passport: "docPassport", driving_licence: "docLicence" };
function police(ui, list) {
  return table(
    ui,
    ["colRoom", "colLastName", "colFirstName", "colFather", "colNationality", "colDocument", "colBirth", "colArrival", "colDeparture"],
    list.map(
      (s) => `<tr><td>${room(ui, s)}</td><td><b>${ui.esc(s.lastName)}</b></td><td>${ui.esc(s.firstName)}</td><td>${ui.esc(s.fatherName ?? "—")}</td>
        <td>${ui.esc(ui.country(s.nationality))}</td>
        <td>${s.documentNumber ? `${ui.t(DOCS[s.documentType] ?? "docOther")} <span class="num" dir="ltr">${ui.esc(s.documentNumber)}</span>` : `<span class="tag warn">${ui.t("fdNoDocument")}</span>`}</td>
        <td class="num">${ui.day(s.birthDate)}</td><td class="num">${ui.day(s.arrival)}</td><td class="num">${ui.day(s.departure)}</td></tr>`,
    ),
  );
}

const floorOf = (r) => r.zone || (r.number ? String(Math.floor(r.number / 100)) : "—");
function rooms(ui, desk, q) {
  const needle = latin(q).trim();
  const list = needle
    ? desk.rooms.filter((r) => latin([r.label, r.typeCode, r.occupiedBy].join(" ")).includes(needle))
    : desk.rooms;
  if (!list.length) return `<div class="empty">${ui.t("fdNoRows")}</div>`;
  const floors = [...new Set(list.map(floorOf))];
  const legend = ["occupied", "clean", "dirty", "out_of_order"]
    .map((k) => `<span class="legend ${k}"><i></i>${ui.t(`hk_${k}`)}</span>`)
    .join("");
  return `<div class="legends">${legend}</div>${floors
    .map(
      (f) => `<h3 class="fd-day">${/^\d+$/.test(f) ? ui.t("fdFloor", { n: ui.num(Number(f)) }) : ui.esc(f)}</h3><div class="board">${list
        .filter((r) => floorOf(r) === f)
        .map((r) => {
          const state = r.housekeeping === "out_of_order" ? "out_of_order" : r.occupiedBy ? "occupied" : r.housekeeping === "dirty" ? "dirty" : "clean";
          return `<div class="rtile ${state}" title="${ui.esc(r.typeName ?? "")}"><div class="rt-top"><b class="num">${ui.esc(r.label)}</b><small>${ui.esc(
            r.typeCode ?? "",
          )}</small></div>${
            r.occupiedBy
              ? `<div class="rt-guest">${ui.esc(r.occupiedBy)}</div><small class="num">→ ${ui.day(r.departure)}</small>`
              : `<small>${ui.t(`hk_${r.housekeeping}`)}</small>`
          }</div>`;
        })
        .join("")}</div>`,
    )
    .join("")}`;
}

/** The list part (re-rendered alone while typing in the search box). */
export function deskList(desk, ui, { tab, q }) {
  switch (tab) {
    case "arrivals":
      return arrivals(ui, filter(desk.arrivals, q));
    case "departures":
      return departures(ui, filter(desk.departures, q));
    case "rooms":
      return rooms(ui, desk, q);
    case "police":
      return police(ui, filter(desk.inHouse, q));
    default:
      return inHouse(ui, filter(desk.inHouse, q));
  }
}

export function deskScreen(desk, ui, { tab, q, online }) {
  const t = ui.t;
  if (!desk) return `<div class="empty">${t("fdNone")}</div>`;
  const ageMin = Math.floor((Date.now() - Date.parse(desk.generatedAt)) / 60_000);
  const stale = ageMin >= STALE_MIN;
  const guests = desk.inHouse.reduce((n, s) => n + s.adults + s.children, 0);
  const todayArrivals = desk.arrivals.filter((s) => s.arrival === desk.businessDate).length;
  const toLeave = desk.departures.filter((s) => s.status === "in_house").length;
  const vacant = desk.rooms.filter((r) => !r.occupiedBy && r.housekeeping !== "out_of_order");
  const ready = vacant.filter((r) => r.housekeeping !== "dirty").length;
  const counts = { inHouse: desk.inHouse.length, arrivals: desk.arrivals.length, departures: desk.departures.length, rooms: desk.rooms.length, police: desk.inHouse.length };
  return `<section class="desk">
    <div class="fd-head">
      <div><h2>${t("fdTitle")}</h2>
        <div class="muted">${t("fdBusinessDay", { d: ui.longDay(desk.businessDate) })} · <span class="${stale ? "stale" : ""}">${t("fdAsOf", { when: ui.time(desk.generatedAt) })}${
          stale ? ` · ${t("fdStale", { n: ui.num(ageMin) })}` : ""
        }</span></div></div>
      <div class="kpis">
        <div><b class="num">${ui.num(desk.inHouse.length)}</b><span>${t("kpiRooms")}</span></div>
        <div><b class="num">${ui.num(guests)}</b><span>${t("kpiGuests")}</span></div>
        <div><b class="num">${ui.num(todayArrivals)}</b><span>${t("kpiArrivals")}</span></div>
        <div><b class="num">${ui.num(toLeave)}</b><span>${t("kpiDepartures")}</span></div>
        <div><b class="num">${ui.num(ready)}</b><span>${t("kpiReady")}</span></div>
      </div>
    </div>
    ${online ? "" : `<div class="fd-alert">${t("fdOfflineHint")}</div>`}
    <div class="fd-controls">
      <div class="scroll">${DESK_TABS.map(
        (k) => `<button class="chip" data-fdtab="${k}" aria-pressed="${tab === k}">${t(`fd_${k}`)} <span class="count num">${ui.num(counts[k])}</span></button>`,
      ).join("")}</div>
      <input class="field" id="fdq" type="search" value="${ui.esc(q)}" placeholder="${t("fdSearch")}" autocomplete="off">
      <button class="btn dark" data-act="fdprint">${t("fdPrint")}</button>
    </div>
    <div class="print-only"><b>${ui.esc(desk.hotel.name)}</b> — ${t(`fd_${tab}`)} — ${ui.esc(ui.longDay(desk.businessDate))} — ${t("fdAsOf", {
      when: ui.time(desk.generatedAt),
    })}</div>
    <div id="fdList">${deskList(desk, ui, { tab, q })}</div>
    <p class="muted fd-privacy">${t("fdPrivacy")}</p>
  </section>`;
}
