"use client";

import { Apple, Download, Laptop, MonitorSmartphone, Trash2, WifiOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revokeDeviceAction } from "./actions";

export type DeviceView = {
  id: string;
  name: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  syncedOrders: number;
  appVersion: string | null;
};

/** The app checks in every minute while it has internet. */
const online = (iso: string | null, now: number) => !!iso && now - Date.parse(iso) < 5 * 60_000;

/** Settings → Desktop app: what it does, where to get it, and the PCs linked to the restaurant. */
export function DesktopPanel({
  restaurantId,
  readOnly,
  devices,
  downloads,
  now,
}: {
  restaurantId: string;
  readOnly: boolean;
  devices: DeviceView[];
  downloads: { windows: string | null; mac: string | null };
  /** Server render time: the same "seen 5 min ago" on the server and in the browser. */
  now: number;
}) {
  const t = useTranslations("settings.desktop");
  const format = useFormatter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["online", "offline", "sync"] as const).map((k, i) => (
          <div key={k} className="rounded-2xl bg-surface-2 p-4">
            <span className="grid size-9 place-items-center rounded-xl bg-surface text-accent-text shadow-[var(--shadow-soft)] [&_svg]:size-4">
              {[<Laptop key="a" />, <WifiOff key="b" />, <MonitorSmartphone key="c" />][i]}
            </span>
            <p className="mt-2 text-sm font-bold">{t(`${k}Title`)}</p>
            <p className="mt-1 text-xs text-fg-muted">{t(`${k}Body`)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {downloads.windows ? (
          <a
            href={downloads.windows}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
          >
            <Download className="size-4" aria-hidden="true" />
            {t("windows")}
          </a>
        ) : null}
        {downloads.mac ? (
          <a
            href={downloads.mac}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-sm font-semibold ring-1 ring-border"
          >
            <Apple className="size-4" aria-hidden="true" />
            {t("mac")}
          </a>
        ) : null}
        {!downloads.windows && !downloads.mac ? <p className="text-sm text-fg-muted">{t("soon")}</p> : null}
      </div>
      <ol className="list-decimal space-y-1 ps-5 text-sm text-fg-muted">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>

      <div>
        <p className="mb-2 text-sm font-bold">{t("linked")}</p>
        {devices.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${online(d.lastSeenAt, now) ? "bg-success" : "bg-fg-subtle"}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {d.name}
                    {d.appVersion ? (
                      <span className="ms-2 text-xs font-normal text-fg-subtle">v{d.appVersion}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-fg-muted">
                    {d.lastSeenAt
                      ? online(d.lastSeenAt, now)
                        ? t("connected")
                        : t("seen", { when: format.relativeTime(new Date(d.lastSeenAt), now) })
                      : t("neverSeen")}
                    {" · "}
                    {t("synced", { n: d.syncedOrders })}
                  </p>
                </div>
                {!readOnly ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("revokeConfirm", { name: d.name }))) return;
                      start(async () => {
                        const res = await revokeDeviceAction(restaurantId, d.id);
                        setError(res && !res.ok ? res.error : null);
                      });
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t("revoke")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-fg-muted">
            {t("none")}
          </p>
        )}
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </div>
    </div>
  );
}
