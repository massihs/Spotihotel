import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageDriver } from "./index";

/** S3-compatible driver (AWS S3, Cloudflare R2, MinIO, Scaleway...). */
export class S3StorageDriver implements StorageDriver {
  private client: S3Client;
  constructor(
    private cfg: {
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl?: string;
    },
  ) {
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: Boolean(cfg.endpoint),
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are content-unique (random suffix) → safe to cache forever.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  async get(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      const body = Buffer.from(await res.Body!.transformToByteArray());
      return { body, contentType: res.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.cfg.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  }

  publicUrl(key: string) {
    return this.cfg.publicBaseUrl
      ? `${this.cfg.publicBaseUrl.replace(/\/$/, "")}/${key}`
      : `/api/v1/files/${key}`;
  }
}
