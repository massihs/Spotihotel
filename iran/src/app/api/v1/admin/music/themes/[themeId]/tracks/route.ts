import { db } from "@/server/db/client";
import { getCurrentSession } from "@/server/auth/current";
import { isAppError } from "@/server/errors";
import { addTrack, MAX_TRACK_BYTES } from "@/server/modules/music/service";

/** Super admin uploads one audio file per request (multipart: file, title, artist, durationSec). */
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/v1/admin/music/themes/[themeId]/tracks">,
) {
  const session = await getCurrentSession();
  if (!session?.user.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  const { themeId } = await params;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_TRACK_BYTES + 64 * 1024) return Response.json({ error: "audio_size" }, { status: 413 });
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    if (!(file instanceof File)) return Response.json({ error: "audio_type" }, { status: 400 });
    const track = await addTrack(
      db,
      session.user,
      themeId,
      { body: Buffer.from(await file.arrayBuffer()), type: file.type },
      {
        title: String(
          fd.get("title") ||
            file.name
              .replace(/\.[^.]+$/, "")
              .replace(/[_-]+/g, " ")
              .trim() ||
            "—",
        ),
        fromFileName: !fd.get("title"),
        artist: String(fd.get("artist") ?? ""),
        durationSec: Math.round(Number(fd.get("durationSec") ?? 0)),
      },
    );
    return Response.json({ id: track.id });
  } catch (e) {
    if (isAppError(e))
      return Response.json({ error: e.message }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    console.error("[music] upload failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
