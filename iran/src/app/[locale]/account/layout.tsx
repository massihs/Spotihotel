import type { Metadata } from "next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { robots: { index: false } };

export default function AccountLayout({ children }: LayoutProps<"/[locale]/account">) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-accent-soft/60 to-bg to-40%">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <LanguageSwitcher />
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">{children}</main>
    </div>
  );
}
