import { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isVirtualPrinter, toEscPos, toMono } from "./escpos.js";
import { sendToPrinter } from "./sync.js";
import { ticketHtml } from "./tickets.js";

/** 203 dpi heads: 80 mm paper prints 576 dots, 58 mm prints 384. */
const widthFor = (paperMm) => (paperMm === 58 ? 384 : 576);

let renderer = null;
let fontCss = null;

/** Vazirmatn, inlined: tickets look the same whatever fonts Windows or macOS has. */
function fonts() {
  if (fontCss !== null) return fontCss;
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "offline", "fonts");
  try {
    fontCss = ["arabic", "latin"]
      .map(
        (set) =>
          `@font-face{font-family:Vazirmatn;font-weight:100 900;src:url(data:font/woff2;base64,${fs
            .readFileSync(path.join(dir, `vazirmatn-${set}-wght-normal.woff2`))
            .toString("base64")}) format("woff2")}`,
      )
      .join("");
  } catch {
    fontCss = "";
  }
  return fontCss;
}
let queue = Promise.resolve();

/** One hidden window draws every ticket, one at a time. */
function view() {
  if (renderer && !renderer.isDestroyed()) return renderer;
  renderer = new BrowserWindow({
    show: false,
    width: 576,
    height: 800,
    webPreferences: { offscreen: true, sandbox: true },
  });
  return renderer;
}

/** The ticket as a bitmap (BGRA) exactly as wide as the paper. */
async function render(ticket, widthPx, rtl) {
  const win = view();
  // Start short: the page then measures its real height.
  win.setContentSize(widthPx, 100);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ticketHtml(ticket, widthPx, rtl, fonts()))}`);
  // Fonts are data: URLs, but still decoded asynchronously.
  await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)", true).catch(() => null);
  const height = await win.webContents
    .executeJavaScript("Math.ceil(document.body.getBoundingClientRect().height)", true)
    .catch(() => null);
  const h = Math.min(6000, Math.max(120, Number(height) || 1400));
  win.setContentSize(widthPx, h);
  await new Promise((r) => setTimeout(r, 120));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: widthPx, height: h });
  const size = image.getSize();
  return { pixels: image.toBitmap(), width: size.width, height: size.height };
}

/** Bottom white rows are paper wasted: cut the image after the last printed row. */
function trim(mono) {
  let last = mono.height - 1;
  const row = mono.bytesPerRow;
  while (last > 0 && mono.data.subarray(last * row, (last + 1) * row).every((b) => b === 0)) last--;
  const height = Math.min(mono.height, last + 24);
  return { ...mono, height, data: mono.data.subarray(0, height * row) };
}

/**
 * Prints a ticket on a network printer (ESC/POS over TCP) or, for a printer plugged into this PC,
 * through the system print dialog-less path.
 */
export async function deliver(printer, ticket, { rtl = true } = {}) {
  // Drawing uses the one hidden window, so tickets are drawn one at a time; sending to the
  // printers then happens in parallel (an unplugged printer must not hold up the others).
  const job = queue.then(async () => {
    if (printer.system) {
      // Sending a ticket to OneNote or "Print to PDF" pops a window on every order.
      if (isVirtualPrinter(printer.system)) throw new Error("virtual_printer");
      const win = view();
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ticketHtml(ticket, widthFor(printer.paperMm), rtl, fonts()))}`);
      await new Promise((resolve, reject) =>
        win.webContents.print(
          { silent: true, deviceName: printer.system, printBackground: false, margins: { marginType: "none" } },
          (ok, reason) => (ok ? resolve() : reject(new Error(reason || "print failed"))),
        ),
      );
      return null;
    }
    const { pixels, width, height } = await render(ticket, widthFor(printer.paperMm), rtl);
    return toEscPos(trim(toMono(pixels, width, height)), printer.copies ?? 1);
  });
  queue = job.catch(() => {});
  const bytes = await job;
  if (bytes) await sendToPrinter(printer.host, printer.port, bytes);
}

/** Printers installed on this PC (USB thermal printers usually show up here). */
export async function systemPrinters(webContents) {
  const list = await webContents.getPrintersAsync();
  return list.map((p) => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: !!p.isDefault,
    virtual: isVirtualPrinter(p.name) || isVirtualPrinter(p.displayName),
  }));
}
