"use client";

import { LoaderCircle } from "lucide-react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * A spinner inside a link while the page it opens is on its way (place it inside the <Link>):
 * a tab that changes only the query string gets no loading screen, so the click shows here.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <LoaderCircle className={cn("size-3.5 shrink-0 animate-spin", className)} aria-hidden="true" />;
}
