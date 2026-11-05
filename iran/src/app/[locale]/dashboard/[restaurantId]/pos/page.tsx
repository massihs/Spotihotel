import { Suspense } from "react";
import { getFormatter } from "next-intl/server";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { ShiftBar } from "@/components/pos/shift-bar";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getPublicMenu } from "@/server/modules/menu/public-cache";
import { paymentConfig } from "@/server/modules/payments/service";
import { getOpenShift, shiftSummary } from "@/server/modules/pos/service";
import { listTables } from "@/server/modules/tables/service";
import { listZones } from "@/server/modules/delivery/service";
import { can } from "@/server/tenancy";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { listOutlets } from "@/server/modules/outlets/service";
import { menuForOutlet } from "@/server/modules/menu/public";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/pos">;

export default function PosPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
      <Pos params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Pos({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const initialPhone = typeof sp.phone === "string" ? sp.phone.slice(0, 20) : "";
  const initialChannel =
    sp.channel === "delivery" || sp.channel === "takeaway" || sp.channel === "dine_in"
      ? sp.channel
      : undefined;
  const ctx = await requireRestaurant(restaurantId, "orders.create");
  const [fullMenu, allTables, config, shift, format, zones, outlets] = await Promise.all([
    getPublicMenu(ctx.restaurant.id),
    listTables(db, ctx),
    paymentConfig(db, ctx.restaurant.id),
    getOpenShift(db, ctx),
    getFormatter(),
    listZones(db, ctx),
    ctx.restaurant.kind === "hotel" && can(ctx, "tables.view") ? listOutlets(db, ctx) : Promise.resolve([]),
  ]);
  // Opened on one of the hotel's restaurants or cafés: its tables, its menu, its sales.
  const outlet = outlets.find((o) => o.id === sp.outlet) ?? null;
  const menu = menuForOutlet(fullMenu, outlet?.id);
  const tables = outlet ? allTables.filter((tb) => tb.outletId === outlet.id) : allTables;
  const tOutlets = await getTranslations("outlets");
  const summary = shift ? await shiftSummary(db, shift) : null;
  return (
    <>
      {outlets.length ? (
        <nav aria-label={tOutlets("title")} className="mb-3 flex flex-wrap gap-1.5">
          {[{ id: "", name: tOutlets("allOutlets") }, ...outlets].map((o) => {
            const active = (outlet?.id ?? "") === o.id;
            return (
              <Link
                key={o.id || "all"}
                href={`/dashboard/${ctx.restaurant.id}/pos${o.id ? `?outlet=${o.id}` : ""}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-fg-muted ring-1 ring-border ring-inset hover:bg-brand-50 hover:text-brand-800",
                )}
              >
                {o.name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      <ShiftBar
        restaurantId={ctx.restaurant.id}
        currency={ctx.restaurant.currency}
        shift={
          shift
            ? { openedAt: shift.openedAt.toISOString(), openingFloatCents: shift.openingFloatCents }
            : null
        }
        summary={
          summary
            ? {
                cashSales: summary.cashSales,
                totalSales: summary.totalSales,
                moveIn: summary.moveIn,
                moveOut: summary.moveOut,
                expectedCash: summary.expectedCash,
              }
            : null
        }
        canManage={can(ctx, "cash.manage")}
        timeLabel={
          shift
            ? format.dateTime(shift.openedAt, { timeStyle: "short", timeZone: ctx.restaurant.timezone })
            : null
        }
      />
      <PosTerminal
        initialPhone={initialPhone}
        initialChannel={initialChannel}
        outletId={outlet?.id ?? null}
        restaurantId={ctx.restaurant.id}
        menu={menu}
        currency={ctx.restaurant.currency}
        tables={tables
          .filter((tb) => tb.qrEnabled !== undefined)
          .map((tb) => ({ id: tb.id, label: tb.label, kind: tb.kind }))}
        methods={config.offline}
        canPay={can(ctx, "payments.record")}
        zones={zones
          .filter((z) => z.isActive)
          .map((z) => ({ id: z.id, name: z.name, feeCents: z.feeCents, minOrderCents: z.minOrderCents }))}
      />
    </>
  );
}
