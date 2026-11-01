import { edition } from "@/config/edition";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import {
  Blocks,
  Building2,
  Globe,
  Target,
  Clock,
  CreditCard,
  Laptop,
  Percent,
  Printer,
  Scale,
  ShieldCheck,
  Store,
} from "lucide-react";
import type { ReactNode } from "react";
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
import { ModulesForm } from "./modules-form";
import { ListingForm } from "./listing-form";
import { getCoverChoices, getListing } from "@/server/modules/directory/service";
import { CoverPicker } from "./cover-picker";
import { PrintersPanel } from "./printers-panel";
import { DesktopPanel } from "./desktop-panel";
import { listDevices } from "@/server/modules/offline/service";
import { desktopDownloads } from "@/lib/desktop";
import { listPrinters } from "@/server/modules/printing/service";
import { listStations } from "@/server/modules/kitchen/stations";
import { env } from "@/server/env";
import { isModule } from "@/lib/modules";
import { listGuestBlocks } from "@/server/modules/guest/safety";
import { SecurityPanel } from "./security-panel";
import { OnlinePanel } from "./online-panel";
import { KioskPanel } from "./kiosk-panel";
import { GoalsForm } from "./goals-form";
import { getKpiGoals } from "@/server/modules/kpi/service";
import { getKioskSettings, getOnlineSettings } from "@/server/modules/online/service";
import { listZones } from "@/server/modules/delivery/service";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/settings">["params"];

