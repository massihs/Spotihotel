import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { BedDouble, ChevronDown, ExternalLink, Printer, QrCode } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listTables } from "@/server/modules/tables/service";
import { tableUrl } from "@/server/modules/tables/qr";
import { BulkTablesDialog, CreateTableDialog, EditTableDialog, TableCommand } from "./table-forms";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/tables">["params"];

export default function TablesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Tables params={params} />
    </Suspense>
  );
}

async function Tables({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const [t, format, tables] = await Promise.all([getTranslations(), getFormatter(), listTables(db, ctx)]);
  const manage = can(ctx, "tables.manage");
  const rid = ctx.restaurant.id;
  const qrBase = `/api/v1/restaurants/${rid}/tables`;
  const occupied = tables.filter((x) => x.openSessionId).length;
  const hotel = ctx.restaurant.kind === "hotel";
  const rooms = tables.filter((x) => x.kind === "room");
  // A hotel sees its rooms first, then its restaurant's tables; others one plain list.
  const groups = hotel
    ? [
        { key: "room", title: t("tables.roomsTitle"), list: rooms },
        { key: "table", title: t("tables.tablesTitle"), list: tables.filter((x) => x.kind !== "room") },
      ].filter((g) => g.list.length > 0)
    : [{ key: "all", title: null, list: tables }];

  return (
    <>
      <PageHeader
        title={hotel ? t("tables.titleHotel") : t("tables.title")}
        description={
          hotel
            ? `${t("tables.subtitleHotel")} · ${t("tables.roomsCount", { count: rooms.length })} · ${t("tables.count", { count: tables.length - rooms.length })}`
            : `${t("tables.subtitle")} · ${t("tables.count", { count: tables.length })}`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {tables.length > 0 ? (
              <Link href={`/dashboard/${rid}/tables/print`} className={buttonClasses("secondary")}>
                <Printer className="size-4" aria-hidden="true" />
                {t("tables.print")}
              </Link>
            ) : null}
            {manage && hotel ? (
              <>
                <BulkTablesDialog restaurantId={rid} kind="room" />
                <CreateTableDialog restaurantId={rid} kind="room" />
                <CreateTableDialog restaurantId={rid} variant="secondary" />
              </>
            ) : manage ? (
              <>
                <BulkTablesDialog restaurantId={rid} />
                <CreateTableDialog restaurantId={rid} />
              </>
            ) : null}
          </div>
        }
      />

      {tables.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">{t("tables.empty")}</h2>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">{t("tables.emptyBody")}</p>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2 text-sm font-bold">
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-[var(--shadow-soft)]">
              <span className="size-2 rounded-full bg-success" aria-hidden="true" />
              {t("tables.free")} <span className="tabular-nums">{tables.length - occupied}</span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-[var(--shadow-soft)]">
              <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
              {t("tables.occupied")} <span className="tabular-nums">{occupied}</span>
            </span>
          </div>
          {groups.map((group) => (
            <section key={group.key} className="mb-8">
              {group.title ? (
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                  {group.key === "room" ? (
                    <BedDouble className="size-5 text-accent-text" aria-hidden="true" />
                  ) : null}
                  {group.title}
                  <span className="text-sm font-semibold text-fg-subtle tabular-nums">
                    {group.list.length}
                  </span>
                </h2>
              ) : null}
              <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.list.map((table) => (
                  <li key={table.id}>
                    <Card className="flex h-full flex-col overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/${rid}/tables/${table.id}`}
                            className="flex items-center gap-2 truncate text-2xl font-bold tracking-tight hover:underline"
                          >
                            {table.kind === "room" ? (
                              <BedDouble className="size-5 shrink-0 text-accent-text" aria-hidden="true" />
                            ) : null}
                            {table.label}
                          </Link>
                          <p className="truncate text-sm text-fg-muted">
                            {[
                              table.zone,
                              table.capacity ? t("tables.seats", { count: table.capacity }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                        </div>
                        <img
                          src={`${qrBase}/${table.id}/qr?format=svg&v=${table.qrToken}`}
                          alt=""
                          width={64}
                          height={64}
                          loading="lazy"
                          className={cn(
                            "size-16 shrink-0 rounded-xl bg-white p-1 ring-1 ring-border",
                            !table.qrEnabled && "opacity-30 grayscale",
                          )}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 pb-4">
                        {table.openSessionId ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-bold">
                            <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
                            {t("tables.occupied")} · {format.relativeTime(table.openSessionSince!)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">
                            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                            {t("tables.free")}
                          </span>
                        )}
                        {!table.qrEnabled ? (
                          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-bold text-danger">
                            {t("tables.qrDisabled")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
                        {manage ? (
                          <EditTableDialog restaurantId={rid} table={table} hotel={hotel} />
                        ) : (
                          <span />
                        )}
                        <details name="table-actions" className="relative">
                          <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-sm font-bold hover:bg-surface-3 [&::-webkit-details-marker]:hidden">
                            <QrCode className="size-4" aria-hidden="true" />
                            QR
                            <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
                          </summary>
                          <div className="absolute end-0 z-20 mt-2 w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-[var(--shadow-float)]">
                            <a
                              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
                              href={`${qrBase}/${table.id}/qr?format=png&size=1500&download=1`}
                            >
                              {t("tables.downloadPng")}
                            </a>
                            <a
                              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
                              href={`${qrBase}/${table.id}/qr?format=svg&download=1`}
                            >
                              {t("tables.downloadSvg")}
                            </a>
                            <Link
                              className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
                              href={`/dashboard/${rid}/tables/print?ids=${table.id}`}
                            >
                              {t("tables.printOne")}
                            </Link>
                            {table.qrEnabled ? (
                              <a
                                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-surface-2"
                                href={tableUrl(table.qrToken)}
                                target="_blank"
                                rel="noopener"
                              >
                                {t("tables.openLink")}
                                <ExternalLink className="ms-auto size-3.5 opacity-60" aria-hidden="true" />
                              </a>
                            ) : null}
                            {manage ? (
                              <>
                                <div className="my-1 border-t border-border" />
                                <TableCommand
                                  restaurantId={rid}
                                  tableId={table.id}
                                  command={table.qrEnabled ? "disable" : "enable"}
                                >
                                  {table.qrEnabled ? t("tables.disableQr") : t("tables.enableQr")}
                                </TableCommand>
                                <TableCommand
                                  restaurantId={rid}
                                  tableId={table.id}
                                  command="regenerate"
                                  confirm={t("tables.regenerateConfirm")}
                                >
                                  {t("tables.regenerate")}
                                </TableCommand>
                                <TableCommand
                                  restaurantId={rid}
                                  tableId={table.id}
                                  command="delete"
                                  danger
                                  confirm={t(
                                    table.kind === "room"
                                      ? "tables.deleteConfirmRoom"
                                      : "tables.deleteConfirm",
                                    { label: table.label },
                                  )}
                                >
                                  {t("common.delete")}
                                </TableCommand>
                              </>
                            ) : null}
                          </div>
                        </details>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </>
  );
}
