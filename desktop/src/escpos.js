/**
 * ESC/POS for thermal printers. Persian and Arabic need shaping and right-to-left layout that the
 * printers' code pages cannot do, so every ticket is drawn by Chromium and sent as a raster image
 * (GS v 0), which any ESC/POS printer understands.
 */

const ESC = 0x1b;
const GS = 0x1d;
/** Some printers choke on very tall images: send the ticket in bands. */
const BAND = 256;

/**
 * BGRA (or RGBA) pixels → 1-bit rows, black where the pixel is dark.
 * `width` is rounded up to a multiple of 8 dots.
 */
export function toMono(pixels, width, height, threshold = 160) {
  const bytesPerRow = Math.ceil(width / 8);
  const out = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Luma is the same for BGRA and RGBA up to the blue/red weights; alpha 0 is white.
      const a = pixels[i + 3];
      const lum = a === 0 ? 255 : 0.299 * pixels[i + 2] + 0.587 * pixels[i + 1] + 0.114 * pixels[i];
      if (lum < threshold) out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { data: out, bytesPerRow, height };
}

/** Mono image → printer bytes: init, image bands, feed and partial cut, `copies` times. */
export function toEscPos(mono, copies = 1) {
  const parts = [];
  for (let c = 0; c < copies; c++) {
    parts.push(Buffer.from([ESC, 0x40])); // initialize
    for (let y = 0; y < mono.height; y += BAND) {
      const h = Math.min(BAND, mono.height - y);
      parts.push(
        Buffer.from([GS, 0x76, 0x30, 0, mono.bytesPerRow & 0xff, mono.bytesPerRow >> 8, h & 0xff, h >> 8]),
        mono.data.subarray(y * mono.bytesPerRow, (y + h) * mono.bytesPerRow),
      );
    }
    parts.push(Buffer.from([ESC, 0x64, 4, GS, 0x56, 66, 0])); // feed 4 lines, cut
  }
  return Buffer.concat(parts);
}

/** Windows / macOS "printers" that only save a file (OneNote, PDF, XPS, fax): never for tickets. */
export const isVirtualPrinter = (name) =>
  /onenote|pdf|xps|fax|document writer|send to/i.test(String(name ?? ""));
