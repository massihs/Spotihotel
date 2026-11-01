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
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1916" },
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
      className={`${sans.variable} ${persian.variable}`}
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
