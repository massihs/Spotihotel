import "server-only";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";

/**
 * Object storage abstraction. Keys are tenant-prefixed: `r/{restaurantId}/...`.
 * Public assets (menu photos, logos) are served through `publicUrl(key)`;
 * private ones (complaint photos) are only streamed through authorized route handlers.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
  publicUrl(key: string): string;
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  driver =
    process.env.STORAGE_DRIVER === "s3"
      ? new S3StorageDriver({
          endpoint: process.env.S3_ENDPOINT || undefined,
          region: process.env.S3_REGION || "auto",
          bucket: process.env.S3_BUCKET!,
          accessKeyId: process.env.S3_ACCESS_KEY_ID!,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
          publicBaseUrl: process.env.S3_PUBLIC_URL || undefined,
        })
      : new LocalStorageDriver(process.env.STORAGE_LOCAL_DIR || "./.storage");
  return driver;
}

/** Test hook. */
export function setStorageDriver(d: StorageDriver | undefined) {
  driver = d;
}

/** Public asset kinds; anything else (e.g. complaint photos) is private. */
export const PUBLIC_KINDS = ["logo", "product"] as const;
export type PublicKind = (typeof PUBLIC_KINDS)[number];

/** Keys are generated server-side only; this guards route handlers that receive a key. */
export const PUBLIC_KEY_RE =
  /^r\/[0-9a-f-]{36}\/(logo|product)\/[A-Za-z0-9]{8,40}-[a-z0-9]{2,4}\.(webp|png)$/;

/** `r/{restaurantId}/{kind}/{random}` — variants append `-{suffix}.{ext}`. */
export function newAssetBase(restaurantId: string, kind: string, random: string) {
  return `r/${restaurantId}/${kind}/${random}`;
}

export function variantKey(base: string, suffix: string, contentType: string) {
  return `${base}-${suffix}.${contentType === "image/png" ? "png" : "webp"}`;
}
