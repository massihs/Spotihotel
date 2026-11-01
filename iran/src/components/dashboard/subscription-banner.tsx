import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { SubscriptionState } from "@/server/modules/billing/service";

/** Trial running, period ending soon, or expired (the restaurant is back on Free limits). */
export async function SubscriptionBanner({
  restaurantId,
  notice,
}: {
  restaurantId: string;
  notice: SubscriptionState;
}) {
  const t = await getTranslations("billing.banner");
  const expired = notice.kind === "expired";
  const text =
    notice.kind === "trial"
      ? t("trial", { days: notice.daysLeft, plan: notice.planName })
      : notice.kind === "paid"
        ? t("ending", { days: notice.daysLeft ?? 0, plan: notice.planName })
        : notice.kind === "expired"
          ? t(notice.wasTrial ? "trialOver" : "expired", { plan: notice.planName })
          : "";
  return (
    <div
      role={expired ? "alert" : "status"}
      className={cn(
        "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium",
        expired ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-text",
      )}
    >
      <span>{text}</span>
      <Link
        href={`/dashboard/${restaurantId}/billing`}
        className="rounded-full bg-fg px-4 py-1.5 text-xs font-bold text-bg"
      >
        {expired ? t("renew") : t("choose")}
      </Link>
    </div>
  );
}
