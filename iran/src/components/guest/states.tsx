import { QrCode } from "lucide-react";
import { getTranslations } from "next-intl/server";

export function GuestSkeleton() {
  return (
    <div aria-busy="true">
      <div className="h-44 bg-gradient-to-b from-accent-soft to-bg px-4 pt-16">
        <div className="flex items-center gap-3.5">
          <div className="size-16 animate-pulse rounded-2xl bg-surface-3" />
          <div className="space-y-2">
            <div className="h-6 w-40 animate-pulse rounded-full bg-surface-3" />
            <div className="h-4 w-24 animate-pulse rounded-full bg-surface-2" />
          </div>
        </div>
      </div>
      <div className="relative -mt-6 rounded-t-[1.75rem] bg-bg px-4 pt-4">
        <div className="h-12 animate-pulse rounded-full bg-surface-2" />
        <div className="mt-4 flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-5 w-16 animate-pulse rounded-full bg-surface-2" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mt-6 flex gap-4">
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-2" />
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-surface-2" />
              <div className="h-3 w-full animate-pulse rounded-full bg-surface-2" />
            </div>
            <div className="size-28 animate-pulse rounded-2xl bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export async function SessionExpired() {
  const t = await getTranslations("guest");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div
        className="grid size-20 place-items-center rounded-full bg-accent-soft text-accent-text"
        aria-hidden="true"
      >
        <QrCode className="size-9" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold">{t("sessionExpiredTitle")}</h1>
      <p className="mt-2 max-w-sm leading-7 text-fg-muted">{t("sessionExpiredBody")}</p>
    </main>
  );
}
