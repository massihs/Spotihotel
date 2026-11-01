"use client";

import { AlertTriangle, ChefHat, ChevronDown, CupSoda, Monitor, Printer, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { STATION_TONE } from "@/components/kitchen/stations";
import { cn } from "@/lib/cn";
import { setCategoryStationAction, setProductStationAction, setupKitchenAndBarAction } from "./actions";

type Station = { id: string; name: string; color: string; printers: string[] };
type Category = { id: string; name: string; stationId: string | null; drink: boolean };
type Product = { id: string; name: string; categoryId: string; stationId: string | null };

/**
 * Menu → Kitchen / Bar: for each category (and, when needed, each dish) the station that
 * receives it — on its screen and on its printer. Everything is set in one tap.
 */
export function RoutingBoard({
  restaurantId,
  canManage,
  stations,
  categories,
  products,
}: {
  restaurantId: string;
  canManage: boolean;
  stations: Station[];
  categories: Category[];
  products: Product[];
}) {
  const t = useTranslations("routing");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Taps show at once; the server confirms (or the page refreshes back).
  const [cats, setCat] = useOptimistic(categories, (list, p: { id: string; stationId: string | null }) =>
    list.map((c) => (c.id === p.id ? { ...c, stationId: p.stationId } : c)),
  );
  const [dishes, setDish] = useOptimistic(products, (list, p: { id: string; stationId: string | null }) =>
    list.map((d) => (d.id === p.id ? { ...d, stationId: p.stationId } : d)),
  );
  const byId = new Map(stations.map((s) => [s.id, s]));
  const unassigned = cats.filter((c) => !c.stationId).length;

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null | undefined>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok) setError(t("error"));
    });

  const auto = () =>
    start(async () => {
      setError(null);
      const res = await setupKitchenAndBarAction(restaurantId);
      if (res?.ok && res.data) setDone(t("autoDone", { bar: res.data.toBar, kitchen: res.data.toKitchen }));
      else setError(t("error"));
    });

  if (!stations.length)
    return (
      <Card className="mx-auto max-w-2xl p-6 text-center sm:p-10">
        <div className="mx-auto flex w-fit gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-tone-orange/12 text-tone-orange">
            <ChefHat className="size-7" aria-hidden="true" />
          </span>
          <span className="grid size-14 place-items-center rounded-2xl bg-tone-sky/12 text-tone-sky">
            <CupSoda className="size-7" aria-hidden="true" />
          </span>
        </div>
        <h2 className="mt-5 text-xl font-bold">{t("emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-fg-muted">{t("emptyBody")}</p>
        {cats.some((c) => c.drink) ? (
          <p className="mt-4 text-sm">
            <span className="font-semibold">{t("detectedDrinks")}</span>{" "}
            {cats
              .filter((c) => c.drink)
              .map((c) => c.name)
              .join("، ")}
          </p>
        ) : null}
        {canManage ? (
          <Button className="mt-6" size="lg" disabled={pending} onClick={auto}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t("autoSetup")}
          </Button>
        ) : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </Card>
    );

  return (
    <div className="space-y-5">
      {/* Stations: where each one shows up and prints */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stations.map((s) => (
          <Card key={s.id} className="flex items-start gap-3 p-4">
            <span
              className={cn("mt-1 size-3 shrink-0 rounded-full", STATION_TONE[s.color]?.dot)}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-bold">{s.name}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                <Monitor className="size-3.5" aria-hidden="true" />
                {t("screen")}
              </p>
              {s.printers.length ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                  <Printer className="size-3.5" aria-hidden="true" />
                  {s.printers.join("، ")}
                </p>
              ) : (
                <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {t("noPrinter")}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {unassigned && canManage ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <span className="flex-1">{t("unassigned", { n: unassigned })}</span>
          <Button size="sm" disabled={pending} onClick={auto}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t("autoSort")}
          </Button>
        </div>
      ) : null}
      {done ? (
        <p className="rounded-2xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">{done}</p>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <ul className="space-y-3">
        {cats.map((c) => {
          const items = dishes.filter((d) => d.categoryId === c.id);
          const overrides = items.filter((d) => d.stationId && d.stationId !== c.stationId).length;
          const expanded = open.has(c.id);
          return (
            <li key={c.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{c.name}</p>
                    <button
                      type="button"
                      onClick={() =>
                        setOpen((o) => {
                          const n = new Set(o);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-fg-muted hover:text-fg"
                      aria-expanded={expanded}
                    >
                      {t("dishes", { n: items.length })}
                      {overrides ? ` · ${t("overrides", { n: overrides })}` : ""}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
                      />
                    </button>
                  </div>
                  <div
                    className="flex flex-wrap gap-1 rounded-2xl bg-surface-2 p-1"
                    role="radiogroup"
                    aria-label={c.name}
                  >
                    {[...stations, { id: null, name: t("everyScreen"), color: "" }].map((s) => {
                      const on = c.stationId === s.id;
                      return (
                        <button
                          key={s.id ?? "all"}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={!canManage || pending}
                          onClick={() =>
                            run(async () => {
                              setCat({ id: c.id, stationId: s.id });
                              return setCategoryStationAction(restaurantId, c.id, s.id);
                            })
                          }
                          className={cn(
                            "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors disabled:cursor-default",
                            on ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted hover:text-fg",
                          )}
                        >
                          {s.id ? (
                            <span
                              className={cn("size-2 rounded-full", STATION_TONE[s.color]?.dot)}
                              aria-hidden="true"
                            />
                          ) : null}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {expanded ? (
                  <ul className="divide-y divide-border border-t border-border bg-surface-2/40">
                    {items.map((d) => {
                      const own = d.stationId && d.stationId !== c.stationId ? byId.get(d.stationId) : null;
                      return (
                        <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="min-w-0 flex-1 text-sm font-medium">
                            {d.name}
                            {own ? (
                              <span
                                className={cn(
                                  "ms-2 rounded-full px-2 py-0.5 text-[11px] font-bold",
                                  STATION_TONE[own.color]?.soft,
                                )}
                              >
                                {own.name}
                              </span>
                            ) : null}
                          </span>
                          <select
                            aria-label={d.name}
                            disabled={!canManage || pending}
                            value={d.stationId && d.stationId !== c.stationId ? d.stationId : ""}
                            onChange={(e) =>
                              run(async () => {
                                const id = e.target.value || null;
                                setDish({ id: d.id, stationId: id });
                                return setProductStationAction(restaurantId, d.id, id);
                              })
                            }
                            className="h-9 rounded-xl border border-border-strong bg-surface px-2 text-sm"
                          >
                            <option value="">
                              {t("likeCategory", {
                                station: c.stationId
                                  ? (byId.get(c.stationId)?.name ?? "—")
                                  : t("everyScreen"),
                              })}
                            </option>
                            {stations
                              .filter((s) => s.id !== c.stationId)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        </li>
                      );
                    })}
                    {!items.length ? (
                      <li className="px-4 py-3 text-sm text-fg-muted">{t("noDishes")}</li>
                    ) : null}
                  </ul>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
