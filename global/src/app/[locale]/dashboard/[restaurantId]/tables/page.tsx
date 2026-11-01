import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  return (
    <>
      <PageHeader
        title={t("tables.title")}
        description={`${t("tables.subtitle")} · ${t("tables.count", { count: tables.length })}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {tables.length > 0 ? (
              <Link href={`/dashboard/${rid}/tables/print`} className={buttonClasses("secondary")}>
                {t("tables.print")}
              </Link>
            ) : null}
            {manage ? (
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
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {tables.map((table) => (
            <li key={table.id}>
              <Card className="flex h-full flex-col">
                <div className="flex gap-4 p-4">
                  <img
                    src={`${qrBase}/${table.id}/qr?format=svg&v=${table.qrToken}`}
                    alt=""
                    width={88}
                    height={88}
                    loading="lazy"
                    className={`size-22 shrink-0 rounded-lg border border-border bg-white p-1 ${table.qrEnabled ? "" : "opacity-30 grayscale"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/${rid}/tables/${table.id}`}
                      className="block truncate text-lg font-semibold hover:underline"
                    >
                      {table.label}
                    </Link>
                    <p className="truncate text-sm text-fg-muted">
                      {[table.zone, table.capacity ? t("tables.seats", { count: table.capacity }) : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {table.openSessionId ? (
                        <Badge tone="warning">
                          {t("tables.occupied")} · {format.relativeTime(table.openSessionSince!)}
                        </Badge>
                      ) : (
                        <Badge tone="success">{t("tables.free")}</Badge>
                      )}
                      {!table.qrEnabled ? <Badge tone="danger">{t("tables.qrDisabled")}</Badge> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border px-4 py-3">
                  {manage ? <EditTableDialog restaurantId={rid} table={table} /> : <span />}
                  <details name="table-actions" className="relative">
                    <summary className="flex h-8 cursor-pointer list-none items-center rounded-lg px-3 text-sm text-fg-muted hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden">
                      QR ▾
                    </summary>
                    <div className="absolute end-0 z-20 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-xl">
                      <a
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                        href={`${qrBase}/${table.id}/qr?format=png&size=1500&download=1`}
                      >
                        {t("tables.downloadPng")}
                      </a>
                      <a
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                        href={`${qrBase}/${table.id}/qr?format=svg&download=1`}
                      >
                        {t("tables.downloadSvg")}
                      </a>
                      <Link
                        className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                        href={`/dashboard/${rid}/tables/print?ids=${table.id}`}
                      >
                        {t("tables.printOne")}
                      </Link>
                      {table.qrEnabled ? (
                        <a
                          className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
                          href={tableUrl(table.qrToken)}
                          target="_blank"
                          rel="noopener"
                        >
                          {t("tables.openLink")} ↗
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
                            confirm={t("tables.deleteConfirm", { label: table.label })}
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
      )}
    </>
  );
}
