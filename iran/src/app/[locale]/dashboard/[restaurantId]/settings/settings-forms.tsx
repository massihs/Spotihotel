"use client";

import { KindPicker } from "@/components/kind-picker";
import { BrandPicker } from "@/components/brand-picker";
import { MenuThemePicker } from "@/components/menu-theme-picker";
import type { RestaurantKind } from "@/lib/restaurant-kind";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import {
  Checkbox,
  FormFeedback,
  SelectField,
  SubmitButton,
  TextareaField,
  useFieldError,
  ActionForm,
  useActionForm,
} from "@/components/ui/form";
import { LOCALE_LABELS, LOCALES } from "@/i18n/config";
import {
  createTaxRateAction,
  removeLogoAction,
  taxRateCommandAction,
  updateLegalAction,
  updatePaymentSettingsAction,
  updateProfileAction,
  updateServiceAction,
  uploadLogoAction,
} from "./actions";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ProfileValues = {
  name: string;
  kind: RestaurantKind;
  brandColor: string;
  menuTheme: string;
  menuShortPrices: boolean;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  currency: string;
  timezone: string;
  defaultLocale: string;
};

export function ProfileForm({
  restaurantId,
  values,
  currencies,
  timezones,
  disabled,
}: {
  restaurantId: string;
  values: ProfileValues;
  currencies: string[];
  timezones: string[];
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(updateProfileAction.bind(null, restaurantId));
  const state = form.state;
  const err = useFieldError(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <Field
          label={t("settings.name")}
          name="name"
          required
          defaultValue={values.name}
          error={err("name")}
        />
        <KindPicker defaultValue={values.kind} />
        <BrandPicker defaultValue={values.brandColor} />
        <MenuThemePicker
          defaultValue={values.menuTheme}
          shortPrices={values.menuShortPrices}
          toman={values.currency === "IRR"}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("settings.email")}
            name="email"
            type="email"
            defaultValue={values.email ?? ""}
            error={err("email")}
          />
          <Field
            label={t("settings.phone")}
            name="phone"
            type="tel"
            defaultValue={values.phone ?? ""}
            error={err("phone")}
          />
        </div>
        <Field
          label={t("settings.address1")}
          name="addressLine1"
          defaultValue={values.addressLine1 ?? ""}
          autoComplete="address-line1"
        />
        <Field
          label={t("settings.address2")}
          name="addressLine2"
          defaultValue={values.addressLine2 ?? ""}
          autoComplete="address-line2"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label={t("settings.postalCode")}
            name="postalCode"
            defaultValue={values.postalCode ?? ""}
            autoComplete="postal-code"
          />
          <Field
            label={t("settings.city")}
            name="city"
            defaultValue={values.city ?? ""}
            autoComplete="address-level2"
          />
          <Field
            label={t("settings.country")}
            name="country"
            required
            maxLength={2}
            defaultValue={values.country}
            error={err("country")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={t("settings.currency")}
            name="currency"
            defaultValue={values.currency}
            error={err("currency")}
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("settings.timezone")}
            name="timezone"
            defaultValue={values.timezone}
            error={err("timezone")}
          >
            {timezones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("settings.defaultLocale")}
            name="defaultLocale"
            defaultValue={values.defaultLocale}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </SelectField>
        </div>
      </fieldset>
      <FormFeedback state={state} success={t("common.saved")} />
      {!disabled ? (
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function LogoForm({
  restaurantId,
  logoUrl,
  disabled,
}: {
  restaurantId: string;
  logoUrl: string | null;
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(uploadLogoAction.bind(null, restaurantId));
  const state = form.state;
  const [preview, setPreview] = useState<string | null>(null);
  const shown = preview ?? logoUrl;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border">
        {shown ? (
          <img src={shown} alt={t("settings.logo")} className="size-full object-contain" />
        ) : (
          <span className="text-2xl text-fg-subtle">—</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-fg-muted">{t("settings.logoHint")}</p>
        {!disabled ? (
          <div className="flex flex-wrap gap-2">
            <ActionForm form={form}>
              <label className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border bg-surface px-4 text-sm font-medium focus-within:ring-4 focus-within:ring-[var(--ring)] hover:bg-surface-2">
                {t("settings.logoUpload")}
                <input
                  type="file"
                  name="logo"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPreview(URL.createObjectURL(f));
                    e.target.form?.requestSubmit();
                  }}
                />
              </label>
            </ActionForm>
            {logoUrl ? (
              <form action={async () => void (await removeLogoAction(restaurantId))}>
                <SubmitButton variant="ghost">{t("settings.logoRemove")}</SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
        <FormFeedback state={state} success={t("settings.logoUpdated")} />
      </div>
    </div>
  );
}

export type ServiceValues = {
  orderPrefix: string;
  pricesIncludeTax: boolean;
  sessionAutoCloseMinutes: number | null;
  enabledLocales: string[];
  openingHours: Partial<Record<(typeof DAYS)[number], { open: string; close: string }[]>> | null;
};

const AUTO_CLOSE_OPTIONS = [30, 60, 90, 120, 180, 240, 360];

export function ServiceForm({
  restaurantId,
  values,
  disabled,
}: {
  restaurantId: string;
  values: ServiceValues;
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(updateServiceAction.bind(null, restaurantId));
  const state = form.state;
  const err = useFieldError(state);
  const [closedDays, setClosedDays] = useState(
    () => new Set(DAYS.filter((d) => values.openingHours && (values.openingHours[d]?.length ?? 0) === 0)),
  );
  return (
    <ActionForm form={form} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("settings.orderPrefix")}
            name="orderPrefix"
            required
            maxLength={4}
            defaultValue={values.orderPrefix}
            hint={t("settings.orderPrefixHint")}
            error={err("orderPrefix")}
          />
          <SelectField
            label={t("settings.autoClose")}
            name="sessionAutoCloseMinutes"
            defaultValue={values.sessionAutoCloseMinutes?.toString() ?? ""}
            hint={t("settings.autoCloseHint")}
          >
            <option value="">{t("settings.autoCloseNever")}</option>
            {AUTO_CLOSE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? t("settings.minutes", { n: m }) : t("settings.hours", { n: m / 60 })}
              </option>
            ))}
          </SelectField>
        </div>
        <Checkbox
          name="pricesIncludeTax"
          label={t("settings.pricesIncludeTax")}
          defaultChecked={values.pricesIncludeTax}
        />
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("settings.locales")}</legend>
          <div className="flex flex-wrap gap-4">
            {LOCALES.map((l) => (
              <Checkbox
                key={l}
                name="enabledLocales"
                value={l}
                label={LOCALE_LABELS[l]}
                defaultChecked={values.enabledLocales.includes(l)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("settings.hours_title")}</legend>
          <div className="divide-y divide-border rounded-2xl border border-border">
            {DAYS.map((d) => {
              const slot = values.openingHours?.[d]?.[0];
              const closed = closedDays.has(d);
              return (
                <div key={d} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="w-24 text-sm font-medium">{t(`settings.days.${d}`)}</span>
                  <input
                    type="time"
                    name={`${d}.open`}
                    aria-label={`${t(`settings.days.${d}`)} — ${t("settings.open")}`}
                    defaultValue={slot?.open ?? "12:00"}
                    disabled={closed}
                    className="h-10 rounded-xl border border-border bg-surface px-2.5 text-sm disabled:opacity-40"
                  />
                  <span className="text-fg-subtle">–</span>
                  <input
                    type="time"
                    name={`${d}.close`}
                    aria-label={`${t(`settings.days.${d}`)} — ${t("settings.close")}`}
                    defaultValue={slot?.close ?? "23:00"}
                    disabled={closed}
                    className="h-10 rounded-xl border border-border bg-surface px-2.5 text-sm disabled:opacity-40"
                  />
                  <Checkbox
                    name={`${d}.closed`}
                    label={t("settings.closed")}
                    checked={closed}
                    onChange={(e) =>
                      setClosedDays((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d);
                        else next.delete(d);
                        return next;
                      })
                    }
                    className="ms-auto"
                  />
                </div>
              );
            })}
          </div>
        </fieldset>
      </fieldset>
      <FormFeedback state={state} success={t("common.saved")} />
      {!disabled ? (
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}

export type LegalValues = {
  legalName: string | null;
  legalId: string | null;
  vatNumber: string | null;
  registrationNumber: string | null;
  legalNotice: string | null;
  privacyPolicyUrl: string | null;
};

export function LegalForm({
  restaurantId,
  values,
  disabled,
}: {
  restaurantId: string;
  values: LegalValues;
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(updateLegalAction.bind(null, restaurantId));
  const state = form.state;
  const err = useFieldError(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <fieldset disabled={disabled} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("settings.legalName")} name="legalName" defaultValue={values.legalName ?? ""} />
          <Field label={t("settings.legalId")} name="legalId" defaultValue={values.legalId ?? ""} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("settings.vatNumber")}
            name="vatNumber"
            dir="ltr"
            defaultValue={values.vatNumber ?? ""}
          />
          <Field
            label={t("settings.registrationNumber")}
            name="registrationNumber"
            dir="ltr"
            defaultValue={values.registrationNumber ?? ""}
          />
          <Field
            label={t("settings.privacyPolicyUrl")}
            name="privacyPolicyUrl"
            type="url"
            placeholder="https://"
            defaultValue={values.privacyPolicyUrl ?? ""}
            error={err("privacyPolicyUrl")}
          />
        </div>
        <TextareaField
          label={t("settings.legalNotice")}
          name="legalNotice"
          maxLength={4000}
          defaultValue={values.legalNotice ?? ""}
        />
      </fieldset>
      <FormFeedback state={state} success={t("common.saved")} />
      {!disabled ? (
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}

export function TaxRates({
  restaurantId,
  rates,
  disabled,
}: {
  restaurantId: string;
  rates: { id: string; name: string; rateBps: number; isDefault: boolean }[];
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(createTaxRateAction.bind(null, restaurantId), { resetOnSuccess: true });
  const state = form.state;
  const [cmdError, setCmdError] = useState<string | null>(null);
  const err = useFieldError(state);
  const format = useFormatter();
  // Locale-explicit formatting: identical on server and client (no hydration mismatch).
  const fmt = (bps: number) => format.number(bps / 10_000, { style: "percent", maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-2xl border border-border">
        {rates.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{r.name}</span>{" "}
              <span className="text-fg-muted tabular-nums">· {fmt(r.rateBps)}</span>
            </span>
            {r.isDefault ? (
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                {t("settings.default")}
              </span>
            ) : null}
            {!disabled && !r.isDefault ? (
              <form
                className="flex gap-1"
                action={async (fd) => {
                  const res = await taxRateCommandAction(restaurantId, fd);
                  setCmdError(
                    res && !res.ok
                      ? t.has(`errorCodes.${res.error}`)
                        ? t(`errorCodes.${res.error}`)
                        : t("errorCodes.internal")
                      : null,
                  );
                }}
              >
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit" name="command" value="default" variant="ghost" size="sm">
                  {t("settings.makeDefault")}
                </Button>
                <Button
                  type="submit"
                  name="command"
                  value="delete"
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                >
                  {t("common.delete")}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {cmdError ? (
        <p role="alert" className="text-sm text-danger">
          {cmdError}
        </p>
      ) : null}
      {!disabled ? (
        <ActionForm form={form} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t("settings.taxName")} name="name" required maxLength={64} error={err("name")} />
          </div>
          <div className="w-28">
            <Field
              label={t("settings.taxRate")}
              name="rate"
              required
              inputMode="decimal"
              placeholder="10"
              error={err("rate")}
            />
          </div>
          <SubmitButton variant="secondary" className="h-11">
            {t("settings.addTax")}
          </SubmitButton>
          <div className="basis-full">
            <FormFeedback state={state} />
          </div>
        </ActionForm>
      ) : null}
    </div>
  );
}

export type PaymentValues = {
  onlinePaymentEnabled: boolean;
  enabledPaymentProviders: string[];
  requirePaymentBeforeOrder: boolean;
  planAllowsOnline: boolean;
  availableOnline: string[];
  zarinpalMerchantId: string | null;
  /** A platform-wide Zarinpal account exists (used when the restaurant has none). */
  platformZarinpal: boolean;
};

export function PaymentSettingsForm({
  restaurantId,
  values,
  disabled,
}: {
  restaurantId: string;
  values: PaymentValues;
  disabled: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(updatePaymentSettingsAction.bind(null, restaurantId));
  const state = form.state;
  const err = useFieldError(state);
  const [online, setOnline] = useState(values.onlinePaymentEnabled);
  const has = (c: string) => values.enabledPaymentProviders.includes(c);
  return (
    <ActionForm form={form} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-medium">{t("settings.paymentAtTable")}</p>
          {(["cash", "on_site_terminal", "pay_later"] as const).map((c) => (
            <Checkbox
              key={c}
              name="providers"
              value={c}
              defaultChecked={has(c)}
              label={t(`payments.provider.${c}`)}
              description={t(`settings.providerHint.${c}`)}
            />
          ))}
        </div>
        <div className="space-y-3 border-t border-border pt-5">
          <Checkbox
            name="onlinePaymentEnabled"
            checked={online}
            onChange={(e) => setOnline(e.target.checked)}
            disabled={!values.planAllowsOnline}
            label={t("settings.onlinePayment")}
            description={
              values.planAllowsOnline ? t("settings.onlinePaymentHint") : t("settings.onlinePaymentPlan")
            }
          />
          {err("onlinePaymentEnabled") ? (
            <p className="text-sm text-danger">{err("onlinePaymentEnabled")}</p>
          ) : null}
          {online ? (
            <div className="space-y-3 ps-7">
              {values.availableOnline.length === 0 ? (
                <p className="text-sm text-fg-muted">{t("settings.noOnlineProvider")}</p>
              ) : (
                values.availableOnline.map((c) => (
                  <div key={c} className="space-y-3">
                    <Checkbox
                      name="providers"
                      value={c}
                      defaultChecked={has(c)}
                      label={t(`payments.provider.${c}`)}
                      description={t(`settings.providerHint.${c}`)}
                    />
                    {c === "zarinpal" ? (
                      <div className="ps-7">
                        <Field
                          label={t("settings.zarinpalMerchant")}
                          name="zarinpalMerchantId"
                          dir="ltr"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          defaultValue={values.zarinpalMerchantId ?? ""}
                          error={err("zarinpalMerchantId")}
                          hint={
                            values.platformZarinpal
                              ? t("settings.zarinpalMerchantHintFallback")
                              : t("settings.zarinpalMerchantHint")
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          ) : (
            // Keep the online choices when the toggle is off, so turning it back on restores them.
            values.enabledPaymentProviders
              .filter((c) => values.availableOnline.includes(c))
              .map((c) => <input key={c} type="hidden" name="providers" value={c} />)
          )}
        </div>
        <div className="border-t border-border pt-5">
          <Checkbox
            name="requirePaymentBeforeOrder"
            defaultChecked={values.requirePaymentBeforeOrder}
            label={t("settings.requirePayment")}
            description={t("settings.requirePaymentHint")}
          />
        </div>
      </fieldset>
      <FormFeedback state={state} success={t("common.saved")} />
      {!disabled ? (
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
