import { Check, ChefHat, QrCode } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

const PHOTOS = [
  "/landing/pepperoni.jpg",
  "/landing/salmon.jpg",
  "/landing/rockshrimp.jpg",
  "/landing/baconavocado.jpg",
];

/**
 * Sign in / sign up: the form on one side and, from laptops up, a dark brand panel (what
 * Spotifood does, a few dishes, a live "order ready" chip) on the other.
 */
export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("landing");
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative flex min-h-dvh flex-col overflow-hidden px-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -end-40 -top-40 size-[28rem] rounded-full bg-accent/12 blur-3xl lg:hidden"
        />
        <header className="relative mx-auto flex w-full max-w-md items-center justify-between py-6">
          <Link href="/" aria-label="Spotifood">
            <Logo />
          </Link>
          <LanguageSwitcher />
        </header>
        <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center pt-2 pb-16">
          <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-float)] sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            {children}
          </div>
        </main>
      </div>

      <aside className="landing-hero relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="landing-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            {t("badge")}
          </p>
          <h2 className="mt-6 max-w-lg text-4xl leading-[1.15] font-black tracking-tight text-balance xl:text-5xl">
            {t.rich("titleRich", { hl: (c) => <span className="landing-highlight">{c}</span> })}
          </h2>
          <ul className="mt-7 space-y-3 text-[15px] text-white/80">
            {(["noApp", "zarinpal", "invoice"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/90 text-accent-fg">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {t(`trust.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-10">
          <div className="grid grid-cols-2 gap-3 xl:gap-4">
            {PHOTOS.map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                className={`aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/10 ${i % 2 ? "translate-y-6" : ""}`}
              />
            ))}
          </div>
          <div className="landing-float absolute start-6 -top-6 flex items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[#1c1917] shadow-xl">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-fg">
              <QrCode className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold">{t("mock.table")}</span>
          </div>
          <div className="landing-float-slow absolute end-6 -bottom-2 flex items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[#1c1917] shadow-xl">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-500 text-white">
              <ChefHat className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold">{t("float.ready")}</span>
          </div>
        </div>

        <p className="relative mt-12 max-w-lg text-sm leading-6 text-white/60">{t("subtitle")}</p>
      </aside>
    </div>
  );
}
