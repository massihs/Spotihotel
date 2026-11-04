import { LogIn, MonitorPlay } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Beacon } from "./beacon";

/** The public site's top bar (landing, pricing). `home`: anchors scroll in place. */
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
          <a href={anchor("contact")} className="hover:text-fg">
            {t("nav.contact")}
          </a>
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Link
            href="/demo"
            className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-fg-muted ring-1 ring-border hover:text-fg md:inline-flex"
          >
            <MonitorPlay className="size-4" aria-hidden="true" />
            {t("ctaDemo")}
          </Link>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <Link
            href="/login"
            aria-label={t("ctaSecondary")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap text-fg-muted ring-1 ring-border hover:text-fg sm:ring-0"
          >
            <LogIn className="size-4 sm:hidden" aria-hidden="true" />
            <span className="max-sm:sr-only">{t("ctaSecondary")}</span>
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
