"use client";

import { StatusPill } from "./kit";

/** Server pages can render the translated status pill through this client wrapper. */
export function StatusText({ status }: { status: string }) {
  return <StatusPill status={status} />;
}
