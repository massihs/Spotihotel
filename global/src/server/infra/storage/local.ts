import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./index";

const TYPES: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };

/** Development driver: files on disk, served by /api/v1/files/[...key]. */
export class LocalStorageDriver implements StorageDriver {
  private root: string;
  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    try {
      const body = await readFile(this.resolve(key));
      return { body, contentType: TYPES[path.extname(key)] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(keys: string[]) {
    await Promise.all(keys.map((k) => rm(this.resolve(k), { force: true })));
  }

  publicUrl(key: string) {
    return `/api/v1/files/${key}`;
  }
}
