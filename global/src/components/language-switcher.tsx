"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALE_LABELS, LOCALES, type AppLocale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageSwitcher({
  className,
  locales = LOCALES,
}: {
  className?: string;
  locales?: readonly AppLocale[];
}) {
  const t = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className={className}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => router.replace(pathname, { locale: e.target.value as AppLocale }))
        }
        className="h-9 rounded-lg border border-border bg-surface px-2 text-sm text-fg-muted hover:text-fg"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
