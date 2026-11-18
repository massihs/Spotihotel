import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ChevronLeft, Search, Star, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/pms/kit";
import { cn } from "@/lib/cn";
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
      {list.length ? (
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((g) => {
            const name = [g.lastName, g.firstName].filter(Boolean).join(" ");
            return (
              <li key={g.id}>
                <Link
                  href={`/dashboard/${ctx.restaurant.id}/guests/${g.id}`}
                  className={cn(
                    "group flex h-full items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 shadow-[var(--shadow-card)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-brand-300",
                    g.blacklisted && "border-danger/40",
                  )}
                >
                  <span className="relative">
                    <Avatar name={name} />
                    {g.vip ? (
                      <span className="absolute -end-1 -bottom-1 grid size-5 place-items-center rounded-full bg-surface ring-2 ring-surface">
                        <Star className="size-3.5 fill-[var(--brass)] text-[var(--brass)]" aria-label="VIP" />
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{name || "—"}</span>
                    <span
                      className="block truncate text-xs text-fg-muted"
                      dir="ltr"
                      style={{ textAlign: "start" }}
                    >
                      {[g.phone, g.email].filter(Boolean).join(" | ") || "—"}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      <span className="shade-soft rounded-full px-2 py-0.5">
                        {t("stays", { n: g.stays })}
                      </span>
                      {g.nationality && g.nationality !== "IR" ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-fg-muted" dir="ltr">
                          {g.nationality}
                        </span>
                      ) : null}
                      {g.blacklisted ? (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">
                          {t("blacklisted")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronLeft
                    className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-x-0.5 ltr:rotate-180"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon={<UsersRound aria-hidden="true" />}>{t("empty")}</Empty>
      )}
    </>
  );
}
