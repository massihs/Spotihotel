"use client";

import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Counts a public page view (self-hosted audience: no cookie, no third party). */
export function Beacon() {
  const path = usePathname();
  const locale = useLocale();
  useEffect(() => {
    try {
      const body = JSON.stringify({ path, referrer: document.referrer || null, locale });
      if (navigator.sendBeacon)
        navigator.sendBeacon("/api/v1/hit", new Blob([body], { type: "application/json" }));
      else
        void fetch("/api/v1/hit", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "content-type": "application/json" },
        });
    } catch {}
  }, [path, locale]);
  return null;
}
