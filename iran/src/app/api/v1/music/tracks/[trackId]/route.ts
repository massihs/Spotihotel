import { db } from "@/server/db/client";
import { loadTrackFile } from "@/server/modules/music/service";

/**
 * Streams a music track with HTTP Range support, so players can seek (the live radio joins
 * the current song mid-way) and phones can buffer progressively.
 */
export async function GET(req: Request, { params }: RouteContext<"/api/v1/music/tracks/[trackId]">) {
  const { trackId } = await params;
  const file = await loadTrackFile(db, trackId);
  if (!file) return new Response("Not found", { status: 404 });
  const size = file.body.length;
  const headers = {
    "Content-Type": file.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range)
    return new Response(new Uint8Array(file.body), {
      headers: { ...headers, "Content-Length": String(size) },
    });
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end || start >= size)
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(new Uint8Array(file.body.subarray(start, end + 1)), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
  });
}
