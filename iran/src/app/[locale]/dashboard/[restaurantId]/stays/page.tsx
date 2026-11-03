import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarPlus, Search } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { buttonClasses } from "@/components/ui/button";
import { StatusText } from "@/components/pms/status-text";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getMoney } from "@/lib/money-server";
import { listStays, STAY_STATUSES } from "@/server/modules/pms/stays";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/stays">;

export default function StaysPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Stays params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Stays({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const q = typeof sp.q === "string" ? sp.q : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const locale = await getLocale();
  const [t, tStatus, money, list] = await Promise.all([
    getTranslations("pms.stays"),
    getTranslations("pms.status"),
    getMoney(ctx.restaurant.currency),
    listStays(db, ctx, { q, status: status || undefined }),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const base = `/dashboard/${ctx.restaurant.id}`;
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(ctx, "frontdesk.manage") ? (
            <Link href={`${base}/stays/new`} className={buttonClasses("primary", "md")}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              {t("new")}
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <label className="relative min-w-60 flex-1">
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
        <select
          name="status"
          defaultValue={status}
          className="h-11 rounded-xl border border-border-strong bg-surface px-3"
        >
          <option value="">{t("allStatuses")}</option>
          {STAY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <button className={buttonClasses("secondary", "lg")}>{t("filter")}</button>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2 text-xs text-fg-muted">
            <tr>
              {["number", "guest", "dates", "room", "status", "total", "balance"].map((h) => (
                <th
                  key={h}
                  className={`px-4 py-2.5 font-semibold ${h === "total" || h === "balance" ? "text-end" : "text-start"}`}
                >
                  {t(`col.${h}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className="border-t border-border hover:bg-surface-2/60">
                <td className="px-4 py-2.5 font-mono text-xs">
                  <Link href={`${base}/stays/${s.id}`} className="hover:underline">
                    #{s.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5 font-semibold">
                  <Link href={`${base}/stays/${s.id}`} className="hover:underline">
                    {[s.lastName, s.firstName].filter(Boolean).join(" ")}
                  </Link>
                  {s.accountName ? (
                    <span className="block text-xs font-normal text-fg-muted">{s.accountName}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {day(s.arrival)} → {day(s.departure)}
                </td>
                <td className="px-4 py-2.5">
                  {s.roomLabel ?? "—"} <span className="text-xs text-fg-muted">{s.typeCode}</span>
                </td>
                <td className="px-4 py-2.5">
                  <StatusText status={s.status} />
                </td>
                <td className="px-4 py-2.5 text-end tabular-nums">{money(s.totalCents)}</td>
                <td
                  className={`px-4 py-2.5 text-end font-semibold tabular-nums ${s.balanceCents > 0 ? "text-danger" : ""}`}
                >
                  {money(s.balanceCents)}
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-fg-muted">
                  {t("empty")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
