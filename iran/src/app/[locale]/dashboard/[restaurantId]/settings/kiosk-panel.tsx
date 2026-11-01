"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { updateKioskAction } from "./online-actions";

/** Self-order kiosk: on/off and the tablet's private link (new link = old tablets cut off). */
export function KioskPanel({
  restaurantId,
  appUrl,
  disabled,
  values,
}: {
  restaurantId: string;
  appUrl: string;
  disabled: boolean;
  values: { enabled: boolean; token: string | null };
}) {
  const t = useTranslations("online.kiosk");
  const router = useRouter();
  const [v, setV] = useState(values);
  const [pending, startTransition] = useTransition();
  const run = (enabled: boolean, regenerate = false) =>
    startTransition(async () => {
      const res = await updateKioskAction(restaurantId, enabled, regenerate);
      if (res?.ok && res.data) setV({ enabled: res.data.enabled, token: res.data.token });
      router.refresh();
    });
  const url = v.token ? `${appUrl}/kiosk/${v.token}` : null;
  return (
    <div className="space-y-3 rounded-2xl bg-surface-2 p-4">
      <Checkbox
        checked={v.enabled}
        disabled={disabled || pending}
        onChange={(e) => run(e.currentTarget.checked)}
        label={t("enabled")}
        description={t("hint")}
      />
      {v.enabled && url ? (
        <>
          <p className="rounded-xl bg-surface px-3 py-2 font-mono text-xs break-all" dir="ltr">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-semibold ring-1 ring-border"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {t("open")}
            </a>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || pending}
              onClick={() => window.confirm(t("regenerateConfirm")) && run(true, true)}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {t("regenerate")}
            </Button>
          </div>
          <p className="text-xs text-fg-muted">{t("private")}</p>
        </>
      ) : null}
    </div>
  );
}
