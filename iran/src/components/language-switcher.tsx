"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LOCALE_LABELS, LOCALES, type AppLocale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

/** Compact pill (globe + current language). A transparent native <select> on top keeps the
 * platform picker — the best one on phones — and full accessibility. */
export function LanguageSwitcher({
  className,
  locales = LOCALES,
  tone = "default",
}: {
  className?: string;
  locales?: readonly AppLocale[];
  tone?: "default" | "inverted";
}) {
  const t = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label
      className={cn(
        "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium",
        tone === "inverted" ? "bg-white/15 text-white" : "bg-surface-2 text-fg",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe className="size-4" aria-hidden="true" />
      <span aria-hidden="true">{LOCALE_LABELS[locale]}</span>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        disabled={pending}
        onChange={(e) =>
          startTransition(() => router.replace(pathname, { locale: e.target.value as AppLocale }))
        }
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
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
