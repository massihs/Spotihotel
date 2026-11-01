"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { NUTRIENTS, REFERENCE_INTAKE, type Nutrition } from "@/lib/nutrition";
import { CalorieSetup } from "@/components/account/calorie-setup";
import {
  clearHistoryAction,
  saveCalorieTrackingAction,
  deleteAccountAction,
  logoutDinerAction,
  saveProfileAction,
} from "@/app/[locale]/account/actions";

export function LogoutButton() {
  const t = useTranslations("account");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await logoutDinerAction()))}
    >
      <LogOut className="size-4" aria-hidden="true" />
      {t("logout")}
    </Button>
  );
}

/** Name and daily goals (empty = the reference intake). */
export function ProfileForm({
  name,
  goals,
  placeholders = REFERENCE_INTAKE,
}: {
  name: string | null;
  /** Goals typed by the diner (null = calculated / reference: shown as placeholders). */
  goals: Nutrition | null;
  placeholders?: Nutrition;
}) {
  const t = useTranslations("account");
  const tn = useTranslations("nutrition");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState<"ok" | "error" | null>(null);
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const g: Nutrition = {};
        for (const k of NUTRIENTS) {
          const v = String(fd.get(k) ?? "").trim();
          if (v !== "") g[k] = Number(v.replace(",", "."));
        }
        start(async () => {
          const res = await saveProfileAction({ name: String(fd.get("name") ?? ""), goals: g });
          setSaved(res?.ok ? "ok" : "error");
        });
      }}
      onInput={() => setSaved(null)}
    >
      <Field
        label={t("name")}
        name="name"
        defaultValue={name ?? ""}
        maxLength={80}
        autoComplete="given-name"
      />
      <fieldset>
        <legend className="text-sm font-semibold">{t("goalsTitle")}</legend>
        <p className="mb-3 text-sm text-fg-muted">{t("goalsHint")}</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {NUTRIENTS.map((k) => (
            <Field
              key={k}
              label={tn(`field.${k}`)}
              name={k}
              type="number"
              min={0}
              step={k === "kcal" ? 50 : 0.1}
              inputMode="decimal"
              placeholder={String(placeholders[k] ?? REFERENCE_INTAKE[k])}
              defaultValue={goals?.[k] ?? ""}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        {saved === "ok" ? <span className="text-sm font-medium text-success">{t("saved")}</span> : null}
        {saved === "error" ? <span className="text-sm text-danger">{t("errors.validation")}</span> : null}
      </div>
    </form>
  );
}

export function PrivacyActions() {
  const t = useTranslations("account");
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">{t("clearHint")}</p>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(t("clearConfirm"))) return;
            start(async () => {
              const res = await clearHistoryAction();
              setDone(Boolean(res?.ok));
            });
          }}
        >
          {t("clear")}
        </Button>
      </div>
      {done ? <p className="text-sm font-medium text-success">{t("cleared")}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">{t("deleteHint")}</p>
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => start(async () => void (await deleteAccountAction("DELETE")))}
            >
              {t("deleteConfirm")}
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
            {t("delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Body profile and daily needs, or turn calorie counting off. */
export function CaloriesPanel({
  tracking,
  initial,
}: {
  tracking: boolean;
  initial: Parameters<typeof CalorieSetup>[0]["initial"];
}) {
  const t = useTranslations("calories");
  const [pending, start] = useTransition();
  return (
    <div className="space-y-5">
      <CalorieSetup initial={initial} ask={false} />
      {tracking ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="min-w-0 flex-1 text-sm text-fg-muted">{t("offHint")}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => start(async () => void (await saveCalorieTrackingAction({ track: false })))}
          >
            {t("turnOff")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
