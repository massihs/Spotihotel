import { CircleUser, Store } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Beacon } from "./beacon";

/** The public site's top bar (landing, restaurant guide). `home`: anchors scroll in place. */
export async function SiteHeader({
  home = false,
  active,
}: {
  home?: boolean;
  active?: "restaurants" | "pricing";
}) {
  const t = await getTranslations("landing");
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
      <Beacon />
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <Logo />
        <nav className="ms-6 hidden items-center gap-5 text-sm font-medium whitespace-nowrap text-fg-muted lg:flex">
          <Link
            href="/restaurants"
            className={cn("hover:text-fg", active === "restaurants" && "font-semibold text-fg")}
          >
            {t("nav.restaurants")}
          </Link>
          <Link
            href="/pricing"
            className={cn("hover:text-fg", active === "pricing" && "font-semibold text-fg")}
          >
            {t("nav.pricing")}
          </Link>
          <a href={anchor("how")} className="hover:text-fg">
            {t("nav.how")}
          </a>
          <a href={anchor("features")} className="hover:text-fg">
            {t("nav.features")}
          </a>
          <a href={anchor("faq")} className="hover:text-fg">
            {t("nav.faq")}
          </a>
          <Link href="/radio" className="hover:text-fg">
            {t("nav.radio")}
          </Link>
          <a href={anchor("contact")} className="hover:text-fg">
            {t("nav.contact")}
          </a>
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Link
            href="/restaurants"
            aria-label={t("nav.restaurants")}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-fg-muted ring-1 ring-border hover:text-fg lg:hidden",
              active === "restaurants" && "bg-accent-soft text-accent-text ring-0",
            )}
          >
            <Store className="size-4" aria-hidden="true" />
            <span className="max-[420px]:sr-only">{t("nav.restaurants")}</span>
          </Link>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link
            href="/account"
            aria-label={t("nav.account")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-fg-muted ring-1 ring-border hover:text-fg"
          >
            <CircleUser className="size-4" aria-hidden="true" />
            <span className="hidden xl:inline">{t("nav.account")}</span>
          </Link>
          <Link
            href="/login"
            className="hidden h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap text-fg-muted hover:text-fg sm:inline-flex"
          >
            {t("ctaSecondary")}
          </Link>
          <Link href="/signup" className={buttonClasses("accent", "sm", "h-9 px-4")}>
            {/* Phones: the short label, so the bar never overflows in English or French. */}
            <span className="sm:hidden">{t("footer.signup")}</span>
            <span className="hidden sm:inline">{t("ctaPrimary")}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
