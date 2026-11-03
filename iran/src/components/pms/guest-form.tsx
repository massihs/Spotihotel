"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/ui/sheet-kit";
import { saveGuestAction } from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, inputCls } from "./kit";
import { DateInput } from "@/components/ui/date-input";
import { EDITION } from "@/config/edition";

export type GuestValues = {
  id: string;
  firstName: string;
  fatherName: string | null;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  documentType: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  address: string | null;
  company: string | null;
  vip: boolean;
  preferences: string | null;
  notes: string | null;
  blacklisted: boolean;
};

/** Guest profile (registration card): identity, document, preferences, VIP / blacklist. */
export function GuestForm({
  restaurantId,
  guest,
  canEdit,
}: {
  restaurantId: string;
  guest: GuestValues;
  canEdit: boolean;
}) {
  const t = useTranslations("pms.guest");
  const r = useRun();
  const g = guest;
  const field = (
    name: keyof GuestValues,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label>
      <Label>{label}</Label>
      <input
        name={name}
        defaultValue={(g[name] as string | null) ?? ""}
        className={inputCls}
        disabled={!canEdit}
        {...props}
      />
    </label>
  );
  return (
    <form
      className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-2"
      action={(fd) => {
        const v = (k: string) => String(fd.get(k) ?? "");
        r.run(() =>
          saveGuestAction(restaurantId, g.id, {
            firstName: v("firstName"),
            fatherName: v("fatherName"),
            lastName: v("lastName"),
            email: v("email"),
            phone: v("phone"),
            nationality: v("nationality"),
            documentType: (v("documentType") || null) as "passport" | null,
            documentNumber: v("documentNumber"),
            birthDate: v("birthDate"),
            address: v("address"),
            company: v("company"),
            vip: fd.get("vip") === "on",
            preferences: v("preferences"),
            notes: v("notes"),
            blacklisted: fd.get("blacklisted") === "on",
          }),
        );
      }}
    >
      {field("lastName", t("lastName"), { required: true, maxLength: 80 })}
      {field("firstName", t("firstName"), { maxLength: 80 })}
      {field("fatherName", t("fatherName"), { maxLength: 80 })}
      {field("phone", t("phone"), { type: "tel", dir: "ltr", maxLength: 24 })}
      {field("email", t("email"), { type: "email", dir: "ltr", maxLength: 320 })}
      {field("nationality", t("nationality"), {
        maxLength: 2,
        placeholder: EDITION === "iran" ? "IR" : "FR",
        dir: "ltr",
      })}
      <label>
        <Label>{t("birthDate")}</Label>
        <DateInput name="birthDate" defaultValue={g.birthDate ?? ""} disabled={!canEdit} />
      </label>
      <label>
        <Label>{t("documentType")}</Label>
        <select
          name="documentType"
          defaultValue={g.documentType ?? ""}
          className={inputCls}
          disabled={!canEdit}
        >
          <option value="">—</option>
          {["passport", "id_card", "driving_licence"].map((d) => (
            <option key={d} value={d}>
              {t(`doc.${d}`)}
            </option>
          ))}
        </select>
      </label>
      {field("documentNumber", t("documentNumber"), { maxLength: 40, dir: "ltr" })}
      {field("company", t("company"), { maxLength: 120 })}
      {field("address", t("address"), { maxLength: 500 })}
      <label className="sm:col-span-2">
        <Label>{t("preferences")}</Label>
        <textarea
          name="preferences"
          defaultValue={g.preferences ?? ""}
          className={`${inputCls} h-20 py-2`}
          maxLength={1000}
          disabled={!canEdit}
        />
      </label>
      <label className="sm:col-span-2">
        <Label>{t("notes")}</Label>
        <textarea
          name="notes"
          defaultValue={g.notes ?? ""}
          className={`${inputCls} h-20 py-2`}
          maxLength={2000}
          disabled={!canEdit}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="vip" defaultChecked={g.vip} className="size-4" disabled={!canEdit} />{" "}
        {t("vip")}
      </label>
      <label className="flex items-center gap-2 text-sm text-danger">
        <input
          type="checkbox"
          name="blacklisted"
          defaultChecked={g.blacklisted}
          className="size-4"
          disabled={!canEdit}
        />{" "}
        {t("blacklisted")}
      </label>
      {canEdit ? (
        <div className="space-y-2 sm:col-span-2">
          <FormError error={r.error} />
          <Button type="submit" disabled={r.pending}>
            {t("save")}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
