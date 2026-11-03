"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { useRun } from "@/components/ui/sheet-kit";
import { EDITION } from "@/config/edition";
import { submitPrecheckinAction } from "@/app/[locale]/precheckin/[code]/actions";
import { FormError, Label, inputCls } from "@/components/pms/kit";

type Guest = {
  firstName: string;
  lastName: string;
  fatherName: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  address: string | null;
};

/** The guest's registration card, filled on their phone before arriving. */
export function PrecheckinForm({
  code,
  guest,
  eta,
  done,
}: {
  code: string;
  guest: Guest;
  eta: string | null;
  done: boolean;
}) {
  const t = useTranslations("precheckin");
  const iran = EDITION === "iran";
  const [foreigner, setForeigner] = useState(iran ? !!guest.nationality && guest.nationality !== "IR" : true);
  const [sent, setSent] = useState(done);
  const r = useRun();
  if (sent)
    return (
      <div className="space-y-3 rounded-3xl bg-success-soft p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden="true" />
        <p className="text-lg font-bold">{t("thanks")}</p>
        <p className="text-sm text-fg-muted">{t("thanksHint")}</p>
        <Button variant="ghost" size="sm" onClick={() => setSent(false)}>
          {t("edit")}
        </Button>
      </div>
    );
  return (
    <form
      className="space-y-4"
      action={(fd) => {
        const v = (k: string) => String(fd.get(k) ?? "");
        r.run(
          () =>
            submitPrecheckinAction(code, {
              firstName: v("firstName"),
              fatherName: v("fatherName"),
              phone: v("phone"),
              email: v("email"),
              nationality: foreigner ? v("nationality") : "IR",
              documentType: (foreigner ? "passport" : "id_card") as "passport",
              documentNumber: v("documentNumber"),
              birthDate: v("birthDate"),
              address: v("address"),
              eta: v("eta"),
              requests: v("requests"),
              signature: v("signature"),
              accept: (fd.get("accept") === "on") as true,
            }),
          () => setSent(true),
        );
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <Label>{t("lastName")}</Label>
          <input value={guest.lastName} readOnly className={`${inputCls} bg-surface-2`} />
        </label>
        <label>
          <Label>{t("firstName")}</Label>
          <input
            name="firstName"
            defaultValue={guest.firstName}
            className={inputCls}
            maxLength={80}
            required
          />
        </label>
        <label>
          <Label>{t("fatherName")}</Label>
          <input
            name="fatherName"
            defaultValue={guest.fatherName ?? ""}
            className={inputCls}
            maxLength={80}
            required={iran && !foreigner}
          />
        </label>
        <label>
          <Label>{t("birthDate")}</Label>
          <DateInput name="birthDate" defaultValue={guest.birthDate ?? ""} />
        </label>
      </div>
      {iran ? (
        <fieldset className="flex gap-2 text-sm">
          <legend className="mb-1 font-semibold">{t("identity")}</legend>
          {[false, true].map((f) => (
            <label
              key={String(f)}
              className={`flex-1 cursor-pointer rounded-xl px-3 py-2 text-center font-semibold ring-1 ${foreigner === f ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={foreigner === f}
                onChange={() => setForeigner(f)}
              />
              {f ? t("foreigner") : t("iranian")}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {foreigner ? (
          <label>
            <Label>{t("nationality")}</Label>
            <input
              name="nationality"
              defaultValue={guest.nationality ?? ""}
              className={inputCls}
              maxLength={2}
              placeholder="FR"
              dir="ltr"
              required
            />
          </label>
        ) : null}
        <label className={foreigner ? "" : "sm:col-span-2"}>
          <Label>{foreigner ? t("passport") : t("nationalCode")}</Label>
          <input
            name="documentNumber"
            defaultValue={guest.documentNumber ?? ""}
            className={inputCls}
            maxLength={40}
            inputMode={foreigner ? "text" : "numeric"}
            dir="ltr"
            required
          />
        </label>
        <label>
          <Label>{t("phone")}</Label>
          <input
            name="phone"
            type="tel"
            defaultValue={guest.phone ?? ""}
            className={inputCls}
            maxLength={24}
            dir="ltr"
          />
        </label>
        <label>
          <Label>{t("email")}</Label>
          <input
            name="email"
            type="email"
            defaultValue={guest.email ?? ""}
            className={inputCls}
            maxLength={320}
            dir="ltr"
          />
        </label>
        <label className="sm:col-span-2">
          <Label>{t("address")}</Label>
          <input name="address" defaultValue={guest.address ?? ""} className={inputCls} maxLength={500} />
        </label>
        <label>
          <Label>{t("eta")}</Label>
          <input name="eta" type="time" defaultValue={eta ?? ""} className={inputCls} />
        </label>
        <label className="sm:col-span-2">
          <Label>{t("requests")}</Label>
          <textarea
            name="requests"
            className={`${inputCls} h-20 py-2`}
            maxLength={1000}
            placeholder={t("requestsHint")}
          />
        </label>
      </div>
      <label className="block">
        <Label>{t("signature")}</Label>
        <input
          name="signature"
          className={`${inputCls} font-serif italic`}
          required
          minLength={3}
          maxLength={120}
          placeholder={t("signatureHint")}
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" className="mt-0.5 size-4" required />
        {t("accept")}
      </label>
      <FormError error={r.error} />
      <Button type="submit" size="lg" className="w-full" disabled={r.pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
