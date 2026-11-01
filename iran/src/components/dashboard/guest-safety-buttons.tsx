"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  blockGuestAction,
  confirmTableAction,
  unblockGuestAction,
} from "@/app/[locale]/dashboard/[restaurantId]/security-actions";

function useRun() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string } | null | undefined | void>) =>
    startTransition(async () => {
      const res = await fn();
      if (res && !res.ok) {
        const key = `errorCodes.${res.error}`;
        setError(t.has(key) ? t(key) : t("errorCodes.internal"));
      } else setError(null);
      router.refresh();
    });
  return { t, pending, error, run };
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="max-w-56 text-end text-xs text-danger">
      {error}
    </p>
  ) : null;
}

/** A table opened by a scan waits for a waiter before it may order (guestOrdersNeedStaff). */
export function ConfirmTableButton({
  restaurantId,
  tableId,
  size = "sm",
}: {
  restaurantId: string;
  tableId: string;
  size?: "sm" | "md";
}) {
  const { t, pending, error, run } = useRun();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size={size}
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          run(() => confirmTableAction(restaurantId, tableId));
        }}
      >
        <Check className="size-4" aria-hidden="true" />
        {t("safety.confirmTable")}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

/** Keeps a seat's device out of the restaurant and cancels its waiting orders. */
export function BlockParticipantButton({
  restaurantId,
  participantId,
  name,
}: {
  restaurantId: string;
  participantId: string;
  name: string;
}) {
  const { t, pending, error, run } = useRun();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        className="text-danger"
        onClick={() => {
          if (!window.confirm(t("safety.blockConfirm", { name }))) return;
          const reason = window.prompt(t("orders.blockReason")) ?? "";
          run(() => blockGuestAction(restaurantId, { participantId }, reason));
        }}
      >
        <Ban className="size-4" aria-hidden="true" />
        {t("orders.block")}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}

export function UnblockButton({ restaurantId, blockId }: { restaurantId: string; blockId: string }) {
  const { t, pending, error, run } = useRun();
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => run(() => unblockGuestAction(restaurantId, blockId))}
      >
        {t("safety.unblock")}
      </Button>
      <ErrorLine error={error} />
    </div>
  );
}
