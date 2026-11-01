"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import {
  deleteStationAction,
  saveStationAction,
} from "@/app/[locale]/dashboard/[restaurantId]/kitchen/actions";

export type StationView = { id: string; name: string; color: string };
const COLORS = ["orange", "rose", "sky", "emerald", "amber", "violet", "teal", "fuchsia"] as const;
export const STATION_TONE: Record<string, { dot: string; soft: string }> = {
  orange: { dot: "bg-tone-orange", soft: "bg-tone-orange/12 text-tone-orange" },
  rose: { dot: "bg-tone-rose", soft: "bg-tone-rose/12 text-tone-rose" },
  sky: { dot: "bg-tone-sky", soft: "bg-tone-sky/12 text-tone-sky" },
  emerald: { dot: "bg-tone-emerald", soft: "bg-tone-emerald/12 text-tone-emerald" },
  amber: { dot: "bg-tone-amber", soft: "bg-tone-amber/18 text-tone-amber" },
  violet: { dot: "bg-tone-violet", soft: "bg-tone-violet/12 text-tone-violet" },
  teal: { dot: "bg-tone-teal", soft: "bg-tone-teal/12 text-tone-teal" },
  fuchsia: { dot: "bg-tone-fuchsia", soft: "bg-tone-fuchsia/12 text-tone-fuchsia" },
};

/** Kitchen stations (grill, bar, salads…) and which menu categories each prepares. */
export function StationManager({
  restaurantId,
  stations,
  categories,
  onClose,
}: {
  restaurantId: string;
  stations: StationView[];
  categories: { id: string; name: string; stationId: string | null }[];
  onClose: () => void;
}) {
  const t = useTranslations("kitchen.stations");
  const { pending, error, run } = useRun();
  const [edit, setEdit] = useState<StationView | "new" | null>(stations.length ? null : "new");
  const [name, setName] = useState("");
  const [color, setColor] = useState<(typeof COLORS)[number]>("orange");
  const [cats, setCats] = useState<string[]>([]);
  const open = (s: StationView | "new") => {
    setEdit(s);
    setName(s === "new" ? "" : s.name);
    setColor(s === "new" ? COLORS[stations.length % COLORS.length]! : (s.color as (typeof COLORS)[number]));
    setCats(s === "new" ? [] : categories.filter((c) => c.stationId === s.id).map((c) => c.id));
  };
  return (
    <Sheet title={t("title")} onClose={onClose}>
      {!edit ? (
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">{t("hint")}</p>
          {stations.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => open(s)}
              className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start hover:bg-surface-2"
            >
              <span className={cn("size-3 rounded-full", STATION_TONE[s.color]?.dot)} />
              <span className="flex-1 font-semibold">{s.name}</span>
              <span className="text-xs text-fg-muted">
                {categories
                  .filter((c) => c.stationId === s.id)
                  .map((c) => c.name)
                  .join("، ") || t("noCategories")}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => open("new")}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-semibold text-accent-fg"
          >
            <Plus className="size-4" />
            {t("new")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium">
            {t("name")}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              className={cn(field, "mt-1")}
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={cn(
                  "size-8 rounded-full",
                  STATION_TONE[c]!.dot,
                  color === c && "ring-2 ring-fg ring-offset-2",
                )}
              />
            ))}
          </div>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("categories")}</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = cats.includes(c.id);
                const other = !on && c.stationId && (edit === "new" || c.stationId !== edit.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCats((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm",
                      on
                        ? STATION_TONE[color]!.soft + " font-semibold ring-1 ring-current"
                        : "ring-1 ring-border",
                      other && "opacity-50",
                    )}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex gap-2">
            {edit !== "new" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  window.confirm(t("deleteConfirm")) &&
                  run(
                    () => deleteStationAction(restaurantId, edit.id),
                    () => setEdit(null),
                  )
                }
                className="grid size-11 place-items-center rounded-full text-danger ring-1 ring-danger/30"
                aria-label={t("delete")}
              >
                <Trash2 className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setEdit(null)}
              className="h-11 rounded-full px-4 text-sm font-semibold ring-1 ring-border"
            >
              {t("back")}
            </button>
            <button
              type="button"
              disabled={pending || !name.trim()}
              onClick={() =>
                run(
                  () =>
                    saveStationAction(restaurantId, edit === "new" ? null : edit.id, {
                      name,
                      color,
                      categoryIds: cats,
                    }),
                  () => setEdit(null),
                )
              }
              className="h-11 flex-1 rounded-full bg-accent font-semibold text-accent-fg disabled:opacity-50"
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
