import { COMPANY } from "@/lib/company";
import {
  BedDouble,
  ArrowLeft,
  BarChart3,
  Bike,
  Boxes,
  Building2,
  CalendarCheck,
  Calculator,
  Check,
  ChefHat,
  ChevronDown,
  Clock,
  CreditCard,
  Dices,
  Gift,
  Languages,
  Mail,
  MapPin,
  MessageSquareText,
  Music,
  NotebookPen,
  Phone,
  QrCode,
  ReceiptText,
  Salad,
  ShoppingBag,
  Smartphone,
  SquareMenu,
  Store,
  UtensilsCrossed,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { buttonClasses } from "@/components/ui/button";
import { getPathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { getDirectory } from "@/server/modules/directory/cache";
import { PlaceInitials } from "@/components/ui/place-initials";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: { absolute: t("metaTitle") }, description: t("metaDescription") };
}

const STEPS = [
  { key: "menu", Icon: SquareMenu },
  { key: "qr", Icon: QrCode },
  { key: "serve", Icon: ChefHat },
] as const;

/** Every module of the platform (the big three have their own cards above). */
const MODULES = [
  { key: "pos", Icon: Calculator },
  { key: "waiter", Icon: NotebookPen },
  { key: "delivery", Icon: Bike },
  { key: "reservations", Icon: CalendarCheck },
  { key: "club", Icon: Gift },
  { key: "inventory", Icon: Boxes },
  { key: "branches", Icon: Building2 },
  { key: "hotel", Icon: BedDouble },
  { key: "offline", Icon: WifiOff },
  { key: "music", Icon: Music },
  { key: "games", Icon: Dices },
  { key: "nutrition", Icon: Salad },
] as const;

const MADE_FOR_IRAN = [
  { key: "zarinpal", Icon: CreditCard },
  { key: "invoice", Icon: ReceiptText },
  { key: "toman", Icon: Calculator },
  { key: "rtl", Icon: Languages },
  { key: "offline", Icon: WifiOff },
  { key: "sms", Icon: MessageSquareText },
] as const;

const STATS = ["setup", "app", "langs", "modules"] as const;
const FAQ = ["app", "pay", "cash", "hardware", "offline", "branches", "menu"] as const;

