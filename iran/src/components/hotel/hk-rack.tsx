import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/cn";

type RackRoom = {
  id: string;
  label: string;
  typeCode: string | null;
  housekeeping: string;
  floor: string;
  occupancy: string;
};

const TONE: Record<string, string> = {
  dirty: "bg-danger-soft text-danger ring-danger/30",
  cleaning: "bg-warning-soft ring-warning/40",
  clean: "bg-info-soft text-info ring-info/30",
  inspected: "bg-success-soft text-success ring-success/30",
  out_of_order: "bg-surface-3 text-fg-muted ring-border-strong",
};
const KEY: Record<string, string> = { out_of_order: "outOfOrder" };

/**
 * رک خانه داری: every room as a tile, floor by floor, coloured by its housekeeping status with its
 * front-office situation; mismatches (an occupied room out of order, a vacant room dirty) stand out.
 */
export async function HkRack({
  rooms,
  floors,
}: {
  rooms: RackRoom[];
  floors: { key: string; label: string | null }[];
}) {
  const t = await getTranslations("housekeeping");
  const tx = await getTranslations("hkx");
  const counts = Object.fromEntries(
    Object.keys(TONE).map((k) => [k, rooms.filter((r) => r.housekeeping === k).length]),
  );
  return (
    <div className="space-y-5">
      <ul className="flex flex-wrap gap-2 text-sm">
        {Object.keys(TONE).map((k) => (
          <li key={k} className={cn("rounded-full px-3 py-1 font-semibold ring-1", TONE[k])}>
            {t(`counts.${KEY[k] ?? k}`)} · {counts[k]}
          </li>
        ))}
        <li className="rounded-full px-3 py-1 font-semibold text-fg-muted ring-1 ring-border">
          ⚠ {tx("rack.mismatch")}
        </li>
      </ul>
      {floors.map((f) => {
        const list = rooms.filter((r) => r.floor === f.key);
        if (!list.length) return null;
        return (
          <section key={f.key}>
            <h3 className="mb-2 text-sm font-bold text-fg-muted">
              {f.label ? t("floor", { floor: f.label }) : t("otherRooms")}
            </h3>
            <ul className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8 xl:grid-cols-12">
              {list.map((r) => {
                const occupied = r.occupancy === "stayover" || r.occupancy === "departure";
                const mismatch = occupied && r.housekeeping === "out_of_order";
                const vacantDirty = r.occupancy === "vacant" && r.housekeeping === "dirty";
                return (
                  <li
                    key={r.id}
                    title={`${t(`counts.${KEY[r.housekeeping] ?? r.housekeeping}`)} · ${t(`occupancy.${r.occupancy}`)}`}
                    className={cn(
                      "relative rounded-lg px-1.5 py-2 text-center ring-1",
                      TONE[r.housekeeping] ?? "ring-border",
                    )}
                  >
                    <p className="text-sm font-bold tabular-nums">{r.label}</p>
                    <p className="truncate text-[10px] opacity-80">{t(`occupancy.${r.occupancy}`)}</p>
                    {mismatch || vacantDirty ? (
                      <span className="absolute -end-1 -top-1 text-xs" aria-label={tx("rack.mismatch")}>
                        ⚠
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
