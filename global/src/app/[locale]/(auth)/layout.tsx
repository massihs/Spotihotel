import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="flex min-h-dvh flex-col px-5">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-6">
        <Link href="/" aria-label="Spotifood">
          <Logo />
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 pt-6 pb-16">{children}</main>
    </div>
  );
}
