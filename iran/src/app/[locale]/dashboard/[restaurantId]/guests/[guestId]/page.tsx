import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { GuestForm } from "@/components/pms/guest-form";
import { StatusText } from "@/components/pms/status-text";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getMoney } from "@/lib/money-server";
import { getGuest } from "@/server/modules/pms/guests";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/guests/[guestId]">;

export default function GuestPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Guest params={params} />
    </Suspense>
  );
}

async function Guest({ params }: Pick<Props, "params">) {
  const { restaurantId, guestId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const locale = await getLocale();
  const [t, money, g] = await Promise.all([
    getTranslations("pms.guest"),
    getMoney(ctx.restaurant.currency),
    getGuest(db, ctx, guestId),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const spent = g.history.filter((h) => h.status === "checked_out").reduce((s, h) => s + h.totalCents, 0);
  return (
    <>
      <PageHeader
        title={[g.lastName, g.firstName].filter(Boolean).join(" ")}
        description={t("summary", {
          stays: g.history.filter((h) => h.status === "checked_out").length,
          spent: money(spent),
        })}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <GuestForm restaurantId={ctx.restaurant.id} canEdit={can(ctx, "frontdesk.manage")} guest={{ ...g }} />
        <section className="h-fit rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 font-semibold">{t("history")}</h2>
          <ul className="space-y-2 text-sm">
            {g.history.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <Link
                  href={`/dashboard/${ctx.restaurant.id}/stays/${h.id}`}
                  className="font-mono text-xs hover:underline"
                >
                  #{h.number}
                </Link>
                <span className="flex-1">
                  {day(h.arrival)} → {day(h.departure)}
                </span>
                <StatusText status={h.status} />
              </li>
            ))}
            {!g.history.length ? <li className="text-fg-muted">{t("noHistory")}</li> : null}
          </ul>
        </section>
      </div>
    </>
  );
}