/** Mock dishes shown in the phone preview (no restaurant named). */
const MOCK = [
  { img: "/landing/salmon.jpg", name: "بشقاب سالمون", price: "۲٬۴۰۰٬۰۰۰" },
  { img: "/landing/rockshrimp.jpg", name: "راک شریمپ", price: "۱٬۳۱۹٬۰۰۰" },
  { img: "/landing/baconavocado.jpg", name: "سالاد بیکن و آووکادو", price: "۱٬۲۰۰٬۰۰۰" },
  { img: "/landing/pepperoni.jpg", name: "پیتزا پپرونی", price: "۹۸۰٬۰۰۰" },
];

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const guestPoints = t.raw("split.guest") as string[];
  const ownerPoints = t.raw("split.owner") as string[];

  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader home />

      <main>
        {/* ── Hero ────────────────────────────────────────── */}
        <section className="landing-hero relative isolate overflow-hidden text-white">
          <div aria-hidden="true" className="landing-grid pointer-events-none absolute inset-0 -z-10" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24 lg:pb-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/85 ring-1 ring-white/15 backdrop-blur">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-accent" />
                </span>
                {t("badge")}
              </span>
              <h1 className="mt-6 text-[2.5rem] leading-[1.15] font-black tracking-tight text-balance sm:text-6xl">
                {t.rich("titleRich", {
                  hl: (chunks: ReactNode) => <span className="landing-highlight">{chunks}</span>,
                })}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-pretty text-white/70">{t("subtitle")}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className={buttonClasses("accent", "lg", "px-7 shadow-[0_10px_30px_-8px_var(--accent)]")}
                >
                  {t("ctaPrimary")}
                  <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden="true" />
                </Link>
                <a
                  href={getPathname({ href: "/demo", locale })}
                  className="inline-flex h-12 items-center rounded-full bg-white/10 px-7 font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
                >
                  {t("ctaDemo")}
                </a>
              </div>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65">
                {(["noApp", "zarinpal", "invoice"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <span className="grid size-5 place-items-center rounded-full bg-accent/25">
                      <Check className="size-3 text-white" strokeWidth={3} aria-hidden="true" />
                    </span>
                    {t(`trust.${k}`)}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual t={t} />
          </div>
        </section>

        {/* ── Real restaurants on Spotifood (read at request time: no database at build) ── */}
        <Suspense fallback={null}>
          <RestaurantsStrip locale={locale} />
        </Suspense>

        {/* ── Stats strip ─────────────────────────────────── */}
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
            {STATS.map((k, i) => (
              <div
                key={k}
                className={cn(
                  "px-4 py-8 text-center sm:px-6",
                  i % 2 === 1 && "border-s border-border",
                  i >= 2 && "border-t border-border sm:border-t-0",
                  i === 2 && "sm:border-s",
                )}
              >
                <p className="text-3xl font-black tracking-tight text-accent-text">{t(`stats.${k}.value`)}</p>
                <p className="mt-1.5 text-sm text-fg-muted">{t(`stats.${k}.label`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Platform (bento) ────────────────────────────── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 sm:py-24">
          <SectionTitle
            eyebrow={t("platform.eyebrow")}
            title={t("platform.title")}
            subtitle={t("platform.subtitle")}
          />
          <div className="mt-10 grid gap-4 sm:mt-14 lg:grid-cols-3">
            <BentoCard
              className="lg:col-span-2 lg:row-span-2"
              Icon={QrCode}
              title={t("platform.qr.title")}
              body={t("platform.qr.body")}
            >
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-h-72 lg:flex-1 lg:grid-cols-2 lg:grid-rows-2">
                {["salmon", "pepperoni", "baconavocado", "rockshrimp"].map((n, i) => (
                  <div key={n} className="relative overflow-hidden rounded-2xl lg:min-h-0">
                    <img
                      src={`/landing/${n}.jpg`}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full object-cover transition duration-500 hover:scale-105 lg:aspect-auto lg:h-full"
                    />
                    {i === 0 ? (
                      <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        {t("mock.featured")}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["noApp", "zarinpal", "invoice"] as const).map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent-text"
                  >
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                    {t(`trust.${k}`)}
                  </span>
                ))}
              </div>
            </BentoCard>
            <BentoCard Icon={ChefHat} title={t("platform.kds.title")} body={t("platform.kds.body")}>
              <KitchenTicket t={t} className="mt-5" />
            </BentoCard>
            <BentoCard Icon={BarChart3} title={t("platform.reports.title")} body={t("platform.reports.body")}>
              <MiniChart label={t("platform.mockRevenue")} />
            </BentoCard>
          </div>
          {/* Phones: a swipeable row instead of six rows of two. */}
          <ul className="mt-4 flex snap-x snap-mandatory [scrollbar-width:none] gap-3 overflow-x-auto pb-2 max-sm:-mx-4 max-sm:px-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:pb-0 lg:grid-cols-4">
            {MODULES.map(({ key, Icon }) => (
              <li
                key={key}
                className="group w-48 shrink-0 snap-start rounded-3xl bg-surface p-4 ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)] sm:w-auto sm:p-5"
              >
                <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-text transition group-hover:bg-accent group-hover:text-accent-fg">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-bold">{t(`platform.modules.${key}.title`)}</h3>
                <p className="mt-1.5 text-xs leading-5 text-fg-muted sm:text-sm sm:leading-6">
                  {t(`platform.modules.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── How it works ────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 border-y border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-24">
            <SectionTitle eyebrow={t("howEyebrow")} title={t("howTitle")} subtitle={t("howSubtitle")} />
            <ol className="relative mt-10 grid gap-6 sm:mt-14 md:grid-cols-3">
              <span
                aria-hidden="true"
                className="absolute inset-x-[16%] top-7 hidden border-t-2 border-dashed border-border-strong md:block"
              />
              {STEPS.map(({ key, Icon }, i) => (
                <li key={key} className="relative text-center">
                  <span className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[0_10px_24px_-10px_var(--accent)]">
                    <Icon className="size-6" aria-hidden="true" />
                    <span className="absolute -end-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-xs font-bold text-ink-fg tabular-nums">
                      {i + 1}
                    </span>
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{t(`steps.${key}.title`)}</h3>
                  <p className="mx-auto mt-2 max-w-xs leading-7 text-fg-muted">{t(`steps.${key}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Made for Iran ───────────────────────────────── */}
        <section className="px-4 py-14 sm:px-6 sm:py-24">
          <div className="landing-hero relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-5 py-10 text-white sm:px-12 sm:py-14">
            <div aria-hidden="true" className="landing-grid pointer-events-none absolute inset-0 -z-10" />
            <SectionTitle eyebrow={t("iran.eyebrow")} title={t("iran.title")} dark />
            <ul className="mt-8 grid gap-3 sm:mt-12 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {MADE_FOR_IRAN.map(({ key, Icon }) => (
                <li
                  key={key}
                  className="flex gap-4 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 sm:p-5"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block font-bold">{t(`iran.items.${key}.title`)}</span>
                    <span className="mt-1 block text-sm leading-6 text-white/65">
                      {t(`iran.items.${key}.body`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Guests vs restaurants ───────────────────────── */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 sm:px-6 sm:pb-24 md:grid-cols-2">
          <BenefitCard
            title={t("split.guestTitle")}
            points={guestPoints}
            Icon={Smartphone}
            className="bg-surface ring-1 ring-border"
          />
          <BenefitCard
            title={t("split.ownerTitle")}
            points={ownerPoints}
            Icon={Store}
            className="bg-accent-soft ring-1 ring-accent/20"
          />
        </section>

        {/* ── FAQ ─────────────────────────────────────────── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-14 sm:px-6 sm:pb-24">
          <SectionTitle title={t("faqTitle")} />
          <div className="mt-10 space-y-3">
            {FAQ.map((k) => (
              <details
                key={k}
                className="group rounded-2xl bg-surface px-6 py-5 ring-1 ring-border open:ring-accent/40 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {t(`faq.${k}.q`)}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 transition group-open:rotate-180 group-open:bg-accent group-open:text-accent-fg">
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </span>
                </summary>
                <p className="mt-3 leading-7 text-fg-muted">{t(`faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Contact ─────────────────────────────────────── */}
        <section id="contact" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <SectionTitle title={t("contact.title")} subtitle={t("contact.subtitle")} />
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                key: "phone",
                Icon: Phone,
                value: CONTACT.phone,
                href: `tel:${CONTACT.phoneE164}`,
                ltr: true,
              },
              { key: "email", Icon: Mail, value: CONTACT.email, href: `mailto:${CONTACT.email}`, ltr: true },
              { key: "address", Icon: MapPin, value: t("contact.addressValue"), href: null, ltr: false },
            ].map(({ key, Icon, value, href, ltr }) => (
              <div
                key={key}
                className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-fg-muted">{t(`contact.${key}`)}</span>
                  {href ? (
                    <a
                      href={href}
                      dir={ltr ? "ltr" : undefined}
                      className="mt-1 block font-semibold break-words text-fg hover:text-accent-text"
                    >
                      {value}
                    </a>
                  ) : (
                    <span className="mt-1 block leading-7 font-semibold">{value}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Final CTA ───────────────────────────────────── */}
        <section className="px-4 pb-14 sm:px-6 sm:pb-24">
          <div className="landing-hero relative isolate mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div aria-hidden="true" className="landing-grid pointer-events-none absolute inset-0 -z-10" />
            <h2 className="mx-auto max-w-2xl text-3xl font-black tracking-tight text-balance sm:text-4xl">
              {t("finalTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-8 text-white/70">{t("finalBody")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className={buttonClasses("accent", "lg", "px-8")}>
                {t("ctaPrimary")}
              </Link>
              <Link
                href="/restaurants"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-7 font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"
              >
                <MapPin className="size-4" aria-hidden="true" />
                {t("ctaGuide")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Spotifood's own contact details (the "Contact us" section and the footer). */
const CONTACT = COMPANY;

/** The real restaurants of the public guide (left out while there are fewer than two). */
async function RestaurantsStrip({ locale }: { locale: string }) {
  await connection();
  const [t, all] = await Promise.all([getTranslations("landing"), getDirectory().catch(() => [])]);
  const places = all.slice(0, 14);
  if (places.length < 2) return null;
  return (
    <section className="border-b border-border bg-surface py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
        <p className="text-sm font-semibold text-fg-muted">{t("onSpotifood.title")}</p>
        <Link href="/restaurants" className="text-sm font-semibold text-accent-text hover:underline">
          {t("onSpotifood.all")}
        </Link>
      </div>
      <div className="landing-marquee-mask mt-5 overflow-hidden" dir="ltr">
        <ul className="landing-marquee flex w-max gap-3">
          {[...places, ...places].map((r, i) => (
            <li
              key={`${r.id}-${i}`}
              aria-hidden={i >= places.length ? true : undefined}
              className={i >= places.length ? "landing-dup" : undefined}
            >
              <Link
                href={`/r/${r.slug}`}
                tabIndex={i >= places.length ? -1 : undefined}
                className="flex items-center gap-3 rounded-2xl bg-bg py-2 ps-2 pe-4 ring-1 ring-border transition hover:ring-border-strong"
              >
                <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-black/5">
                  {r.logo ? (
                    <img src={r.logo} alt="" loading="lazy" className="size-full object-contain p-0.5" />
                  ) : (
                    <PlaceInitials name={r.name} />
                  )}
                </span>
                <span dir="auto" className="text-sm font-semibold whitespace-nowrap">
                  {r.name}
                  {r.city ? (
                    <span className="block text-xs font-normal text-fg-muted">
                      {locale === "fa" || locale === "ar" ? r.city.fa : r.city.en}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  dark = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  dark?: boolean;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <p
          className={cn(
            "text-sm font-bold tracking-wide",
            dark ? "text-[color:var(--landing-glow-text)]" : "text-accent-text",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-2 text-3xl font-black tracking-tight text-balance sm:text-4xl">{title}</h2>
      {subtitle ? (
        <p className={cn("mt-4 text-lg leading-8", dark ? "text-white/70" : "text-fg-muted")}>{subtitle}</p>
      ) : null}
    </div>
  );
}

function BentoCard({
  Icon,
  title,
  body,
  className,
  children,
}: {
  Icon: typeof Smartphone;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col rounded-3xl bg-surface p-6 ring-1 ring-border sm:p-7", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-xl font-bold">{title}</h3>
      <p className="mt-2 leading-7 text-fg-muted">{body}</p>
      <div className="flex flex-1 flex-col justify-end">{children}</div>
    </div>
  );
}

function BenefitCard({
  title,
  points,
  Icon,
  className,
}: {
  title: string;
  points: string[];
  Icon: typeof Smartphone;
  className?: string;
}) {
  return (
    <div className={cn("rounded-3xl p-8", className)}>
      <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-2xl font-bold">{title}</h3>
      <ul className="mt-5 space-y-3">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3">
            <Check className="mt-1 size-4 shrink-0 text-accent-text" strokeWidth={3} aria-hidden="true" />
            <p className="leading-7 text-fg-muted">{p}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"landing">>>;

/** Hero illustration: the guest menu on a phone, with the kitchen ticket and live toasts around it. */
function HeroVisual({ t }: { t: T }) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:me-0">
      <div className="landing-orb absolute inset-x-6 top-10 bottom-0 -z-10 rounded-full" />
      <PhoneMock
        table={t("mock.table")}
        featured={t("mock.featured")}
        cart={t("mock.cart")}
        menu={t("mock.menu")}
      />
      <div className="landing-float absolute -start-2 top-24 hidden w-48 sm:block lg:-start-14">
        <KitchenTicket t={t} />
      </div>
      <div className="landing-float-slow absolute -end-1 top-24 flex items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[#141414] shadow-xl ring-1 ring-black/5 lg:-end-8">
        <span className="grid size-8 place-items-center rounded-full bg-emerald-500 text-white">
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span className="text-sm leading-tight font-bold">
          {t("float.paid")}
          <span className="block text-xs font-medium text-neutral-500">۳٬۶۰۰٬۰۰۰ تومان</span>
        </span>
      </div>
      <div className="landing-float absolute -end-2 bottom-24 flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-fg shadow-xl lg:-end-10">
        <ChefHat className="size-4" />
        {t("float.ready")} · {t("float.table")}
      </div>
    </div>
  );
}

/** A kitchen display ticket with its running timer (decorative). */
function KitchenTicket({ t, className }: { t: T; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white p-3.5 text-[#141414] shadow-xl ring-1 ring-black/5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-black whitespace-nowrap">
          #A-1042 <span className="font-semibold text-neutral-500">· {t("float.table")}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
          <Clock className="size-3" />
          {t("float.minutes")}
        </span>
      </div>
      <ul className="mt-2.5 space-y-1.5 text-[13px]">
        {(["mockDish1", "mockDish2", "mockDish3"] as const).map((k, i) => (
          <li key={k} className="flex items-center gap-2">
            <span className="grid size-5 place-items-center rounded-md bg-neutral-100 text-[11px] font-bold">
              {i === 0 ? 2 : 1}
            </span>
            <span className="font-semibold">{t(`platform.${k}`)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 h-8 rounded-xl bg-[#141414] text-center text-xs leading-8 font-bold text-white">
        {t("float.kitchen")} ✓
      </div>
    </div>
  );
}

/** A small weekly sales chart (decorative). */
function MiniChart({ label }: { label: string }) {
  const bars = [42, 58, 50, 71, 64, 88, 96];
  return (
    <div aria-hidden="true" className="mt-5 rounded-2xl bg-bg p-4 ring-1 ring-border">
      <p className="text-xs font-semibold text-fg-muted">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums">+۲۴٪</p>
      <div className="mt-3 flex h-20 items-end gap-1.5" dir="ltr">
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn("flex-1 rounded-t-md", i === bars.length - 1 ? "bg-accent" : "bg-accent-soft-2")}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Static phone preview of the guest menu (decorative). */
function PhoneMock({
  table,
  featured,
  cart,
  menu,
}: {
  table: string;
  featured: string;
  cart: string;
  menu: string;
}) {
  return (
    <div aria-hidden="true" className="relative mx-auto w-[16.5rem] sm:w-[17.5rem] lg:me-6">
      {/* iPhone: titanium frame, side buttons, Dynamic Island, status bar, home indicator. */}
      <span className="absolute -start-[3px] top-24 h-7 w-[3px] rounded-s bg-[#3a3a3c]" />
      <span className="absolute -start-[3px] top-36 h-12 w-[3px] rounded-s bg-[#3a3a3c]" />
      <span className="absolute -start-[3px] top-[13.5rem] h-12 w-[3px] rounded-s bg-[#3a3a3c]" />
      <span className="absolute -end-[3px] top-40 h-16 w-[3px] rounded-e bg-[#3a3a3c]" />
      <div className="aspect-[9/19.5] rounded-[3rem] bg-gradient-to-b from-[#4a4a4f] via-[#2c2c2e] to-[#4a4a4f] p-[3px] shadow-[0_40px_90px_-25px_rgba(0,0,0,0.8)]">
        <div className="h-full rounded-[2.85rem] bg-black p-[7px]">
          <div
            className="relative flex h-full flex-col overflow-hidden rounded-[2.4rem] bg-white text-[#141414]"
            dir="rtl"
          >
            <div className="absolute top-2.5 left-1/2 z-10 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-black" />
            <div
              className="flex items-center justify-between px-6 pt-3.5 text-[12px] font-semibold"
              dir="ltr"
            >
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <span className="flex items-end gap-[2px]">
                  {[4, 6, 8, 10].map((h) => (
                    <span key={h} className="w-[3px] rounded-sm bg-[#141414]" style={{ height: h }} />
                  ))}
                </span>
                <span className="relative ms-1 h-[11px] w-[22px] rounded-[3px] border border-[#141414]/40 p-[1px]">
                  <span className="block h-full w-4/5 rounded-[1px] bg-[#141414]" />
                </span>
              </span>
            </div>
            <div className="bg-gradient-to-b from-accent-soft to-white px-4 pt-5 pb-7">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-accent text-accent-fg">
                  <UtensilsCrossed className="size-5" />
                </div>
                <div>
                  <p className="text-base font-bold">{menu}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold ring-1 ring-black/5">
                    {table}
                  </span>
                </div>
              </div>
            </div>
            <div className="-mt-4 flex flex-1 flex-col rounded-t-3xl bg-white px-4 pt-4 pb-3">
              <div className="h-9 rounded-full bg-[#f3f3f3]" />
              <p className="mt-4 text-sm font-bold">{featured}</p>
              <div className="mt-2 space-y-3">
                {MOCK.map((d) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{d.name}</p>
                      <p className="text-[12px] font-semibold text-[#555]">{d.price} تومان</p>
                    </div>
                    <div className="relative">
                      <img src={d.img} alt="" className="size-16 rounded-xl bg-[#f3f3f3] object-cover" />
                      <span className="absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full bg-white text-sm font-bold shadow">
                        +
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex h-11 items-center gap-2 rounded-full bg-accent ps-1.5 pe-4 text-[13px] font-bold text-white">
                <span className="grid size-8 place-items-center rounded-full bg-white/20">
                  <ShoppingBag className="size-4" />
                </span>
                <span className="flex-1">{cart}</span>
                <span>۳٬۶۰۰٬۰۰۰</span>
              </div>
              <div className="mx-auto mt-3 h-[5px] w-28 rounded-full bg-[#141414]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
