"use client";

import {
  Bike,
  Boxes,
  Calculator,
  CalendarClock,
  ChefHat,
  FileText,
  HeartHandshake,
  LayoutGrid,
  Music,
  Network,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useOptimistic, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { setModuleAction } from "./actions";

const ICONS: Record<ModuleKey, ReactNode> = {
  pos: <Calculator />,
  kitchen: <ChefHat />,
  floor: <LayoutGrid />,
  delivery: <Bike />,
  reservations: <CalendarClock />,
  inventory: <Boxes />,
  customers: <HeartHandshake />,
  invoices: <FileText />,
  branches: <Network />,
  music: <Music />,
};

/** On/off switches for optional modules: what is off disappears from the navigation. */
export function ModulesForm({
  restaurantId,
  disabled: initial,
  readOnly,
}: {
  restaurantId: string;
  disabled: ModuleKey[];
  readOnly: boolean;
}) {
  const t = useTranslations("settings.moduleList");
  const tErr = useTranslations("errorCodes");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [off, setOff] = useOptimistic(
    new Set(initial),
    (cur: Set<ModuleKey>, [m, on]: [ModuleKey, boolean]) => {
      const next = new Set(cur);
      if (on) next.delete(m);
      else next.add(m);
      return next;
    },
  );

  const toggle = (m: ModuleKey, on: boolean) =>
    start(async () => {
      setError(null);
      setOff([m, on]);
      const res = await setModuleAction(restaurantId, m, on);
      if (res && !res.ok) setError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
    });

  return (
    <>
      {error ? <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2" aria-busy={pending}>
        {MODULES.map((m) => {
          const on = !off.has(m);
          return (
            <li key={m}>
              <label
                className={cn(
                  "flex h-full cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                  on ? "border-accent/40 bg-accent-soft/40" : "border-border bg-surface",
                  readOnly && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5",
                    on ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg-subtle",
                  )}
                  aria-hidden="true"
                >
                  {ICONS[m]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`${m}.title`)}</span>
                  <span className="mt-0.5 block text-sm text-fg-muted">{t(`${m}.desc`)}</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  disabled={readOnly}
                  onChange={(e) => toggle(m, e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                    on ? "bg-accent" : "bg-surface-3",
                  )}
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start]",
                      on ? "start-[1.375rem]" : "start-0.5",
                    )}
                  />
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
