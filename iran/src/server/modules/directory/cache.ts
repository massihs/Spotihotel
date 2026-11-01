import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { DIRECTORY_TAG, loadDirectory } from "./service";

/** The directory changes rarely: cached, and expired by `updateTag(DIRECTORY_TAG)` on listing edits. */
export async function getDirectory() {
  "use cache";
  cacheTag(DIRECTORY_TAG);
  cacheLife("minutes");
  return loadDirectory(db);
}
