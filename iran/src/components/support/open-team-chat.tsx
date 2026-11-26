"use client";

import { useTranslations } from "next-intl";
import { Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openSupport } from "./launcher";

/** Opens the hotel's own chat with the Spotihotel team. */
export function OpenTeamChat() {
  const t = useTranslations("support");
  return (
    <Button variant="secondary" size="sm" onClick={openSupport}>
      <Headset className="size-4" aria-hidden="true" />
      {t("writeTeam")}
    </Button>
  );
}
