import "server-only";
import path from "node:path";
import sharp from "sharp";

/**
 * ESC/POS tickets for thermal printers. Persian needs shaping and right-to-left layout, which
 * printers' built-in code pages cannot do, so each line is rendered (Pango, via sharp) and sent
 * as a raster image (GS v 0) — readable on any ESC/POS printer.
 */
const FONT = path.join(
  process.cwd(),
  "node_modules/vazirmatn/misc/UI-Farsi-Digits/fonts/ttf/Vazirmatn-UI-FD-Bold.ttf",
);
const DPI = 203; // 8 dots per mm
const SIZES = { sm: 8, md: 10, lg: 13, xl: 22 } as const;

export type TicketBlock =
  | { kind: "text"; text: string; size?: keyof typeof SIZES; align?: "center" | "start" }
  | { kind: "row"; start: string; end: string; size?: keyof typeof SIZES }
  | { kind: "rule" }
  | { kind: "space"; dots: number };

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One block of text as a black-on-white greyscale bitmap `width` dots wide. */
async function textBitmap(
  text: string,
  width: number,
  size: keyof typeof SIZES,
  align: "left" | "right" | "centre",
) {
  const { data, info } = await sharp({
    text: {
      text: `<span size="${SIZES[size]}pt">${escape(text)}</span>`,
      font: "Vazirmatn UI FD",
      fontfile: FONT,
      width,
      dpi: DPI,
      align,
      wrap: "word-char",
    },
  })
    .negate()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Renders the blocks into one white canvas (rows of greyscale bytes). */
export async function renderTicket(blocks: TicketBlock[], widthDots: number) {
  const pad = 8;
  const inner = widthDots - pad * 2;
  const parts: { data: Buffer; w: number; h: number; x: number }[][] = [];
  for (const b of blocks) {
    if (b.kind === "space") parts.push([{ data: Buffer.alloc(0), w: 0, h: b.dots, x: 0 }]);
    else if (b.kind === "rule") {
      const h = 3;
      parts.push([{ data: Buffer.alloc(inner * h, 0), w: inner, h, x: pad }]);
      parts.push([{ data: Buffer.alloc(0), w: 0, h: 6, x: 0 }]);
    } else if (b.kind === "text") {
      const bm = await textBitmap(b.text, inner, b.size ?? "md", b.align === "center" ? "centre" : "right");
      // Pango sizes the image to the text: place it on the right (RTL) or centered.
      const x = b.align === "center" ? pad + Math.max(0, Math.floor((inner - bm.w) / 2)) : pad + inner - bm.w;
      parts.push([{ ...bm, x }]);
    } else {
      const startW = Math.floor(inner * 0.55);
      const s = await textBitmap(b.start, startW, b.size ?? "md", "right");
      // Amounts stay on one line: a regular size, whatever the row size.
      const e = await textBitmap(b.end, inner - startW - 8, "md", "left");
      parts.push([
        { ...s, x: pad + inner - s.w },
        { ...e, x: pad },
      ]);
    }
  }
  const height = parts.reduce((sum, row) => sum + Math.max(...row.map((p) => p.h)) + 8, 0) + 24;
  const canvas = Buffer.alloc(widthDots * height, 255);
  let y = 0;
  for (const row of parts) {
    for (const p of row)
      for (let r = 0; r < p.h; r++)
        for (let c = 0; c < p.w; c++) {
          const v = p.data[r * p.w + c];
          if (v !== undefined && v < 255)
            canvas[(y + r) * widthDots + p.x + c] = Math.min(canvas[(y + r) * widthDots + p.x + c]!, v);
        }
    y += Math.max(...row.map((p) => p.h)) + 8;
  }
  return { canvas, width: widthDots, height };
}

/** ESC/POS bytes: init, raster bands, feed and cut, repeated for each copy. */
export function toEscPos(img: { canvas: Buffer; width: number; height: number }, copies = 1) {
  const bytesPerRow = Math.ceil(img.width / 8);
  const chunks: Buffer[] = [];
  const band = 240; // many printers limit one raster command's height
  for (let top = 0; top < img.height; top += band) {
    const h = Math.min(band, img.height - top);
    const data = Buffer.alloc(bytesPerRow * h);
    for (let r = 0; r < h; r++)
      for (let c = 0; c < img.width; c++)
        if (img.canvas[(top + r) * img.width + c]! < 140)
          data[r * bytesPerRow + (c >> 3)]! |= 0x80 >> (c & 7);
    chunks.push(
      Buffer.from([0x1d, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, h & 0xff, h >> 8]),
      data,
    );
  }
  const one = Buffer.concat([
    Buffer.from([0x1b, 0x40]), // initialize
    ...chunks,
    Buffer.from([0x1b, 0x64, 0x04]), // feed 4 lines
    Buffer.from([0x1d, 0x56, 0x42, 0x00]), // partial cut
  ]);
  return Buffer.concat(Array.from({ length: Math.max(1, Math.min(5, copies)) }, () => one));
}

/** PNG preview of a ticket (settings page "preview" and tests). */
export async function ticketPng(img: { canvas: Buffer; width: number; height: number }) {
  return sharp(img.canvas, { raw: { width: img.width, height: img.height, channels: 1 } })
    .png()
    .toBuffer();
}
