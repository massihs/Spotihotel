import { BedDouble, Check, ConciergeBell, KeyRound } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/language-switcher";

type T = Awaited<ReturnType<typeof getTranslations<"landing">>>;
type F = Awaited<ReturnType<typeof getFormatter>>;

/**
 * Sign in / sign up: the form on one side and, from laptops up, the night-blue brand panel on the
 * other: what Spotihotel does, then a Persian arch framing tonight at the front desk (occupancy,
 * a check-in just done, a room-service order).
 */
export default async function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  const t = await getTranslations("landing");
  const format = await getFormatter();
  return (
    <div className="grid min-h-dvh bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-5">
        {/* Phones and tablets: the lattice fading down from the top, a soft glow behind the card. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 lg:hidden">
          <span className="texture-khatam texture-fade-b [--tex-color:var(--accent)] [--tex-opacity:0.08] [--tex-size:60px]" />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -end-40 -top-40 -z-10 size-[28rem] rounded-full bg-accent/12 blur-3xl lg:hidden"
        />
        <header className="relative mx-auto flex w-full max-w-md items-center justify-between py-6">
          <Link href="/" aria-label="Spotihotel">
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

      <aside className="landing-hero relative isolate hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        <div className="landing-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <span className="texture-grain [--grain-opacity:0.14]" aria-hidden="true" />
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15 backdrop-blur">
            <span className="size-1.5 rotate-45 bg-[var(--brass)]" aria-hidden="true" />
            {t("badge")}
          </p>
          <h2 className="font-display mt-7 max-w-lg text-[3.25rem] leading-[1.2] text-balance xl:text-6xl">
            {t.rich("titleRich", { hl: (c) => <span className="landing-highlight">{c}</span> })}
          </h2>
          <span className="ornament mt-6 [--ornament-width:5rem]" aria-hidden="true" />
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-[15px] text-white/80">
            {(["noApp", "zarinpal", "invoice"] as const).map((k) => (
              <li key={k} className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[image:var(--brass-gradient)] text-[color:var(--brass-ink)]">
                  <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                </span>
                {t(`trust.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <ArchScene t={t} format={format} />
      </aside>
    </div>
  );
}

/** Tonight at the front desk, framed by a brass Persian arch (decorative). */
function ArchScene({ t, format }: { t: T; format: F }) {
  const n = (v: number) => format.number(v);
  return (
    <div aria-hidden="true" className="relative mx-auto mt-10 h-[23rem] w-full max-w-[26rem] xl:h-[26rem]">
      {/* The iwan: a pointed arch drawn twice in brass, a glow of night blue inside. */}
      <svg
        viewBox="0 0 400 440"
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-0 size-full text-[var(--brass)]"
      >
        <path
          d="M18 440V200C18 116 98 46 200 6c102 40 182 110 182 194v240"
          stroke="currentColor"
          strokeOpacity="0.6"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M40 440V208c0-74 68-136 160-176 92 40 160 102 160 176v232"
          stroke="currentColor"
          strokeOpacity="0.25"
          vectorEffect="non-scaling-stroke"
        />
        <path d="M200 0l7 7-7 7-7-7z" fill="currentColor" fillOpacity="0.8" />
      </svg>
      <div className="absolute inset-x-10 top-20 bottom-0 rounded-t-full bg-[radial-gradient(closest-side,oklch(0.55_0.13_258/0.4),transparent)]" />

      {/* Tonight's occupancy, on glass. */}
      <div className="landing-float absolute inset-x-12 top-[5.5rem] rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/15 backdrop-blur-md xl:inset-x-14">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-white/60">{t("pmsMock.tonight")}</p>
            <p className="font-display mt-1 text-[2.6rem] leading-none text-[color:var(--landing-glow-text)] tabular-nums">
              {format.number(0.86, { style: "percent" })}
            </p>
          </div>
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-[var(--brass)] ring-1 ring-white/10">
            <BedDouble className="size-5" />
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full w-[86%] rounded-full bg-[image:var(--brass-gradient)]" />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {(
            [
              ["arrivals", n(94)],
              ["departures", n(81)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-lg bg-white/[0.06] px-2.5 py-1.5 ring-1 ring-white/10">
              <dt className="text-white/55">{t(`pmsMock.${k}`)}</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* A check-in just done… */}
      <div className="landing-float-slow absolute -start-2 bottom-24 flex items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[color:var(--brass-ink)] shadow-[0_18px_40px_-14px_rgb(0_0_0/0.6)] xl:-start-6">
        <span className="grid size-9 place-items-center rounded-xl bg-[image:var(--brass-gradient)]">
          <KeyRound className="size-[1.1rem]" />
        </span>
        <span className="text-sm leading-tight font-bold">
          {t("float.checkin")}
          <span className="mt-0.5 block text-xs font-medium text-neutral-500">{t("float.checkinRoom")}</span>
        </span>
      </div>
      {/* …and an order from a room. */}
      <div className="landing-float absolute -end-2 bottom-5 flex items-center gap-2.5 rounded-2xl bg-white/95 px-3.5 py-2.5 text-[color:var(--brass-ink)] shadow-[0_18px_40px_-14px_rgb(0_0_0/0.6)] xl:-end-6">
        <span className="grid size-9 place-items-center rounded-xl bg-[oklch(0.36_0.08_260)] text-white">
          <ConciergeBell className="size-[1.1rem]" />
        </span>
        <span className="text-sm leading-tight font-bold">
          {t("mock.order")}
          <span className="mt-0.5 block text-xs font-medium text-neutral-500">{t("mock.table")}</span>
        </span>
      </div>
    </div>
  );
}
