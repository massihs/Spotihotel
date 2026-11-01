"use client";

import { CalendarDays, CalendarRange, Check, Loader2, Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import {
  cancelMusicRequestAction,
  requestMusicAction,
} from "@/app/[locale]/dashboard/[restaurantId]/music/actions";

type Theme = { id: string; name: string; description: string | null; color: string; trackCount: number };

/** Two plans, a theme picker, one button. Payment is confirmed by the Spotifood team. */
export function SubscribeForm({
  restaurantId,
  themes,
  prices,
  defaultPlan = "weekly",
  defaultTheme,
  canManage,
}: {
  restaurantId: string;
  themes: Theme[];
  prices: { weekly: string; monthly: string };
  defaultPlan?: "weekly" | "monthly";
  defaultTheme?: string;
  canManage: boolean;
}) {
  const t = useTranslations("music");
  const [plan, setPlan] = useState<"weekly" | "monthly">(defaultPlan);
  const [theme, setTheme] = useState(defaultTheme ?? themes[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {(["weekly", "monthly"] as const).map((p) => {
          const Icon = p === "weekly" ? CalendarDays : CalendarRange;
          const on = plan === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              aria-pressed={on}
              className={cn(
                "relative rounded-2xl border-2 bg-surface p-5 text-start transition-colors",
                on ? "border-accent shadow-accent" : "border-border hover:border-border-strong",
              )}
            >
              {p === "weekly" ? (
                <span className="absolute end-4 top-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-fg">
                  {t("popular")}
                </span>
              ) : null}
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-xl",
                  on ? "bg-accent text-accent-fg" : "bg-accent-soft text-accent-text",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-lg font-bold">{t(`plans.${p}.name`)}</p>
              <p className="mt-1 text-sm text-fg-muted">{t(`plans.${p}.body`)}</p>
              <p className="mt-4">
                <span className="text-2xl font-bold tabular-nums">{prices[p]}</span>
                <span className="text-sm text-fg-muted"> / {t("perMonth")}</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {(t.raw(`plans.${p}.features`) as string[]).map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-accent"
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-3 font-semibold">{t("chooseTheme")}</p>
        {themes.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-fg-muted">
            {t("noThemesYet")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {themes.map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => setTheme(th.id)}
                aria-pressed={theme === th.id}
                className={cn(
                  "overflow-hidden rounded-2xl border-2 bg-surface text-start transition-colors",
                  theme === th.id ? "border-accent" : "border-border hover:border-border-strong",
                )}
              >
                <span
                  className="flex h-20 items-end p-3 text-white"
                  style={{ background: `linear-gradient(135deg, ${th.color}, #0f172a)` }}
                >
                  <Music className="size-6 opacity-90" aria-hidden="true" />
                </span>
                <span className="block p-3">
                  <span className="block truncate font-semibold">{th.name}</span>
                  <span className="block text-xs text-fg-muted">
                    {t("admin.trackCount", { count: th.trackCount })}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      {canManage ? (
        <button
          type="button"
          disabled={pending || !theme}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await requestMusicAction(restaurantId, plan, theme);
              if (res && !res.ok) setError(t("requestFailed"));
            })
          }
          className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-lg font-bold text-accent-fg shadow-accent disabled:opacity-50 sm:w-auto"
        >
          {pending ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
          {t("subscribe")}
        </button>
      ) : (
        <p className="text-sm text-fg-muted">{t("ownerOnly")}</p>
      )}
    </div>
  );
}

export function CancelRequestButton({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("music");
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => void (await cancelMusicRequestAction(restaurantId)))}
      className="text-sm font-medium text-fg-muted underline-offset-4 hover:text-danger hover:underline"
    >
      {t("cancelRequest")}
    </button>
  );
}
