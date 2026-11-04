import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui/logo";
import { Link } from "@/i18n/navigation";

/** The public site's footer: the brand, three columns of links, then rights and language. */
export async function SiteFooter() {
  const t = await getTranslations("landing");
  const columns = [
    {
      title: t("footer.product"),
      links: [
        { href: "/#features", label: t("nav.features") },
        { href: "/pricing", label: t("nav.pricing") },
        { href: "/#how", label: t("nav.how") },
        { href: "/#faq", label: t("nav.faq") },
      ],
    },
    {
      title: t("footer.explore"),
      links: [
        { href: "/demo", label: t("ctaDemo") },
        { href: "/#contact", label: t("nav.contact") },
      ],
    },
    {
      title: t("footer.account"),
      links: [
        { href: "/login", label: t("footer.login") },
        { href: "/signup", label: t("footer.signup") },
      ],
    },
  ];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))] md:gap-10">
        <div className="col-span-3 max-w-xs md:col-span-1">
          <Logo />
          <p className="mt-4 text-sm leading-6 text-fg-muted">{t("footer.tagline")}</p>
        </div>
        {columns.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <p className="text-sm font-bold">{c.title}</p>
            <ul className="mt-3 space-y-2.5 text-sm text-fg-muted">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-accent-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 text-sm text-fg-muted sm:px-6">
          <p>{t("footer.rights")}</p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
