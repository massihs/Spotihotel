import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale, localeDirection, LOCALES } from "@/i18n/config";
import "@/styles/globals.css";

// Fonts are self-hosted (no request to Google at build or run time: unreachable from Iran,
// and avoids sending visitors' IPs to a third party). Inter for Latin, Vazirmatn for Persian/Arabic.
const sans = localFont({
  src: "../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans-loaded",
  display: "swap",
});
const persian = localFont({
  src: "../../../node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-fa-loaded",
  display: "swap",
  // Font loader options must be literals: not preloaded (≈ 60 KB), fetched as soon as Persian/Arabic
  // text is rendered, with `swap` so text is never invisible.
  preload: false,
});
// Persian UI font with Persian digits (non-Latin subset, ≈ 22 KB per weight): any number on a Persian
// page renders as ۰-۹ — prices, table labels, quantities, order numbers — whatever produced it.
const persianDigits = localFont({
  src: [
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-SemiBold.woff2",
      weight: "600",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-Bold.woff2",
      weight: "700",
    },
    {
      path: "../../../node_modules/vazirmatn/misc/UI-Farsi-Digits-Non-Latin/fonts/webfonts/Vazirmatn-UI-FD-NL-ExtraBold.woff2",
      weight: "800",
    },
  ],
  variable: "--font-fa-digits",
  display: "swap",
  preload: false,
});

// Display faces of the guest menu themes (Atelier: Persian serif, Nuit: modern Kufi).
const menuSerif = localFont({
  src: "../../../node_modules/@fontsource-variable/markazi-text/files/markazi-text-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-serif",
  display: "swap",
  preload: false,
});
const menuKufi = localFont({
  src: "../../../node_modules/@fontsource-variable/reem-kufi/files/reem-kufi-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-kufi",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Spotifood", template: "%s · Spotifood" },
  applicationName: "Spotifood",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${sans.variable} ${persian.variable} ${persianDigits.variable} ${menuSerif.variable} ${menuKufi.variable}`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
