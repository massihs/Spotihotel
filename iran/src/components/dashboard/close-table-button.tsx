"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeTableAction } from "@/app/[locale]/dashboard/[restaurantId]/live-actions";

/** Frees a table; if something is unpaid or cooking, managers may force it after a second confirmation. */
export function CloseTableButton({
  restaurantId,
  tableId,
  label,
  canForce,
  size = "sm",
  room = false,
}: {
  restaurantId: string;
  tableId: string;
  label: string;
  canForce: boolean;
  size?: "sm" | "md";
  room?: boolean;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (force: boolean): void =>
    startTransition(async () => {
      const res = await closeTableAction(restaurantId, tableId, force);
      if (res?.ok) {
        setMessage(null);
        return;
      }
      const blocking = res?.error === "session_has_unpaid" || res?.error === "session_has_active_orders";
      if (blocking && canForce && window.confirm(t("floor.forceConfirm"))) {
        run(true);
        return;
      }
      const key = `errorCodes.${res?.error}`;
      setMessage(t.has(key) ? t(key) : t("errorCodes.internal"));
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size={size}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (window.confirm(t(room ? "floor.closeConfirmRoom" : "floor.closeConfirm", { label })))
            run(false);
        }}
      >
        {t("floor.close")}
      </Button>
      {message ? (
        <p role="alert" className="max-w-56 text-end text-xs text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}
