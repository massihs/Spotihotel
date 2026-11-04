"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A thin bar across the top while the next page loads: starts on the click of a link to another
 * page, fills and fades once the new page is shown (or after 15 s at most).
 */
export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(pathname);
  if (pathname !== shown) {
    setShown(pathname);
    if (state === "loading") setState("done");
  }

  useEffect(() => {
    // Capture phase: runs before <Link> takes the click over for a client-side navigation.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setRun((n) => n + 1);
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState(state === "done" ? "idle" : "done"), state === "done" ? 450 : 15_000);
    return () => clearTimeout(t);
  }, [state, run]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[2px]" aria-hidden="true">
      <div
        key={run}
        className={cn(
          "h-full bg-accent shadow-[0_0_8px_var(--accent)]",
          state === "loading" ? "nav-progress" : "nav-progress-done",
        )}
      />
    </div>
  );
}
