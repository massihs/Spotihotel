import { PUBLIC_KEY_RE, storage } from "@/server/infra/storage";

/**
 * Serves public assets when the storage backend has no CDN/public URL (local driver).
 * Only keys matching the public pattern are served; private objects are never exposed here.
 */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/files/[...key]">) {
  const key = (await params).key.join("/");
  if (!PUBLIC_KEY_RE.test(key)) return new Response("Not found", { status: 404 });
  const file = await storage().get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
