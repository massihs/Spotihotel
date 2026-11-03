import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Search, Star } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { searchGuests } from "@/server/modules/pms/guests";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/guests">;

export default function GuestsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Guests params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Guests({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const q = typeof sp.q === "string" ? sp.q : "";
  const [t, list] = await Promise.all([getTranslations("pms.guests"), searchGuests(db, ctx, q, 100)]);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form className="mb-4 flex gap-2" role="search">
        <label className="relative flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-fg-muted"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("search")}
            className="h-11 w-full rounded-xl border border-border-strong bg-surface ps-9 pe-3 text-[15px]"
          />
        </label>
        <button className={buttonClasses("secondary", "lg")}>{t("find")}</button>
      </form>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {list.map((g) => (
          <li key={g.id}>
            <Link
              href={`/dashboard/${ctx.restaurant.id}/guests/${g.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="font-semibold">
                  {g.vip ? (
                    <Star
                      className="me-1 inline size-3.5 fill-[var(--brass)] text-[var(--brass)]"
                      aria-label="VIP"
                    />
                  ) : null}
                  {[g.lastName, g.firstName].filter(Boolean).join(" ")}
                </span>
                <span className="block text-sm text-fg-muted" dir="ltr">
                  {[g.phone, g.email].filter(Boolean).join(" | ")}
                </span>
              </span>
              {g.blacklisted ? (
                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger">
                  {t("blacklisted")}
                </span>
              ) : null}
              <span className="text-sm text-fg-muted">{t("stays", { n: g.stays })}</span>
            </Link>
          </li>
        ))}
        {!list.length ? <li className="px-4 py-10 text-center text-fg-muted">{t("empty")}</li> : null}
      </ul>
    </>
  );
}
