import { Suspense } from "react";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { verifiedStay } from "@/server/modules/pms/portal-session";
import { portalData } from "@/server/modules/pms/portal";
import { StayPortal } from "@/components/guest/stay-portal";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { localDay } from "@/lib/period";
import { guestCallsOf } from "@/server/modules/team/sections";

/** "My stay": the hotel portal behind a room's QR (Wi-Fi, spa, minibar, the bill…). */
export default function StayPortalPage() {
  return (
    <Suspense fallback={<GuestSkeleton />}>
      <Portal />
    </Suspense>
  );
}

async function Portal() {
  const guest = await getGuest();
  if (!guest || guest.table.kind !== "room") return <SessionExpired />;
  const v = await verifiedStay();
  const [data, calls] = await Promise.all([
    portalData(db, guest, v.stay?.id ?? null),
    guestCallsOf(db, guest.restaurant.id, { room: true }),
  ]);
  return (
    <div data-brand={guest.restaurant.brandColor} className="min-h-dvh bg-bg">
      <StayPortal
        hotelName={guest.restaurant.name}
        slug={guest.restaurant.slug}
        room={guest.table.label}
        currency={guest.restaurant.currency}
        timeZone={guest.restaurant.timezone}
        today={localDay(new Date(), guest.restaurant.timezone)}
        stay={
          v.row ? { firstName: v.stay ? v.row.guest.firstName : "", departure: v.row.stay.departure } : null
        }
        verified={!!v.stay}
        calls={calls.map(({ key, label, icon }) => ({ key, label, icon }))}
        settings={{
          wifiName: data.settings.wifiName,
          wifiPassword: data.settings.wifiPassword,
          guestInfo: data.settings.guestInfo,
          checkOutTime: data.settings.checkOutTime,
        }}
        services={data.services.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          description: s.description,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
        }))}
        minibar={data.minibar.map((m) => ({ id: m.id, name: m.name, priceCents: m.priceCents }))}
        folios={data.folios.map((f) => ({
          id: f.id,
          number: f.number,
          balanceCents: f.balanceCents,
          lines: f.lines
            .filter((l) => !l.voidedAt)
            .map((l) => ({
              id: l.id,
              businessDate: l.businessDate,
              description: l.description,
              department: l.department,
              method: l.method,
              amountCents: l.amountCents,
              quantity: l.quantity,
            })),
        }))}
        bookings={data.bookings.map((b) => ({
          id: b.id,
          service: b.service,
          startsAt: b.startsAt.toISOString(),
          people: b.people,
          status: b.status,
        }))}
      />
    </div>
  );
}
