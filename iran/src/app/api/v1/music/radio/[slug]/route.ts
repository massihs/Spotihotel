import { db } from "@/server/db/client";
import { nowPlaying } from "@/server/modules/music/service";

/** Live radio clock: current track, seek offset and what comes next. Never cached. */
export async function GET(_req: Request, { params }: RouteContext<"/api/v1/music/radio/[slug]">) {
  const { slug } = await params;
  const live = await nowPlaying(db, slug);
  if (!live) return Response.json({ error: "off_air" }, { status: 404 });
  return Response.json(live, { headers: { "Cache-Control": "no-store" } });
}
