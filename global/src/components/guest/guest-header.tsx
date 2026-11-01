import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "@/i18n/navigation";
import { isLocale, type AppLocale } from "@/i18n/config";
import type { GuestContext } from "@/server/modules/guest/sessions";
import { logoUrl } from "@/server/modules/restaurants/settings";

export async function GuestHeader({ guest, orderCount = 0 }: { guest: GuestContext; orderCount?: number }) {
  const t = await getTranslations("guest");
  const logo = logoUrl(guest.restaurant.logoKey);
  const who = guest.participant.displayName ?? t("you", { n: guest.participant.seq });
  const locales = guest.restaurant.enabledLocales.filter(isLocale) as AppLocale[];
  return (
    <header className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
      {logo ? (
        <img
          src={logo}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-xl object-contain"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg leading-tight font-semibold">{guest.restaurant.name}</h1>
        <p className="truncate text-sm text-fg-muted">{t("seatOf", { table: guest.table.label, who })}</p>
      </div>
      {orderCount > 0 ? (
        <Link
          href="/table/orders"
          className="shrink-0 rounded-full bg-accent-soft px-3 py-2 text-sm font-medium text-accent"
        >
          {t("ordersLink", { count: orderCount })}
        </Link>
      ) : null}
      {locales.length > 1 ? <LanguageSwitcher locales={locales} /> : null}
    </header>
  );
}
