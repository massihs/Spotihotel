import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskActions, DeskTable, DeskTabs, PeriodForm, tableCsv } from "@/components/pms/desk-table";
import { db } from "@/server/db/client";
import { can, type RestaurantContext } from "@/server/tenancy";
import { addDays, isDay } from "@/server/modules/pms/calc";
import { getPmsSettings } from "@/server/modules/pms/setup";
import {
  inHouseRooms,
  listServiceItems,
  listServiceTickets,
  serviceCashbox,
  serviceReport,
  servicesSettings,
  type ServiceKind,
} from "@/server/modules/hotel/services";
import { CashTotals, ItemsPanel, SettingsForm, TicketForm, TicketList } from "./services-ui";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
export const TABS: Record<ServiceKind, readonly string[]> = {
  laundry: ["register", "tickets", "base", "cashbox", "reports", "settings"],
  damage: ["register", "tickets", "base", "cashbox", "reports", "settings"],
};

/** The default period of a list: the last week up to the hotel's business day. */
export async function periodOf(
  ctx: RestaurantContext,
  sp: Record<string, string | string[] | undefined>,
  back = 6,
) {
  const { businessDate } = await getPmsSettings(db, ctx.restaurant.id, ctx.restaurant.timezone);
  const from = isDay(str(sp.from)) ? str(sp.from) : addDays(businessDate, -back);
  const to = isDay(str(sp.to)) ? str(sp.to) : businessDate;
  return { from, to, today: businessDate, q: str(sp.q) };
}

/** لاندری / خسارت: one page per department, its tabs as in the reference PMS. */
export async function ServiceModule({
  ctx,
  kind,
  path,
  sp,
}: {
  ctx: RestaurantContext;
  kind: ServiceKind;
  path: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const ns = kind === "laundry" ? "laundry" : "damages";
  const t = await getTranslations(ns);
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/${path}`;
  const tabs = TABS[kind];
  const tab = tabs.includes(str(sp.tab)) ? str(sp.tab) : "register";
  const { from, to, today, q } = await periodOf(ctx, sp, tab === "tickets" ? 2 : 6);
  const currency = ctx.restaurant.currency;
  const conf = await servicesSettings(db, rid, ctx.restaurant.timezone);
  let body: React.ReactNode = null;
  if (tab === "register") {
    const [items, rooms] = await Promise.all([listServiceItems(db, rid, kind, true), inHouseRooms(db, rid)]);
    const recent = await listServiceTickets(db, ctx, kind, { from: today, to: today });
    body = (
      <div className="space-y-8">
        <TicketForm
          rid={rid}
          kind={kind}
          currency={currency}
          items={items}
          rooms={rooms}
          defaultToRoom={kind === "laundry" ? conf.laundry.settleToRoom : conf.damage.settleToRoom}
          expressPct={conf.laundry.expressPct}
        />
        <section>
          <h2 className="mb-3 text-lg font-bold">{t("today")}</h2>
          <TicketList
            rid={rid}
            kind={kind}
            currency={currency}
            tickets={recent}
            timeZone={ctx.restaurant.timezone}
            canAdjust={can(ctx, "folio.adjust")}
          />
        </section>
      </div>
    );
  } else if (tab === "tickets") {
    const status = str(sp.status);
    const tickets = await listServiceTickets(db, ctx, kind, { from, to, q, status: status || undefined });
    const statuses =
      kind === "laundry"
        ? ["received", "in_progress", "ready", "delivered", "cancelled"]
        : ["open", "cancelled"];
    const ts = await getTranslations("services");
    body = (
      <>
        <PeriodForm
          base={base}
          tab={tab}
          from={from}
          to={to}
          q={q}
          search
          choice={{
            name: "status",
            value: status,
            options: [
              { value: "", label: ts("allStatuses") },
              ...statuses.map((s) => ({ value: s, label: ts(`status.${s}`) })),
            ],
          }}
        />
        <TicketList
          rid={rid}
          kind={kind}
          currency={currency}
          tickets={tickets}
          timeZone={ctx.restaurant.timezone}
          canAdjust={can(ctx, "folio.adjust")}
        />
      </>
    );
  } else if (tab === "base") {
    body = (
      <ItemsPanel
        rid={rid}
        kind={kind}
        currency={currency}
        items={await listServiceItems(db, rid, kind)}
        canManage={can(ctx, "rates.manage")}
      />
    );
  } else if (tab === "cashbox") {
    const cb = await serviceCashbox(db, ctx, kind, { from, to, q });
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} q={q} search />
        <DeskActions csv={await tableCsv(cb.table, currency)} />
        <CashTotals by={cb.by} currency={currency} />
        <DeskTable table={cb.table} currency={currency} />
      </>
    );
  } else if (tab === "reports") {
    const rep = await serviceReport(db, ctx, kind, { from, to });
    const ts = await getTranslations("services");
    body = (
      <>
        <PeriodForm base={base} tab={tab} from={from} to={to} />
        <DeskActions csv={await tableCsv(rep.byItem, currency)} />
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 font-bold">{ts("report.byItem")}</h2>
            <DeskTable
              table={{
                ...rep.byItem,
                rows: rep.byItem.rows.map((r) => ({
                  ...r,
                  item: r.item === "express" ? ts("express") : r.item,
                })),
              }}
              currency={currency}
            />
          </section>
          <section>
            <h2 className="mb-2 font-bold">{ts("report.byDay")}</h2>
            <DeskTable table={rep.byDay} currency={currency} />
          </section>
        </div>
      </>
    );
  } else {
    body =
      kind === "laundry" ? (
        <SettingsForm
          rid={rid}
          section="laundry"
          ns="services"
          values={conf.laundry}
          fields={[
            { key: "expressPct", type: "int", min: 0, max: 300 },
            { key: "readyHours", type: "int", min: 1, max: 168 },
            { key: "settleToRoom", type: "bool" },
          ]}
        />
      ) : (
        <SettingsForm
          rid={rid}
          section="damage"
          ns="services"
          values={conf.damage}
          fields={[{ key: "settleToRoom", type: "bool" }]}
        />
      );
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DeskTabs base={base} tabs={tabs} current={tab} ns={ns} />
      {body}
    </>
  );
}
