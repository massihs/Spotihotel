import { db } from "@/server/db/client";
import { getCurrentSession } from "@/server/auth/current";
import { isAppError } from "@/server/errors";
import { setCover } from "@/server/modules/music/service";

/** Super admin sets the artwork of a track or a station (multipart: file, kind=track|theme, id). */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session?.user.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 8 * 1024 * 1024 + 64 * 1024)
    return Response.json({ error: "image_size" }, { status: 413 });
  try {
    const fd = await req.formData();
    const file = fd.get("file");
    const kind = fd.get("kind") === "theme" ? "theme" : "track";
    if (!(file instanceof File)) return Response.json({ error: "image_type" }, { status: 400 });
    const res = await setCover(
      db,
      session.user,
      { kind, id: String(fd.get("id") ?? "") },
      { body: Buffer.from(await file.arrayBuffer()), type: file.type },
    );
    return Response.json(res);
  } catch (e) {
    if (isAppError(e))
      return Response.json({ error: e.message }, { status: e.code === "NOT_FOUND" ? 404 : 400 });
    console.error("[music] cover upload failed", e);
    return Response.json({ error: "internal" }, { status: 500 });
  }
}
