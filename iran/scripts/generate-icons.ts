/** Generates PWA icons from the Spotifood mark. Run: npx tsx scripts/generate-icons.ts */
import sharp from "sharp";

const INK = "#0b0b0b";
const LEAF = "#22c55e";
// Black tile, green "spot" with a bite (same geometry as src/components/ui/logo.tsx).
const mark = (size: number, padding: number, radius: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${INK}"/>
  <g transform="translate(${padding} ${padding}) scale(${(32 - 2 * padding) / 32})">
    <circle cx="16" cy="16" r="8" fill="${LEAF}"/>
    <circle cx="22.2" cy="10.2" r="3.4" fill="${INK}"/>
  </g>
</svg>`;

const out = [
  { file: "public/icons/icon-192.png", size: 192, padding: 0, radius: 9 },
  { file: "public/icons/icon-512.png", size: 512, padding: 0, radius: 9 },
  // Maskable: full-bleed background, content inside the 80% safe zone.
  { file: "public/icons/maskable-512.png", size: 512, padding: 4, radius: 0 },
  { file: "public/icons/apple-touch-icon.png", size: 180, padding: 2, radius: 0 },
];

async function main() {
  for (const o of out) {
    await sharp(Buffer.from(mark(o.size, o.padding, o.radius)))
      .png({ compressionLevel: 9 })
      .toFile(o.file);
    console.log("✓", o.file);
  }
}

void main();
