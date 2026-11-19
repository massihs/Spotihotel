"use client";

import { useTranslations } from "next-intl";
import { RunButton } from "@/components/pms/kit";
import { payOutTipsAction } from "./actions";

export function PayOutButton({
  rid,
  staffUserId,
  amount,
}: {
  rid: string;
  staffUserId: string;
  amount: string;
}) {
  const t = useTranslations("tipsAdmin");
  return (
    <RunButton
      run={() => payOutTipsAction(rid, staffUserId)}
      confirm={t("payOutConfirm", { amount })}
      variant="primary"
    >
      {t("payOut")}
    </RunButton>
  );
}