const COMMON_CURRENCIES = edition.currencies;
/** "Seen 3 min ago" is computed against the render time, the same on server and client. */
const renderedAt = () => Date.now();

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
  const [t, view, payment, printing, setup, listing, cover, devices, blocks, online, zones, kiosk, goals] =
    await Promise.all([
      getTranslations("settings"),
      getRestaurantSettingsView(db, ctx),
      getPaymentSettingsView(db, ctx),
      listPrinters(db, ctx),
      can(ctx, "orders.view") ? listStations(db, ctx) : { stations: [] },
      getListing(db, ctx),
      getCoverChoices(db, ctx),
      listDevices(db, ctx),
      listGuestBlocks(db, ctx),
      getOnlineSettings(db, ctx),
      can(ctx, "orders.view") ? listZones(db, ctx) : [],
      getKioskSettings(db, ctx),
      getKpiGoals(db, ctx.restaurant.id),
    ]);
  const readOnly = !can(ctx, "restaurant.manage");
  const { restaurant: r, settings: s } = view;
  const rid = ctx.restaurant.id;
  const currencies = Array.from(new Set([r.currency, ...COMMON_CURRENCIES]));
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:max-w-6xl">
        <nav
          aria-label={t("title")}
          className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:px-0"
        >
          {SECTIONS.map(({ key, icon }) => (
            <a
              key={key}
              href={`#${key === "desktopTitle" ? "desktop" : key}`}
              className="flex shrink-0 items-center gap-2.5 rounded-full bg-surface px-4 py-2 text-sm font-bold whitespace-nowrap text-fg-muted shadow-[var(--shadow-soft)] hover:text-fg lg:rounded-2xl lg:bg-transparent lg:py-2.5 lg:shadow-none lg:hover:bg-surface [&_svg]:size-4 [&_svg]:shrink-0"
            >
              {icon}
              {t(key)}
            </a>
          ))}
        </nav>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <Card id="profile" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Building2 />}>{t("profile")}</SectionTitle>}
              description={t("profileHint")}
            />
            <div className="space-y-6 p-5 sm:p-6">
              <LogoForm restaurantId={rid} logoUrl={view.logoUrl} disabled={readOnly} />
              <ProfileForm
                restaurantId={rid}
                disabled={readOnly}
                currencies={currencies}
                timezones={timezones}
                values={{
                  name: r.name,
                  kind: r.kind,
                  brandColor: r.brandColor,
                  menuTheme: r.menuTheme,
                  menuShortPrices: r.menuShortPrices,
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
          <Card id="listing" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Store />}>{t("listing")}</SectionTitle>}
              description={t("listingHint")}
            />
            <div className="space-y-6 p-5 sm:p-6">
              <CoverPicker restaurantId={rid} disabled={readOnly} choices={cover} />
              <ListingForm restaurantId={rid} disabled={readOnly} values={listing} />
            </div>
          </Card>
          <Card id="modules" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Blocks />}>{t("modules")}</SectionTitle>}
              description={t("modulesHint")}
            />
            <div className="p-5 sm:p-6">
              <ModulesForm
                restaurantId={rid}
                readOnly={readOnly}
                disabled={s.disabledModules.filter(isModule)}
              />
            </div>
          </Card>
          <Card id="printers" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Printer />}>{t("printers")}</SectionTitle>}
              description={t("printersHint")}
            />
            <div className="p-5 sm:p-6">
              <PrintersPanel
                restaurantId={rid}
                readOnly={readOnly}
                appUrl={env().APP_URL}
                stations={setup.stations.map((s) => ({ id: s.id, name: s.name }))}
                data={{
                  ...printing,
                  agentSeenAt: printing.agentSeenAt?.toISOString() ?? null,
                  now: renderedAt(),
                  printers: printing.printers.map((p) => ({
                    id: p.id,
                    name: p.name,
                    host: p.host,
                    port: p.port,
                    paperMm: p.paperMm,
                    target: p.target,
                    stationId: p.stationId,
                    copies: p.copies,
                    isActive: p.isActive,
                    lastStatus: p.lastStatus,
                    lastError: p.lastError,
                  })),
                }}
              />
            </div>
          </Card>
          <Card id="desktop" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Laptop />}>{t("desktopTitle")}</SectionTitle>}
              description={t("desktopHint")}
            />
            <div className="p-5 sm:p-6">
              <DesktopPanel
                restaurantId={rid}
                readOnly={readOnly}
                downloads={desktopDownloads()}
                now={renderedAt()}
                devices={devices.map((d) => ({
                  id: d.id,
                  name: d.name,
                  lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
                  lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
                  syncedOrders: d.syncedOrders,
                  appVersion: d.appVersion,
                }))}
              />
            </div>
          </Card>
          <Card id="service" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Clock />}>{t("service")}</SectionTitle>}
              description={t("serviceHint")}
            />
            <div className="p-5 sm:p-6">
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
          <Card id="goals" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Target />}>{t("goals")}</SectionTitle>}
              description={t("goalsHint")}
            />
            <div className="p-5 sm:p-6">
              <GoalsForm restaurantId={rid} currency={r.currency} disabled={readOnly} values={goals} />
            </div>
          </Card>
          <Card id="online" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Globe />}>{t("online")}</SectionTitle>}
              description={t("onlineHint")}
            />
            <div className="p-5 sm:p-6">
              <OnlinePanel
                restaurantId={rid}
                url={`${env().APP_URL}/r/${r.slug}/order`}
                hasZones={zones.length > 0}
                disabled={readOnly}
                values={online}
              />
              <div className="mt-4">
                <KioskPanel restaurantId={rid} appUrl={env().APP_URL} disabled={readOnly} values={kiosk} />
              </div>
            </div>
          </Card>
          <Card id="security" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<ShieldCheck />}>{t("security")}</SectionTitle>}
              description={t("securityHint")}
            />
            <div className="p-5 sm:p-6">
              <SecurityPanel
                restaurantId={rid}
                needStaff={s.guestOrdersNeedStaff}
                blocks={blocks}
                canManage={!readOnly}
                canUnblock={can(ctx, "orders.cancel")}
                timeZone={r.timezone}
              />
            </div>
          </Card>
          <Card id="payments" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<CreditCard />}>{t("payments")}</SectionTitle>}
              description={t("paymentsHint")}
            />
            <div className="p-5 sm:p-6">
              <PaymentSettingsForm restaurantId={rid} disabled={readOnly} values={payment} />
            </div>
          </Card>
          <Card id="taxes" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Percent />}>{t("taxes")}</SectionTitle>}
              description={t("taxesHint")}
            />
            <div className="p-5 sm:p-6">
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
          <Card id="legal" className="scroll-mt-24">
            <CardHeader
              title={<SectionTitle icon={<Scale />}>{t("legal")}</SectionTitle>}
              description={t("legalHint")}
            />
            <div className="p-5 sm:p-6">
              <LegalForm
                restaurantId={rid}
                disabled={readOnly}
                values={{
                  legalName: s.legalName,
                  legalId: s.legalId,
                  vatNumber: s.vatNumber,
                  registrationNumber: s.registrationNumber,
                  legalNotice: s.legalNotice,
                  privacyPolicyUrl: s.privacyPolicyUrl,
                }}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

const SECTIONS = [
  { key: "profile", icon: <Building2 aria-hidden="true" /> },
  { key: "listing", icon: <Store aria-hidden="true" /> },
  { key: "modules", icon: <Blocks aria-hidden="true" /> },
  { key: "printers", icon: <Printer aria-hidden="true" /> },
  { key: "desktopTitle", icon: <Laptop aria-hidden="true" /> },
  { key: "service", icon: <Clock aria-hidden="true" /> },
  { key: "goals", icon: <Target aria-hidden="true" /> },
  { key: "online", icon: <Globe aria-hidden="true" /> },
  { key: "security", icon: <ShieldCheck aria-hidden="true" /> },
  { key: "payments", icon: <CreditCard aria-hidden="true" /> },
  { key: "taxes", icon: <Percent aria-hidden="true" /> },
  { key: "legal", icon: <Scale aria-hidden="true" /> },
] as const;

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="grid size-9 place-items-center rounded-lg bg-accent-soft text-accent-text [&_svg]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      {children}
    </span>
  );
}
