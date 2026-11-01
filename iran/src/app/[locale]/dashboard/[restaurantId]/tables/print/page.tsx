import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { restaurants } from "@/server/db/schema";
import { listTables } from "@/server/modules/tables/service";
import { qrSvg, tableUrl } from "@/server/modules/tables/qr";
import { logoUrl } from "@/server/modules/restaurants/settings";
import { PrintSheet } from "./print-sheet";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/tables/print">;

export default function PrintPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Print params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Print({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "tables.view");
  const sp = await searchParams;
  const preselected = typeof sp.ids === "string" ? sp.ids.split(",").filter(Boolean) : null;

  const [t, tr, tables, [r]] = await Promise.all([
    getTranslations("print"),
    getTranslations("tables.printRoom"),
    listTables(db, ctx),
    db
      .select({ logoKey: restaurants.logoKey })
      .from(restaurants)
      .where(eq(restaurants.id, ctx.restaurant.id)),
  ]);

  const cards = await Promise.all(
    tables.map(async (table) => ({
      id: table.id,
      label: table.label,
      zone: table.zone,
      enabled: table.qrEnabled,
      room: table.kind === "room",
      // Generated server-side from our own data: safe to embed as a data URI.
      qr: `data:image/svg+xml;base64,${Buffer.from(await qrSvg(tableUrl(table.qrToken))).toString("base64")}`,
    })),
  );

  return (
    <PrintSheet
      restaurantId={ctx.restaurant.id}
      restaurantName={ctx.restaurant.name}
      logo={logoUrl(r?.logoKey, "512")}
      cards={cards}
      initialSelection={preselected}
      labels={{
        title: t("title"),
        subtitle: t("subtitle"),
        table: t("table"),
        scan: t("scan"),
        scanSub: t("scanSub"),
        room: tr("room"),
        scanRoom: tr("scanRoom"),
        roomService: tr("roomService"),
      }}
    />
  );
}
