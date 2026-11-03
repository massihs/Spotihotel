import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { BlockStatusButtons, NewBlockButton, RoomingList } from "@/components/pms/blocks-ui";
import { StatusText } from "@/components/pms/status-text";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getMoney } from "@/lib/money-server";
import { getBlock, listBlocks } from "@/server/modules/pms/blocks";
import { getPmsSettings, listRatePlans, listRoomTypes } from "@/server/modules/pms/setup";
import { listAccounts } from "@/server/modules/pms/guests";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/blocks">;

export default function BlocksPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Blocks params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Group blocks (allotments): rooms held for tours, events and companies, and their pickup. */
async function Blocks({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const locale = await getLocale();
  const [t, money, list, types, plans, accounts, settings] = await Promise.all([
    getTranslations("pms.blocks"),
    getMoney(ctx.restaurant.currency),
    listBlocks(db, ctx),
    listRoomTypes(db, rid),
    listRatePlans(db, rid, true),
    listAccounts(db, rid),
    getPmsSettings(db, rid, ctx.restaurant.timezone),
  ]);
  const day = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  const selected = typeof sp.id === "string" ? sp.id : null;
  const detail = selected ? await getBlock(db, ctx, selected).catch(() => null) : null;
  const typeList = types.map((x) => ({ id: x.id, code: x.code, name: x.name }));
  const manage = can(ctx, "frontdesk.manage");
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          manage && types.length ? (
            <NewBlockButton
              restaurantId={rid}
              currency={ctx.restaurant.currency}
              today={settings.businessDate}
              types={typeList}
              plans={plans.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
              accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
            />
          ) : null
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <ul className="h-fit divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {list.map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/${rid}/blocks?id=${b.id}`}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2",
                  b.id === selected && "bg-accent-soft/50",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">
                    #{b.number} {b.name}
                  </span>
                  <span className="block text-sm text-fg-muted">
                    {day(b.arrival)} → {day(b.departure)} | {t("releaseOn", { day: day(b.releaseDate) })}
                    {b.accountName ? ` | ${b.accountName}` : ""}
                  </span>
                </span>
                <span className="w-36">
                  <span className="mb-1 flex justify-between text-xs text-fg-muted">
                    <span>{t("pickupShort")}</span>
                    <span className="font-semibold tabular-nums">
                      {b.pickedNights}/{b.roomNights} | {b.pickupPct}%
                    </span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${Math.min(100, b.pickupPct)}%` }}
                    />
                  </span>
                </span>
                <StatusText status={b.status} />
              </Link>
            </li>
          ))}
          {!list.length ? <li className="px-4 py-10 text-center text-fg-muted">{t("empty")}</li> : null}
        </ul>
        {detail ? (
          <aside className="space-y-4">
            <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
              <h2 className="font-bold">
                #{detail.block.number} {detail.block.name}
              </h2>
              <p className="text-sm text-fg-muted">
                {day(detail.block.arrival)} → {day(detail.block.departure)}
                {detail.block.rateCents != null
                  ? ` | ${t("rateN", { rate: money(detail.block.rateCents) })}`
                  : ""}
                {detail.block.contactName
                  ? ` | ${detail.block.contactName} ${detail.block.contactPhone ?? ""}`
                  : ""}
              </p>
              {manage ? (
                <BlockStatusButtons
                  restaurantId={rid}
                  blockId={detail.block.id}
                  status={detail.block.status}
                />
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-fg-muted">
                      <th className="py-1 text-start">{t("type")}</th>
                      {[...new Set(detail.days.map((d) => d.day))].map((d) => (
                        <th key={d} className="px-1 py-1 text-center">
                          {day(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set(detail.days.map((d) => d.code))].map((code) => (
                      <tr key={code} className="border-t border-border">
                        <td className="py-1.5 font-semibold">{code}</td>
                        {detail.days
                          .filter((d) => d.code === code)
                          .map((d) => (
                            <td key={d.day} className="px-1 py-1.5 text-center tabular-nums">
                              <span className={d.picked >= d.rooms ? "text-success" : ""}>{d.picked}</span>/
                              {d.rooms}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-1 text-sm">
                {detail.bookings.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/${rid}/stays/${s.id}`}
                      className="font-mono text-xs hover:underline"
                    >
                      #{s.number}
                    </Link>
                    <span className="flex-1">
                      {day(s.arrival)} → {day(s.departure)}
                    </span>
                    <StatusText status={s.status} />
                  </li>
                ))}
              </ul>
            </section>
            {manage && ["tentative", "definite"].includes(detail.block.status) ? (
              <RoomingList
                restaurantId={rid}
                blockId={detail.block.id}
                types={typeList.filter((x) => detail.days.some((d) => d.roomTypeId === x.id))}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
    </>
  );
}
