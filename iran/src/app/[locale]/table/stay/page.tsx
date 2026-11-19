import { Suspense } from "react";
import { db } from "@/server/db/client";
import { getGuest } from "@/server/modules/guest/current";
import { verifiedStay } from "@/server/modules/pms/portal-session";
import { portalData } from "@/server/modules/pms/portal";
import { StayPortal } from "@/components/guest/stay-portal";
import { SessionExpired, GuestSkeleton } from "@/components/guest/states";
import { localDay } from "@/lib/period";
import { guestCallsOf } from "@/server/modules/team/sections";
import { eq } from "drizzle-orm";
import { restaurants } from "@/server/db/schema";
import { getFeatures } from "@/server/modules/pms/features";
import { tipStaff } from "@/server/modules/pms/tips";
import { prayerTimes } from "@/lib/prayer-times";
import { Concierge, StayExtras, type WalletProps } from "@/components/guest/stay-extras";

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
  const rid = guest.restaurant.id;
  const today = localDay(new Date(), guest.restaurant.timezone);
  const [data, calls, features, [place], staff] = await Promise.all([
    portalData(db, guest, v.stay?.id ?? null),
    guestCallsOf(db, rid, { room: true }),
    getFeatures(db, rid),
    db
      .select({ lat: restaurants.latitude, lng: restaurants.longitude })
      .from(restaurants)
      .where(eq(restaurants.id, rid)),
    v.stay ? tipStaff(db, rid, guest.table.id) : Promise.resolve([]),
  ]);
  const prayer =
    features.prayer.enabled && place?.lat != null && place?.lng != null
      ? prayerTimes(today, place.lat, place.lng, guest.restaurant.timezone)
      : null;
  const ramadan = !!(
    features.ramadan.from &&
    features.ramadan.to &&
    today >= features.ramadan.from &&
    today <= features.ramadan.to
  );
  // The traveller's wallet: cash deposited in a foreign currency, what is left of it at today's rate.
  const wallet = ((): WalletProps | null => {
    const lines = data.folios.flatMap((f) => f.lines.filter((l) => !l.voidedAt));
    const foreign = lines.filter((l) => l.kind === "payment" && l.currency && l.foreignCents);
    if (!foreign.length) return null;
    const totals = new Map<string, number>();
    for (const l of foreign)
      totals.set(l.currency!, (totals.get(l.currency!) ?? 0) + Math.abs(l.foreignCents!));
    const [code, deposited] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const rate = data.settings.currencies.find((c) => c.code === code)?.rateCents;
    if (!rate) return null;
    const balance = data.folios.reduce((s, f) => s + f.balanceCents, 0);
    const remaining = balance < 0 ? Math.round((-balance / rate) * 100) : 0;
    return { code, depositedForeign: deposited, remainingForeign: Math.min(deposited, remaining) };
  })();
  const presets = features.tips.presets.length
    ? features.tips.presets
    : guest.restaurant.currency === "IRR"
      ? [50_000_000, 100_000_000, 200_000_000]
      : [500, 1_000, 2_000];
  return (
    <div
      data-brand={guest.restaurant.brandColor}
      data-kind={guest.restaurant.kind}
      className="min-h-dvh bg-bg"
    >
      <StayPortal
        hotelName={guest.restaurant.name}
        slug={guest.restaurant.slug}
        room={guest.table.label}
        currency={guest.restaurant.currency}
        timeZone={guest.restaurant.timezone}
        today={today}
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
          minibarSelfService: data.settings.minibarSelfService,
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
      >
        <StayExtras
          currency={guest.restaurant.currency}
          verified={!!v.stay}
          tips={features.tips.enabled ? { presets, staff } : null}
          prayer={prayer}
          ramadan={ramadan}
          wallet={v.stay ? wallet : null}
        />
      </StayPortal>
      <Concierge
        wifiName={data.settings.wifiName}
        wifiPassword={data.settings.wifiPassword}
        checkOutTime={data.settings.checkOutTime}
        services={data.services.map((x) => x.name)}
        guestInfo={data.settings.guestInfo}
        calls={calls.map(({ key, label, icon }) => ({ key, label, icon }))}
      />
    </div>
  );
}
