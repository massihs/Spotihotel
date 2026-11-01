"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  FormFeedback,
  SubmitButton,
  useActionForm,
  useCloseOnSuccess,
  useFieldError,
} from "@/components/ui/form";
import { centsToInput, formatMoney } from "@/lib/money";
import { deleteOptionGroupAction, saveOptionGroupAction } from "../actions";

export type GroupView = {
  id: string;
  name: string;
  description: string | null;
  minSelect: number;
  maxSelect: number;
  usage: number;
  values: { id: string; name: string; priceDeltaCents: number; isDefault: boolean; isAvailable: boolean }[];
};

type Row = {
  key: string;
  id?: string;
  name: string;
  delta: string;
  isDefault: boolean;
  isAvailable: boolean;
};

let rowSeq = 0;
const newKey = () => `row-${++rowSeq}`;

function GroupForm({
  restaurantId,
  group,
  currency,
}: {
  restaurantId: string;
  group?: GroupView;
  currency: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const form = useActionForm(saveOptionGroupAction.bind(null, restaurantId, group?.id ?? null));
  useCloseOnSuccess(form.state);
  const err = useFieldError(form.state);
  const [rows, setRows] = useState<Row[]>(() =>
    group?.values.length
      ? group.values.map((v) => ({
          key: newKey(),
          id: v.id,
          name: v.name,
          delta: v.priceDeltaCents ? centsToInput(v.priceDeltaCents, locale, currency) : "",
          isDefault: v.isDefault,
          isAvailable: v.isAvailable,
        }))
      : [{ key: newKey(), name: "", delta: "", isDefault: false, isAvailable: true }],
  );
  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <ActionForm form={form} className="space-y-5">
      <FormFeedback state={form.state} />
      <Field
        label={t("options.name")}
        name="name"
        required
        maxLength={80}
        defaultValue={group?.name}
        hint={t("options.nameHint")}
        error={err("name")}
        autoFocus
      />
      <Field
        label={t("options.description")}
        name="description"
        maxLength={300}
        defaultValue={group?.description ?? ""}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("options.min")}
          name="minSelect"
          type="number"
          min={0}
          max={20}
          required
          defaultValue={group?.minSelect ?? 0}
          error={err("minSelect")}
        />
        <Field
          label={t("options.max")}
          name="maxSelect"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={group?.maxSelect ?? 1}
          error={err("maxSelect")}
        />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("options.values")}</legend>
        {err("values") ? <p className="mb-2 text-sm text-danger">{err("values")}</p> : null}
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2"
            >
              <input type="hidden" name="values.key" value={r.key} />
              <input type="hidden" name="values.id" value={r.id ?? ""} />
              <input
                name="values.name"
                value={r.name}
                onChange={(e) => update(r.key, { name: e.target.value })}
                placeholder={t("options.valueName")}
                aria-label={`${t("options.valueName")} ${i + 1}`}
                maxLength={80}
                className="h-10 min-w-36 flex-1 rounded-lg border border-border bg-surface px-3 text-sm"
              />
              <input
                name="values.delta"
                value={r.delta}
                onChange={(e) => update(r.key, { delta: e.target.value })}
                placeholder={`+ 0,00`}
                inputMode="decimal"
                aria-label={`${t("options.delta")} ${i + 1}`}
                aria-invalid={err(`values.${i}.priceDeltaCents`) ? true : undefined}
                className="h-10 w-24 rounded-lg border border-border bg-surface px-3 text-sm aria-invalid:border-danger"
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  name="values.default"
                  value={r.key}
                  checked={r.isDefault}
                  onChange={(e) => update(r.key, { isDefault: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                {t("options.default")}
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={r.isAvailable}
                  onChange={(e) => update(r.key, { isAvailable: e.target.checked })}
                  className="accent-[var(--accent)]"
                />
                {t("options.valueAvailable")}
              </label>
              {!r.isAvailable ? <input type="hidden" name="values.unavailable" value={r.key} /> : null}
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="ms-auto rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger-soft"
                disabled={rows.length === 1}
              >
                {t("options.removeValue")}
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() =>
            setRows((rs) => [
              ...rs,
              { key: newKey(), name: "", delta: "", isDefault: false, isAvailable: true },
            ])
          }
        >
          + {t("options.addValue")}
        </Button>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function NewGroupDialog({ restaurantId, currency }: { restaurantId: string; currency: string }) {
  const t = useTranslations("options");
  return (
    <Dialog size="lg" title={t("add")} trigger={(open) => <Button onClick={open}>+ {t("add")}</Button>}>
      <GroupForm restaurantId={restaurantId} currency={currency} />
    </Dialog>
  );
}

export function GroupCard({
  restaurantId,
  group,
  currency,
  canManage,
}: {
  restaurantId: string;
  group: GroupView;
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="flex h-full flex-col">
      <div className="flex-1 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{group.name}</h2>
            <p className="text-sm text-fg-muted">
              {t("options.rule", { min: group.minSelect, max: group.maxSelect })}
            </p>
          </div>
          <span className="text-xs text-fg-subtle">{t("options.usage", { count: group.usage })}</span>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm">
          {group.values.map((v) => (
            <li key={v.id} className="flex justify-between gap-2">
              <span className={v.isAvailable ? "" : "text-fg-subtle line-through"}>
                {v.name}
                {v.isDefault ? (
                  <span className="ms-1.5 text-xs text-accent-text">· {t("options.default")}</span>
                ) : null}
              </span>
              <span className="text-fg-muted tabular-nums">
                {v.priceDeltaCents
                  ? `+${formatMoney(v.priceDeltaCents, currency, locale)}`
                  : t("options.free")}
              </span>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex justify-between gap-2 border-t border-border px-4 py-3">
          <Dialog
            size="lg"
            title={t("options.edit")}
            trigger={(open) => (
              <Button variant="secondary" size="sm" onClick={open}>
                {t("common.edit")}
              </Button>
            )}
          >
            <GroupForm restaurantId={restaurantId} group={group} currency={currency} />
          </Dialog>
          <form
            action={async () => {
              const res = await deleteOptionGroupAction(restaurantId, group.id);
              if (res && !res.ok)
                setError(
                  t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"),
                );
            }}
            onSubmit={(e) => {
              if (!window.confirm(t("options.deleteConfirm", { name: group.name }))) e.preventDefault();
            }}
          >
            <SubmitButton variant="ghost" className="h-8 text-danger hover:bg-danger-soft hover:text-danger">
              {t("common.delete")}
            </SubmitButton>
          </form>
        </div>
      ) : null}
    </Card>
  );
}
