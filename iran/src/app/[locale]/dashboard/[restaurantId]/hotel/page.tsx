import { Suspense } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import {
  AccountsPanel,
  MinibarPanel,
  PmsSettingsPanel,
  PricingPanel,
  RatePlansPanel,
  RatesPanel,
  RoomsPanel,
  RoomTypesPanel,
  ServicesPanel,
} from "@/components/pms/setup-panels";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { diningTables } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { getPmsSettings, listRatePlans, roomTypesWithCounts } from "@/server/modules/pms/setup";
import { availabilityGrid } from "@/server/modules/pms/stays";
import { listServices } from "@/server/modules/pms/wellness";
import { listPricingRules } from "@/server/modules/pms/revenue";
import { listMinibar } from "@/server/modules/pms/minibar";
import { listAccounts } from "@/server/modules/pms/guests";
import { accountBalance } from "@/server/modules/pms/folios";
import { addDays, isDay } from "@/server/modules/pms/calc";

const TABS = [
  "types",
  "rooms",
  "plans",
  "rates",
  "pricing",
  "services",
  "minibar",
  "accounts",
  "settings",
] as const;
type Tab = (typeof TABS)[number];
type Props = PageProps<"/[locale]/dashboard/[restaurantId]/hotel">;

export default function HotelSetupPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <HotelSetup params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Hotel configuration: room types, rooms, rate plans, yield calendar, services, minibar, accounts. */
async function HotelSetup({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "rates.manage");
  const rid = ctx.restaurant.id;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "types";
  const t = await getTranslations("pms.setup");
  const currency = ctx.restaurant.currency;
  const settings = await getPmsSettings(db, rid, ctx.restaurant.timezone);

  let body: React.ReactNode = null;
  if (tab === "types") {
    const { types } = await roomTypesWithCounts(db, rid);
    body = <RoomTypesPanel restaurantId={rid} currency={currency} types={types} />;
  } else if (tab === "rooms") {
    const [{ types }, rooms] = await Promise.all([
      roomTypesWithCounts(db, rid),
      db
        .select({ id: diningTables.id, label: diningTables.label, roomTypeId: diningTables.roomTypeId })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.restaurantId, rid),
            eq(diningTables.kind, "room"),
            isNull(diningTables.deletedAt),
          ),
        )
        .orderBy(diningTables.number, diningTables.label),
    ]);
    body = (
      <div className="space-y-3">
        <RoomsPanel restaurantId={rid} rooms={rooms} types={types} />
        <Link
          href={`/dashboard/${rid}/tables`}
          className="inline-block text-sm font-semibold text-accent-text hover:underline"
        >
          {t("manageRooms")}
        </Link>
      </div>
    );
  } else if (tab === "plans") {
    body = <RatePlansPanel restaurantId={rid} currency={currency} plans={await listRatePlans(db, rid)} />;
  } else if (tab === "rates") {
    const from = typeof sp.from === "string" && isDay(sp.from) ? sp.from : settings.businessDate;
    const grid = await availabilityGrid(db, ctx, from, 21);
    body = (
      <div className="space-y-3">
        <div className="flex gap-2 text-sm">
          <Link
            href={`?tab=rates&from=${addDays(from, -21)}`}
            className="rounded-full px-3 py-1 ring-1 ring-border"
          >
            ←
          </Link>
          <Link
            href={`?tab=rates&from=${addDays(from, 21)}`}
            className="rounded-full px-3 py-1 ring-1 ring-border"
          >
            →
          </Link>
        </div>
        <RatesPanel
          restaurantId={rid}
          currency={currency}
          from={from}
          nights={grid.nights}
          types={grid.types}
        />
      </div>
    );
  } else if (tab === "pricing") {
    const [rules, types] = await Promise.all([listPricingRules(db, rid), roomTypesWithCounts(db, rid)]);
    body = (
      <PricingPanel
        restaurantId={rid}
        rules={rules.map((r) => ({ ...r.rule, typeCode: r.typeCode }))}
        types={types.types.map((x) => ({ id: x.id, code: x.code }))}
      />
    );
  } else if (tab === "services") {
    body = <ServicesPanel restaurantId={rid} currency={currency} services={await listServices(db, rid)} />;
  } else if (tab === "minibar") {
    body = <MinibarPanel restaurantId={rid} currency={currency} items={await listMinibar(db, rid)} />;
  } else if (tab === "accounts") {
    const list = await listAccounts(db, rid);
    const balances = await Promise.all(list.map((a) => accountBalance(db, rid, a.id)));
    body = (
      <AccountsPanel
        restaurantId={rid}
        currency={currency}
        canEdit={can(ctx, "accounting.manage")}
        accounts={list.map((a, i) => ({ ...a, balanceCents: balances[i]! }))}
      />
    );
  } else {
    body = <PmsSettingsPanel restaurantId={rid} currency={currency} settings={settings} />;
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border" aria-label={t("title")}>
        {TABS.map((k) => (
          <Link
            key={k}
            href={`/dashboard/${rid}/hotel?tab=${k}`}
            aria-current={k === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap",
              k === tab ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t(`tabs.${k}`)}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
