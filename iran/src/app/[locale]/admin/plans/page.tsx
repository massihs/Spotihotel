import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/money";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { adminListPlans, billingCurrency, billingEnabled } from "@/server/modules/billing/service";
import { updatePlanAction } from "../actions";

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Plans />
    </Suspense>
  );
}

async function Plans() {
  await requireSuperAdmin();
  const [t, locale, plans] = await Promise.all([
    getTranslations("admin.plans"),
    getLocale(),
    adminListPlans(db),
  ]);
  const currency = billingCurrency();
  const limit = (v: number | null) => (v === null ? "" : String(v));
  return (
    <>
      <PageHeader title={t("title")} description={billingEnabled() ? t("billingOn") : t("billingOff")} />
      <ul className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => (
          <li key={p.id}>
            <Card className="p-5">
              <form action={updatePlanAction} className="space-y-3">
                <input type="hidden" name="planId" value={p.id} />
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-fg-muted">{p.code}</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="isPublic" defaultChecked={p.isPublic} className="size-4" />
                    {t("public")}
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">{t("name")}</span>
                    <Input name="name" defaultValue={p.name} required maxLength={64} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block font-medium">{t("price", { currency })}</span>
                    <Input
                      name="price"
                      inputMode="numeric"
                      defaultValue={centsToInput(p.priceMonthlyCents, locale, currency)}
                    />
                  </label>
                  {(["maxTables", "maxStaff", "maxRestaurants", "maxOrdersPerMonth"] as const).map((k) => (
                    <label key={k} className="text-sm">
                      <span className="mb-1 block font-medium">{t(k)}</span>
                      <Input
                        name={k}
                        type="number"
                        min={0}
                        defaultValue={limit(p.limits[k])}
                        placeholder={t("unlimited")}
                      />
                    </label>
                  ))}
                </div>
                <Button type="submit" size="sm">
                  {t("save")}
                </Button>
              </form>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
