/** Generates PWA icons from the Spotihotel mark. Run: npx tsx scripts/generate-icons.ts */
import sharp from "sharp";

const NAVY = "#14213d";
const BRASS = "#c9a96a";
// Navy tile, brass arched doorway with keyhole (same geometry as src/components/ui/logo.tsx).
const mark = (size: number, padding: number, radius: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${NAVY}"/>
  <g transform="translate(${padding} ${padding}) scale(${(32 - 2 * padding) / 32})" stroke="${BRASS}" stroke-linecap="round" fill="none">
    <path d="M10 25.5V14.5a6 6 0 0 1 12 0v11" stroke-width="2.2"/>
    <path d="M8 25.5h16" stroke-width="2.2"/>
    <circle cx="16" cy="17.2" r="1.7" fill="${BRASS}" stroke="none"/>
    <path d="M16 18.5v3" stroke-width="1.4"/>
  </g>
</svg>`;

const out = [
  { file: "public/icons/icon-192.png", size: 192, padding: 0, radius: 7 },
  { file: "public/icons/icon-512.png", size: 512, padding: 0, radius: 7 },
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
