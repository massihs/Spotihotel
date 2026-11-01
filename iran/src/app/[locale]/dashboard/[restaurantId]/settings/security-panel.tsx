"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/form";
import { UnblockButton } from "@/components/dashboard/guest-safety-buttons";
import { setScansNeedStaffAction } from "../security-actions";

export type BlockRow = {
  id: string;
  tableLabel: string | null;
  orderNumber: string | null;
  reason: string | null;
  createdAt: Date;
};

/** Anti-abuse: tables opened by the staff only, and the devices the staff blocked. */
export function SecurityPanel({
  restaurantId,
  needStaff,
  blocks,
  canManage,
  canUnblock,
  timeZone,
}: {
  restaurantId: string;
  needStaff: boolean;
  blocks: BlockRow[];
  canManage: boolean;
  canUnblock: boolean;
  timeZone: string;
}) {
  const t = useTranslations("safety");
  const format = useFormatter();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(needStaff);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-surface-2 p-4">
        <Checkbox
          checked={on}
          disabled={!canManage || pending}
          onChange={(e) => {
            const next = e.currentTarget.checked;
            setOn(next);
            startTransition(async () => {
              const res = await setScansNeedStaffAction(restaurantId, next);
              if (res && !res.ok) setOn(!next);
              router.refresh();
            });
          }}
          label={t("needStaff")}
          description={t("needStaffHint")}
        />
      </div>
      <p className="text-sm text-fg-muted">{t("limitsHint")}</p>
      <div>
        <h3 className="text-sm font-semibold">{t("blockedTitle", { count: blocks.length })}</h3>
        {blocks.length === 0 ? (
          <p className="mt-2 text-sm text-fg-subtle">{t("blockedEmpty")}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border">
            {blocks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {[
                      b.tableLabel ? t("blockedTable", { label: b.tableLabel }) : null,
                      b.orderNumber ? `#${b.orderNumber}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t("blockedDevice")}
                  </p>
                  <p className="text-fg-muted">
                    {format.dateTime(b.createdAt, { dateStyle: "medium", timeStyle: "short", timeZone })}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </p>
                </div>
                {canUnblock ? <UnblockButton restaurantId={restaurantId} blockId={b.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
