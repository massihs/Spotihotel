"use client";

import { useEffect } from "react";

/** Opens the print dialog once the ticket has rendered (or always prints in a hidden frame). */
export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, [enabled]);
  return enabled ? null : (
    <button
      type="button"
      onClick={() => window.print()}
      className="mt-4 w-full rounded-lg border border-black py-2 text-sm font-bold print:hidden"
    >
      🖨
    </button>
  );
}
