import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { isLocale, localeDirection, LOCALES } from "@/i18n/config";
import "@/styles/globals.css";

// Fonts are self-hosted (no request to Google at build or run time: unreachable from Iran,
// and avoids sending visitors' IPs to a third party). Inter for Latin, Estedad for Persian/Arabic.
const sans = localFont({
  src: "../../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-sans-loaded",
  display: "swap",
});
// Estedad: open, modern Persian letterforms with a large eye, clear in tables and dense lists.
const persian = localFont({
  src: "../../../node_modules/@fontsource-variable/estedad/files/estedad-arabic-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-fa-loaded",
  display: "swap",
  // Font loader options must be literals: not preloaded (≈ 55 KB), fetched as soon as Persian/Arabic
  // text is rendered, with `swap` so text is never invisible.
  preload: false,
});
// The digits 0-9 drawn as ۰-۹ in Estedad (≈ 4 KB, all weights): on a Persian page any number —
// prices, room numbers, quantities, order numbers — renders in Persian whatever produced it.
const persianDigits = localFont({
  src: "../../fonts/persian-digits.woff2",
  weight: "100 900",
  variable: "--font-fa-digits",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

// Display faces of the guest menu themes (Atelier: Persian serif, Nuit: modern Kufi).
// No metric fallback: characters outside the Arabic cut (Latin letters, ASCII digits) go on to
// the next font of the stack (Persian digits on Persian pages), not to a local Arial.
const menuSerif = localFont({
  src: "../../../node_modules/@fontsource-variable/markazi-text/files/markazi-text-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-serif",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
// The same serif for Latin text (French and English titles): its own family, with no metric
// fallback, so Persian letters fall through to the Persian cut above.
const displayLatin = localFont({
  src: "../../../node_modules/@fontsource-variable/markazi-text/files/markazi-text-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-display-latin",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
const menuKufi = localFont({
  src: "../../../node_modules/@fontsource-variable/reem-kufi/files/reem-kufi-arabic-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-menu-kufi",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Spotihotel", template: "%s | Spotihotel" },
  applicationName: "Spotihotel",
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
    { media: "(prefers-color-scheme: dark)", color: "#ffffff" },
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
      className={`${sans.variable} ${persian.variable} ${persianDigits.variable} ${menuSerif.variable} ${displayLatin.variable} ${menuKufi.variable}`}
      data-scroll-behavior="smooth"
      // Day mode by default; a saved night mode is applied before paint by THEME_SCRIPT.
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
