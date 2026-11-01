import { getTranslations } from "next-intl/server";

export function GuestSkeleton() {
  return (
    <div aria-busy="true" className="px-4 pt-5">
      <div className="h-12 w-48 animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-5 h-11 animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="mt-5 h-24 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}

export async function SessionExpired() {
  const t = await getTranslations("guest");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-surface-2 text-2xl" aria-hidden="true">
        ⌁
      </div>
      <h1 className="mt-5 text-xl font-semibold">{t("sessionExpiredTitle")}</h1>
      <p className="mt-2 max-w-sm text-fg-muted">{t("sessionExpiredBody")}</p>
    </main>
  );
}
