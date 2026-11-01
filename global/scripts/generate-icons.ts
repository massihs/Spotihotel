/** Generates PWA icons from the Spotifood mark. Run: npx tsx scripts/generate-icons.ts */
import sharp from "sharp";

const ACCENT = "#E4572E";
const mark = (size: number, padding: number, radius: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${radius}" fill="${ACCENT}"/>
  <g transform="translate(${padding} ${padding}) scale(${(32 - 2 * padding) / 32})">
    <circle cx="16" cy="16" r="8.5" fill="none" stroke="#fdfcfa" stroke-width="2.5"/>
    <rect x="13" y="13" width="6" height="6" rx="1.5" fill="#fdfcfa"/>
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
