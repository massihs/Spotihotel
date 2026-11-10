import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskActions, DeskTable, DeskTabs, PeriodForm } from "@/components/pms/desk-table";
import { CashierSettingsForm, MoveLines, ShiftPanel, TransferBalance } from "@/components/pms/cashier-ui";
import { can } from "@/server/tenancy";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { isDay } from "@/server/modules/pms/calc";
import { listAccounts } from "@/server/modules/pms/guests";
import { PAYMENT_METHODS } from "@/server/modules/pms/folios";
import { DESK_TABLES, deskPeriod, type Cell, type DeskTableKey } from "@/server/modules/pms/desk-reports";
import { cashierSettings, currentShift, deskColleagues, shiftReport } from "@/server/modules/pms/cashier";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/cashier">;
const TABS = [
  "handover",
  "currency",
  "daily",
  "transactions",
  "move",
  "transfer",
  "pending",
  "search",
  "summary",
  "handoverReport",
  "settings",
] as const;
type Tab = (typeof TABS)[number];
const TABLE: Partial<Record<Tab, DeskTableKey | "shifts">> = {
  currency: "currencyReport",
  daily: "dailyCash",
  transactions: "transactions",
  pending: "pendingSettlement",
  search: "transactions",
  summary: "cashierSummary",
  handoverReport: "shifts",
};

export default function CashierPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Cashier {...props} />
    </Suspense>
  );
}

/** صندوق: the front desk cashier: shift handover, takings, transfers between accounts, reports. */
async function Cashier({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const sp = await searchParams;
  const ctx = await requireRestaurant(restaurantId, "folio.post");
  const rid = ctx.restaurant.id;
  const currency = ctx.restaurant.currency;
  const tab: Tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "handover";
  const [t, tPay] = await Promise.all([getTranslations("deskReports"), getTranslations("pms.method")]);
  const base = `/dashboard/${rid}/cashier`;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const def = await deskPeriod(
    db,
    ctx,
    tab === "search" ? 90 : tab === "summary" || tab === "handoverReport" ? 0 : 6,
    0,
  );
  const from = isDay(str(sp.from)) ? str(sp.from) : def.from;
  const to = isDay(str(sp.to)) ? str(sp.to) : def.to;
  const q = str(sp.q);
  const method = str(sp.method);
  const key = TABLE[tab];
  const p = { from, to, q, method: method || undefined };
  const stayLink = (row: Record<string, Cell>) => (row.id ? `/dashboard/${rid}/stays/${row.id}` : null);
  const canAdjust = can(ctx, "folio.adjust");

  const csv = key
    ? `/dashboard/${rid}/desk-export?report=${key}&from=${from}&to=${to}&q=${encodeURIComponent(q)}${method ? `&method=${method}` : ""}`
    : undefined;

  let body: React.ReactNode;
  if (key) {
    const table = key === "shifts" ? await shiftReport(db, ctx, p) : await DESK_TABLES[key](db, ctx, p);
    body = (
      <>
        <PeriodForm
          base={base}
          tab={tab}
          from={from}
          to={to}
          q={q}
          period={tab !== "pending"}
          search={tab === "search" || tab === "pending" || tab === "transactions"}
          choice={
            tab === "transactions" || tab === "search"
              ? {
                  name: "method",
                  value: method,
                  options: [
                    { value: "", label: t("choice.allMethods") },
                    ...[...PAYMENT_METHODS, "city_ledger"].map((m) => ({
                      value: m,
                      label: tPay(m as "cash"),
                    })),
                  ],
                }
              : undefined
          }
        />
        {tab === "search" && !q ? (
          <p className="mb-3 text-sm text-fg-muted">{t("cashier.searchHint")}</p>
        ) : null}
        <DeskTable
          table={tab === "search" && !q ? { ...table, rows: [], totals: undefined } : table}
          currency={currency}
          timeZone={ctx.restaurant.timezone}
          limit={sp.all ? 100_000 : 400}
          allHref={`${base}?tab=${tab}&from=${from}&to=${to}&q=${encodeURIComponent(q)}&method=${method}&all=1`}
          links={{ number: stayLink }}
          empty={t(`cashier.empty.${tab}`)}
        />
      </>
    );
  } else if (tab === "handover") {
    const [shift, settings, colleagues] = await Promise.all([
      currentShift(db, ctx),
      cashierSettings(db, ctx),
      deskColleagues(db, ctx),
    ]);
    body = (
      <ShiftPanel
        rid={rid}
        currency={currency}
        currencies={settings.currencies}
        defaultFloatCents={settings.deskFloatCents}
        colleagues={colleagues.filter((c) => c.id !== ctx.user.id)}
        shift={
          shift
            ? {
                openedAt: shift.openedAt.toISOString(),
                openingFloatCents: shift.openingFloatCents,
                expectedCashCents: shift.expectedCashCents,
                byMethod: shift.takings.byMethod,
                foreign: shift.takings.foreign,
                count: shift.takings.count,
              }
            : null
        }
      />
    );
  } else if (tab === "move") {
    body = canAdjust ? (
      <MoveLines rid={rid} currency={currency} />
    ) : (
      <NoRight text={t("cashier.needAdjust")} />
    );
  } else if (tab === "transfer") {
    body = canAdjust ? (
      <TransferBalance
        rid={rid}
        currency={currency}
        accounts={(await listAccounts(db, rid))
          .filter((a) => a.active)
          .map((a) => ({ id: a.id, name: a.name }))}
      />
    ) : (
      <NoRight text={t("cashier.needAdjust")} />
    );
  } else {
    body = (
      <CashierSettingsForm
        rid={rid}
        currency={currency}
        settings={await cashierSettings(db, ctx)}
        canEdit={canAdjust}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={t("cashier.title")}
        description={t("cashier.subtitle")}
        actions={key ? <DeskActions csv={csv} /> : null}
      />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="deskReports.cashier" />
      {body}
    </>
  );
}

function NoRight({ text }: { text: string }) {
  return <p className="rounded-2xl bg-surface-2 p-6 text-sm text-fg-muted">{text}</p>;
}
