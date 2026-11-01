"use client";

import { useEffect, useState } from "react";

const SHOW_MS = 3000;
const EXIT_MS = 450;

/**
 * Full-screen welcome after a QR scan: the restaurant's logo animates for 3 s while the menu loads
 * underneath, then the layer fades away. A tap skips it. The `welcome` flag leaves the URL at once,
 * so a reload or a back navigation goes straight to the menu.
 */
export function WelcomeSplash({
  name,
  logo,
  brand,
  table,
  welcome,
}: {
  name: string;
  logo: string | null;
  brand: string;
  table: string;
  welcome: string;
}) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">("in");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("welcome")) {
      url.searchParams.delete("welcome");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const out = window.setTimeout(() => setPhase("out"), SHOW_MS - EXIT_MS);
    const gone = window.setTimeout(() => setPhase("gone"), SHOW_MS);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(gone);
    };
  }, []);

  useEffect(() => {
    if (phase !== "out") return;
    const t = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "gone") return null;
  const initial = [...name.trim()][0] ?? "S";
  return (
    <div
      data-brand={brand}
      role="presentation"
      onClick={() => setPhase("out")}
      className="splash fixed inset-0 z-[100] grid cursor-pointer place-items-center overflow-hidden select-none"
      data-phase={phase}
    >
      <div className="splash-glow" aria-hidden="true" />
      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="relative grid size-36 place-items-center">
          <span className="splash-ring" aria-hidden="true" />
          <span className="splash-ring [animation-delay:0.5s]" aria-hidden="true" />
          <span className="splash-ring [animation-delay:1s]" aria-hidden="true" />
          <div className="splash-logo relative grid size-32 place-items-center overflow-hidden rounded-[2.25rem] bg-white shadow-2xl">
            {logo ? (
              <img src={logo} alt="" width={128} height={128} className="size-full object-contain p-3" />
            ) : (
              <span className="text-6xl font-black text-neutral-800" aria-hidden="true">
                {initial}
              </span>
            )}
            <span className="splash-shine" aria-hidden="true" />
          </div>
        </div>
        <p className="splash-text mt-8 text-sm font-medium tracking-wide opacity-80">{welcome}</p>
        <h1 className="splash-text mt-1 max-w-xs text-3xl leading-tight font-black [animation-delay:0.75s]">
          {name}
        </h1>
        <p className="splash-text mt-3 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur [animation-delay:0.9s]">
          {table}
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-[max(2.5rem,env(safe-area-inset-bottom))] mx-auto h-1 w-28 overflow-hidden rounded-full bg-white/20">
        <span className="splash-progress block h-full rounded-full bg-white/80" />
      </div>
    </div>
  );
}
