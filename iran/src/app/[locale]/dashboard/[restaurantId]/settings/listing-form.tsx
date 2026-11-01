"use client";

import { ExternalLink, LocateFixed, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { CUISINE_ICONS } from "@/components/directory/cuisine-icons";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  Checkbox,
  FormFeedback,
  SelectField,
  SubmitButton,
  useActionForm,
  useFieldError,
} from "@/components/ui/form";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { CUISINES, IRAN_CITIES } from "@/lib/directory";
import { updateListingAction } from "./actions";

export type ListingValues = {
  listed: boolean;
  cuisines: string[];
  priceLevel: number | null;
  showPublicPrices: boolean;
  tagline: string | null;
  city: string | null;
  cityKey: string | null;
  latitude: number | null;
  longitude: number | null;
  slug: string;
};

/** The owner's side of the public guide: opt in, city, styles, price level, map position. */
export function ListingForm({
  restaurantId,
  values,
  disabled,
}: {
  restaurantId: string;
  values: ListingValues;
  disabled: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const form = useActionForm(updateListingAction.bind(null, restaurantId));
  const err = useFieldError(form.state);
  const [themes, setThemes] = useState<string[]>(values.cuisines);
  const [lat, setLat] = useState(values.latitude?.toString() ?? "");
  const [lng, setLng] = useState(values.longitude?.toString() ?? "");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const local = locale === "fa" || locale === "ar";
  // A free-text city that is not one of ours stays selectable as is.
  const cityValue = values.cityKey
    ? IRAN_CITIES.find((c) => c.key === values.cityKey)!.fa
    : (values.city ?? "");

  const locate = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) return setGeoError(t("directory.locationUnsupported"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setLat(p.coords.latitude.toFixed(6));
        setLng(p.coords.longitude.toFixed(6));
      },
      () => {
        setLocating(false);
        setGeoError(t("directory.locationDenied"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <ActionForm form={form} className="space-y-5">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-surface-2 p-4">
          <Checkbox
            name="listed"
            defaultChecked={values.listed}
            label={t("listing.listed")}
            description={t("listing.listedHint")}
          />
          <Link
            href={`/r/${values.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-text hover:underline"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            {t("listing.viewPage")}
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label={t("listing.city")} name="city" defaultValue={cityValue}>
            <option value="">{t("listing.cityPick")}</option>
            {!values.cityKey && values.city ? <option value={values.city}>{values.city}</option> : null}
            {IRAN_CITIES.map((c) => (
              <option key={c.key} value={c.fa}>
                {local ? c.fa : `${c.en} — ${c.fa}`}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("listing.priceLevel")}
            name="priceLevel"
            defaultValue={values.priceLevel?.toString() ?? ""}
          >
            <option value="">{t("listing.priceNone")}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {"●".repeat(n)} {t(`directory.price.${n}`)}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="rounded-2xl bg-surface-2 p-4">
          <Checkbox
            name="showPublicPrices"
            defaultChecked={values.showPublicPrices}
            label={t("listing.showPrices")}
            description={t("listing.showPricesHint")}
          />
        </div>

        <Field
          label={t("listing.tagline")}
          name="tagline"
          maxLength={200}
          placeholder={t("listing.taglinePlaceholder")}
          defaultValue={values.tagline ?? ""}
        />

        <fieldset>
          <legend className="text-sm font-medium">{t("listing.cuisines")}</legend>
          <p className="mb-2.5 text-xs text-fg-muted">{t("listing.cuisinesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => {
              const on = themes.includes(c);
              const Icon = CUISINE_ICONS[c];
              return (
                <label
                  key={c}
                  className={cn(
                    "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]",
                    on ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted hover:text-fg",
                    !on && themes.length >= 5 && "pointer-events-none opacity-40",
                  )}
                >
                  <input
                    type="checkbox"
                    name="cuisines"
                    value={c}
                    checked={on}
                    disabled={!on && themes.length >= 5}
                    onChange={() => setThemes((s) => (on ? s.filter((x) => x !== c) : [...s, c]))}
                    className="sr-only"
                  />
                  <Icon className="size-4" aria-hidden="true" />
                  {t(`directory.cuisine.${c}`)}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t("listing.position")}</legend>
          <p className="text-xs text-fg-muted">{t("listing.positionHint")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-sm font-bold text-bg disabled:opacity-60"
            >
              <LocateFixed className={cn("size-4", locating && "animate-pulse")} aria-hidden="true" />
              {locating ? t("directory.locating") : t("listing.useMyPosition")}
            </button>
            {lat && lng ? (
              <>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {t("listing.openMap")}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setLat("");
                    setLng("");
                  }}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-fg-muted hover:text-fg"
                >
                  <X className="size-4" aria-hidden="true" />
                  {t("listing.clearPosition")}
                </button>
              </>
            ) : null}
          </div>
          {geoError ? (
            <p role="alert" className="text-sm text-danger">
              {geoError}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("listing.lat")}
              name="latitude"
              inputMode="decimal"
              dir="ltr"
              placeholder="35.6892"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              error={err("latitude")}
            />
            <Field
              label={t("listing.lng")}
              name="longitude"
              inputMode="decimal"
              dir="ltr"
              placeholder="51.3890"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              error={err("longitude")}
            />
          </div>
          {!lat || !lng ? <p className="text-xs text-fg-muted">{t("listing.noPosition")}</p> : null}
        </fieldset>
      </fieldset>
      <FormFeedback state={form.state} success={t("common.saved")} />
      {!disabled ? (
        <div className="flex justify-end">
          <SubmitButton>{t("common.save")}</SubmitButton>
        </div>
      ) : null}
    </ActionForm>
  );
}
