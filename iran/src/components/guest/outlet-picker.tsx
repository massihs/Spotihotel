"use client";

import { Cake, Clock, Coffee, MapPin, Sofa, UtensilsCrossed, Waves, Wine } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

export type RoomOutlet = {
  id: string;
  name: string;
  kind: string;
  location: string | null;
  hours: string | null;
};

/** Each restaurant's icon in its own blue. */
const SHADES = ["shade-royal", "shade-cyan", "shade-periwinkle", "shade-azure", "shade-indigo"];

const ICONS: Record<string, typeof UtensilsCrossed> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Wine,
  lounge: Sofa,
  pool_bar: Waves,
  pastry: Cake,
};

/**
 * A hotel room orders from any of the hotel's restaurants and cafés (those the manager left open
 * to room service): one card each, the current one filled; the menu below is that outlet's.
 */
export function OutletPicker({
  outlets,
  current,
  cartOutlet,
}: {
  outlets: RoomOutlet[];
  current: string | null;
  /** The outlet the cart already holds dishes from, if any. */
  cartOutlet: string | null;
}) {
  const t = useTranslations("guest.outlets");
  if (outlets.length < 2) return null;
  return (
    <section id="room-service-outlets" aria-label={t("title")} className="mt-5 scroll-mt-4">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-4">
        <h2 className="text-[17px] font-bold">{t("title")}</h2>
        <p className="text-xs text-fg-muted">{t("count", { n: outlets.length })}</p>
      </div>
      <div className="flex snap-x [scrollbar-width:none] gap-2.5 overflow-x-auto px-4 pb-1">
        {outlets.map((o, i) => {
          const Icon = ICONS[o.kind] ?? UtensilsCrossed;
          const active = o.id === current;
          return (
            <Link
              key={o.id}
              href={`/table?outlet=${o.id}`}
              scroll={false}
              replace
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative flex w-[11.5rem] shrink-0 snap-start flex-col gap-2 rounded-2xl p-3.5 text-start ring-1 transition active:scale-[0.98]",
                active
                  ? "bg-accent bg-[image:var(--brand-gradient)] text-accent-fg shadow-[0_12px_26px_-14px_var(--accent)] ring-transparent"
                  : "bg-surface ring-border hover:ring-brand-300",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-xl [&_svg]:size-5",
                    active ? "bg-white/15 text-accent-fg" : cn("shade-soft", SHADES[i % SHADES.length]),
                  )}
                >
                  <Icon aria-hidden="true" />
                </span>
                {cartOutlet === o.id ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold",
                      active ? "bg-white/20" : "bg-brand-100 text-brand-800",
                    )}
                  >
                    {t("inCart")}
                  </span>
                ) : null}
              </span>
              <span className="line-clamp-1 text-[15px] leading-snug font-bold">{o.name}</span>
              <span className={cn("space-y-0.5 text-xs", active ? "text-accent-fg/80" : "text-fg-muted")}>
                <span className="block">{t(`kinds.${o.kind}` as "kinds.restaurant")}</span>
                {o.hours ? (
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" aria-hidden="true" />
                    <bdi dir="ltr">{o.hours}</bdi>
                  </span>
                ) : null}
                {o.location ? (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{o.location}</span>
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
