import sharp, { type Metadata } from "sharp";
import { AppError } from "@/server/errors";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_INPUT_PIXELS = 40_000_000; // ~ 7700×5200, rejects decompression bombs
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);

export type ImageVariant = { suffix: string; width: number; format: "webp" | "png" };

export const PRODUCT_VARIANTS: ImageVariant[] = [
  { suffix: "sm", width: 320, format: "webp" },
  { suffix: "md", width: 640, format: "webp" },
  { suffix: "lg", width: 1280, format: "webp" },
];

export const LOGO_VARIANTS: ImageVariant[] = [
  { suffix: "256", width: 256, format: "webp" },
  { suffix: "512", width: 512, format: "png" }, // PNG for PDFs and print
];

export type ProcessedImage = {
  width: number;
  height: number;
  placeholder: string;
  variants: { suffix: string; body: Buffer; contentType: string }[];
};

/**
 * Validates and re-encodes an untrusted upload.
 * - format detected from the bytes (never trusts the filename or the client MIME type)
 * - SVG/GIF/others rejected; oversized or pixel-bomb images rejected
 * - EXIF orientation applied then all metadata stripped (GPS etc.)
 * - re-encoding neutralizes polyglot payloads
 */
export async function processImage(input: Buffer, variants: ImageVariant[]): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new AppError("VALIDATION", "image_empty");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "image_too_large");

  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new AppError("VALIDATION", "image_invalid");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new AppError("VALIDATION", "image_format");
  if (!meta.width || !meta.height) throw new AppError("VALIDATION", "image_invalid");

  const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();

  const out: ProcessedImage["variants"] = [];
  let width = meta.width;
  let height = meta.height;
  for (const v of variants) {
    const pipeline = base().resize({ width: v.width, withoutEnlargement: true });
    const { data, info } =
      v.format === "png"
        ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
        : await pipeline.webp({ quality: 78, effort: 4 }).toBuffer({ resolveWithObject: true });
    out.push({ suffix: v.suffix, body: data, contentType: v.format === "png" ? "image/png" : "image/webp" });
    width = info.width;
    height = info.height;
  }

  const tiny = await base().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  return { width, height, placeholder: `data:image/webp;base64,${tiny.toString("base64")}`, variants: out };
}
