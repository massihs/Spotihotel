import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { GuestSkeleton } from "@/components/guest/states";
import { ScanWindow } from "@/components/guest/scan-window";
import { GuestSupport } from "@/components/support/launcher";
import { getGuest, scanWindowEnd } from "@/server/modules/guest/current";

// Guest pages are private to the table: never indexed, never leaking the URL in referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "Spotihotel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <Suspense fallback={<GuestSkeleton />}>{children}</Suspense>
      <Suspense fallback={null}>
        <OrderingWindow />
      </Suspense>
    </div>
  );
}

/** When this phone's ordering window (30 min from the last QR scan) closes. */
async function OrderingWindow() {
  const guest = await getGuest();
  if (!guest) return null;
  return (
    <>
      <ScanWindow end={await scanWindowEnd(guest.participant.id)} />
      <GuestSupport />
    </>
  );
}
