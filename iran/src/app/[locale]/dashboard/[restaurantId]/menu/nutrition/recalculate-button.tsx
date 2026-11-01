"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { recalculateMenuAction } from "./actions";

export function RecalculateButton({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("foodDb");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<number | null>(null);
  return (
    <div className="flex items-center gap-3">
      {done != null ? (
        <span className="text-sm font-medium text-success">{t("recalculated", { n: done })}</span>
      ) : null}
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await recalculateMenuAction(restaurantId);
            if (res?.ok) setDone(res.data?.updated ?? 0);
          })
        }
      >
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
        {t("recalculate")}
      </Button>
    </div>
  );
}
