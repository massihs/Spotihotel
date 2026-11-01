import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { GuestSkeleton } from "@/components/guest/states";

// Guest pages are private to the table: never indexed, never leaking the URL in referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "Spotifood", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl bg-bg">
      <Suspense fallback={<GuestSkeleton />}>{children}</Suspense>
    </div>
  );
}
