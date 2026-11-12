import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { DeskTabs, PeriodForm } from "@/components/pms/desk-table";
import { AccountsPanel, ProfilesPanel } from "@/components/hotel/modules-ui";
import { SettingsForm } from "@/components/hotel/services-ui";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { inHouseRooms, servicesSettings } from "@/server/modules/hotel/services";
import { listInternetAccounts, listInternetProfiles } from "@/server/modules/hotel/internet";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/internet">;
const TABS = ["users", "profiles", "settings"] as const;

export default function InternetPage(props: Props) {
  return (
    <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-surface-2" />}>
      <Internet {...props} />
    </Suspense>
  );
}

/** اینترنت: the guests' logins, the plans, how logins are made. */
async function Internet({ params, searchParams }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const sp = await searchParams;
  const tab = TABS.find((x) => x === sp.tab) ?? "users";
  const t = await getTranslations("internet");
  const rid = ctx.restaurant.id;
  const base = `/dashboard/${rid}/internet`;
  const profiles = await listInternetProfiles(db, rid);
  let body: React.ReactNode;
  if (tab === "users") {
    const q = typeof sp.q === "string" ? sp.q : "";
    const status = typeof sp.status === "string" ? sp.status : "";
    const [accounts, rooms] = await Promise.all([
      listInternetAccounts(db, ctx, q, status || undefined),
      inHouseRooms(db, rid),
    ]);
    body = (
      <>
        <PeriodForm
          base={base}
          tab={tab}
          q={q}
          search
          period={false}
          choice={{
            name: "status",
            value: status,
            options: [
              { value: "", label: t("status.all") },
              ...["active", "disabled", "expired"].map((s) => ({ value: s, label: t(`status.${s}`) })),
            ],
          }}
        />
        <AccountsPanel
          rid={rid}
          accounts={accounts}
          profiles={profiles.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
          rooms={rooms}
          timeZone={ctx.restaurant.timezone}
          canAdjust={can(ctx, "folio.adjust")}
        />
      </>
    );
  } else if (tab === "profiles") {
    body = (
      <ProfilesPanel
        rid={rid}
        currency={ctx.restaurant.currency}
        profiles={profiles}
        canManage={can(ctx, "rates.manage")}
      />
    );
  } else {
    const conf = (await servicesSettings(db, rid, ctx.restaurant.timezone)).internet;
    body = (
      <SettingsForm
        rid={rid}
        section="internet"
        ns="internet"
        values={{ ...conf, profileId: conf.profileId ?? "" }}
        fields={[
          { key: "autoCreate", type: "bool" },
          {
            key: "profileId",
            type: "select",
            options: [{ value: "", label: "—" }, ...profiles.map((p) => ({ value: p.id, label: p.name }))],
          },
          {
            key: "usernameMode",
            type: "select",
            options: [
              { value: "room", label: t("settings.mode.room") },
              { value: "random", label: t("settings.mode.random") },
            ],
          },
          { key: "passwordLength", type: "int", min: 4, max: 16 },
          { key: "disableOnCheckout", type: "bool" },
        ]}
      />
    );
  }
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <DeskTabs base={base} tabs={TABS} current={tab} ns="internet" />
      {body}
    </>
  );
}
