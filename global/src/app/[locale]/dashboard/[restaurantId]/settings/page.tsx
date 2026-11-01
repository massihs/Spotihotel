import { edition } from "@/config/edition";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { getRestaurantSettingsView } from "@/server/modules/restaurants/settings";
import { getPaymentSettingsView } from "@/server/modules/payments/service";
import {
  LegalForm,
  LogoForm,
  PaymentSettingsForm,
  ProfileForm,
  ServiceForm,
  TaxRates,
} from "./settings-forms";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/settings">["params"];

const COMMON_CURRENCIES = edition.currencies;

export default function SettingsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "restaurant.view");
  const [t, view, payment] = await Promise.all([
    getTranslations("settings"),
    getRestaurantSettingsView(db, ctx),
    getPaymentSettingsView(db, ctx),
  ]);
  const readOnly = !can(ctx, "restaurant.manage");
  const { restaurant: r, settings: s } = view;
  const rid = ctx.restaurant.id;
  const currencies = Array.from(new Set([r.currency, ...COMMON_CURRENCIES]));
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader title={t("profile")} description={t("profileHint")} />
          <div className="space-y-6 p-5">
            <LogoForm restaurantId={rid} logoUrl={view.logoUrl} disabled={readOnly} />
            <ProfileForm
              restaurantId={rid}
              disabled={readOnly}
              currencies={currencies}
              timezones={timezones}
              values={{
                name: r.name,
                email: r.email,
                phone: r.phone,
                addressLine1: r.addressLine1,
                addressLine2: r.addressLine2,
                city: r.city,
                postalCode: r.postalCode,
                country: r.country,
                currency: r.currency,
                timezone: r.timezone,
                defaultLocale: r.defaultLocale,
              }}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("service")} description={t("serviceHint")} />
          <div className="p-5">
            <ServiceForm
              restaurantId={rid}
              disabled={readOnly}
              values={{
                orderPrefix: s.orderPrefix,
                pricesIncludeTax: s.pricesIncludeTax,
                sessionAutoCloseMinutes: s.sessionAutoCloseMinutes,
                enabledLocales: s.enabledLocales,
                openingHours: s.openingHours,
              }}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("payments")} description={t("paymentsHint")} />
          <div className="p-5">
            <PaymentSettingsForm restaurantId={rid} disabled={readOnly} values={payment} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("taxes")} description={t("taxesHint")} />
          <div className="p-5">
            <TaxRates
              restaurantId={rid}
              disabled={readOnly}
              rates={view.taxRates.map((x) => ({
                id: x.id,
                name: x.name,
                rateBps: x.rateBps,
                isDefault: x.isDefault,
              }))}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("legal")} description={t("legalHint")} />
          <div className="p-5">
            <LegalForm
              restaurantId={rid}
              disabled={readOnly}
              values={{
                legalName: s.legalName,
                legalId: s.legalId,
                vatNumber: s.vatNumber,
                legalNotice: s.legalNotice,
                privacyPolicyUrl: s.privacyPolicyUrl,
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
