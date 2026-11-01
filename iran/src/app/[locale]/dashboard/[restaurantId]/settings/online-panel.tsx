"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { updateOnlineSettingsAction } from "./online-actions";

/** Online ordering site: on/off, takeaway, delivery, and the link to share (Instagram bio). */
export function OnlinePanel({
  restaurantId,
  url,
  hasZones,
  disabled,
  values,
}: {
  restaurantId: string;
  url: string;
  hasZones: boolean;
  disabled: boolean;
  values: { onlineOrderingEnabled: boolean; onlineTakeaway: boolean; onlineDelivery: boolean };
}) {
  const t = useTranslations("online.settings");
  const router = useRouter();
  const [v, setV] = useState(values);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const save = (next: typeof v) => {
    setV(next);
    startTransition(async () => {
      const res = await updateOnlineSettingsAction(restaurantId, next);
      if (res && !res.ok) setV(v);
      router.refresh();
    });
  };
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
        <Checkbox
          checked={v.onlineOrderingEnabled}
          disabled={disabled || pending}
          onChange={(e) => save({ ...v, onlineOrderingEnabled: e.currentTarget.checked })}
          label={t("enabled")}
          description={t("enabledHint")}
        />
        <Checkbox
          checked={v.onlineTakeaway}
          disabled={disabled || pending || !v.onlineOrderingEnabled}
          onChange={(e) => save({ ...v, onlineTakeaway: e.currentTarget.checked })}
          label={t("takeaway")}
        />
        <Checkbox
          checked={v.onlineDelivery}
          disabled={disabled || pending || !v.onlineOrderingEnabled}
          onChange={(e) => save({ ...v, onlineDelivery: e.currentTarget.checked })}
          label={t("delivery")}
          description={hasZones ? t("deliveryHint") : t("noZones")}
        />
      </div>
      {v.onlineOrderingEnabled ? (
        <div className="rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold">{t("link")}</p>
          <p className="mt-1 text-xs text-fg-muted">{t("linkHint")}</p>
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm break-all" dir="ltr">
            {url}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
            >
              <Copy className="size-4" aria-hidden="true" />
              {copied ? t("copied") : t("copy")}
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-border"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("open")}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
