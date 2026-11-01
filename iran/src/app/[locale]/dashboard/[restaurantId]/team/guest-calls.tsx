"use client";

import { BellRing, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { field, useRun } from "@/components/ui/sheet-kit";
import { CALL_ICON, CALL_TONES } from "@/components/guest/call-icons";
import { cn } from "@/lib/cn";
import { saveGuestCallsAction } from "./actions";

export type CallView = {
  key: string;
  label?: string;
  icon?: string;
  sectionId?: string | null;
  enabled: boolean;
  roomOnly?: boolean;
};

/**
 * The bell guests see on the menu: which options it offers (waiter, the bill, water, or the
 * restaurant's own like "charcoal for the hookah") and which team section each one rings.
 */
export function GuestCallsPanel({
  restaurantId,
  calls,
  sections,
  icons,
  hotel = false,
}: {
  restaurantId: string;
  calls: CallView[];
  sections: { id: string; name: string }[];
  icons: string[];
  /** The hotel's services page: room services first, custom ones can be for rooms only. */
  hotel?: boolean;
}) {
  const t = useTranslations("team.calls");
  const tc = useTranslations("common");
  const tk = useTranslations("guest.waiter.kinds");
  const { pending, error, run } = useRun();
  const [list, setList] = useState(calls);
  const [saved, setSaved] = useState(false);
  const patch = (key: string, p: Partial<CallView>) => {
    setSaved(false);
    setList((x) => x.map((c) => (c.key === key ? { ...c, ...p } : c)));
  };
  const add = () => {
    setSaved(false);
    const key = `c-${Math.random().toString(36).slice(2, 8)}`;
    setList((x) => [
      ...x,
      { key, label: "", icon: hotel ? "bell" : "flame", sectionId: null, enabled: true, roomOnly: hotel },
    ]);
  };
  const custom = (c: CallView) => c.key.startsWith("c-");

  return (
    <Card className="mb-4 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <BellRing className="size-4 text-accent-text" aria-hidden="true" />
        {hotel ? t("hotelTitle") : t("title")}
      </h2>
      <p className="mt-0.5 mb-3 text-sm text-fg-muted">{hotel ? t("hotelHint") : t("hint")}</p>
      <div className="space-y-2">
        {list.map((c, i) => {
          const Icon = CALL_ICON[c.icon ?? "bell"] ?? BellRing;
          return (
            <div
              key={c.key}
              className={cn(
                "flex flex-wrap items-center gap-2.5 rounded-2xl border border-border p-2.5",
                !c.enabled && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "grid size-10 shrink-0 place-items-center rounded-xl",
                  CALL_TONES[i % CALL_TONES.length],
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
              </span>
              {custom(c) ? (
                <input
                  value={c.label ?? ""}
                  onChange={(e) => patch(c.key, { label: e.target.value })}
                  placeholder={t("labelPlaceholder")}
                  maxLength={32}
                  aria-label={t("label")}
                  className={cn(field, "h-10 min-w-36 flex-1")}
                />
              ) : (
                <span className="min-w-28 flex-1 font-semibold">{tk(c.key as "waiter")}</span>
              )}
              {custom(c) ? (
                <select
                  value={c.icon ?? "bell"}
                  onChange={(e) => patch(c.key, { icon: e.target.value })}
                  aria-label={t("icon")}
                  className={cn(field, "h-10 w-auto")}
                >
                  {icons.map((ic) => (
                    <option key={ic} value={ic}>
                      {t(`icons.${ic}`)}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                value={c.sectionId ?? ""}
                onChange={(e) => patch(c.key, { sectionId: e.target.value || null })}
                aria-label={t("routeTo")}
                className={cn(field, "h-10 w-auto max-w-48")}
              >
                <option value="">{t("routeDefault")}</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={c.enabled}
                  onChange={(e) => patch(c.key, { enabled: e.target.checked })}
                />
                {t("shown")}
              </label>
              {hotel && custom(c) ? (
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={c.roomOnly ?? false}
                    onChange={(e) => patch(c.key, { roomOnly: e.target.checked })}
                  />
                  {t("roomOnly")}
                </label>
              ) : null}
              {custom(c) ? (
                <button
                  type="button"
                  onClick={() => (setSaved(false), setList((x) => x.filter((y) => y.key !== c.key)))}
                  className="grid size-9 place-items-center rounded-full text-danger hover:bg-danger-soft"
                  aria-label={t("remove")}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          disabled={list.length >= 28}
          className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ring-border hover:bg-surface-2"
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("add")}
        </button>
        <button
          type="button"
          disabled={pending || list.some((c) => custom(c) && !c.label?.trim())}
          onClick={() =>
            run(
              () => saveGuestCallsAction(restaurantId, list),
              () => setSaved(true),
            )
          }
          className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg disabled:opacity-50"
        >
          {tc("save")}
        </button>
        {saved ? <span className="text-sm text-success">{t("saved")}</span> : null}
      </div>
    </Card>
  );
}
