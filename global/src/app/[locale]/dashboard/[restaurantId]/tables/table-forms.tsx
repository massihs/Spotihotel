"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  FormFeedback,
  SubmitButton,
  useCloseOnSuccess,
  useFieldError,
  type ActionState,
  ActionForm,
  useActionForm,
} from "@/components/ui/form";
import { bulkCreateTablesAction, createTableAction, tableCommandAction, updateTableAction } from "./actions";

type TableRow = {
  id: string;
  label: string;
  number: number | null;
  capacity: number | null;
  zone: string | null;
};

function TableFields({ state, table }: { state: ActionState; table?: TableRow }) {
  const t = useTranslations("tables");
  const err = useFieldError(state);
  return (
    <>
      <Field
        label={t("label")}
        name="label"
        required
        maxLength={48}
        defaultValue={table?.label}
        hint={t("labelHint")}
        error={err("label")}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("capacity")}
          name="capacity"
          type="number"
          min={1}
          max={100}
          inputMode="numeric"
          defaultValue={table?.capacity ?? ""}
          error={err("capacity")}
        />
        <Field
          label={t("zone")}
          name="zone"
          maxLength={64}
          defaultValue={table?.zone ?? ""}
          hint={t("zoneHint")}
          error={err("zone")}
        />
      </div>
      {table ? (
        <Field
          label={t("number")}
          name="number"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={table.number ?? ""}
          error={err("number")}
        />
      ) : null}
    </>
  );
}

function CreateTableForm({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations();
  const form = useActionForm(createTableAction.bind(null, restaurantId));
  const state = form.state;
  useCloseOnSuccess(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <TableFields state={state} />
      <div className="flex justify-end">
        <SubmitButton>{t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CreateTableDialog({
  restaurantId,
  variant = "primary",
}: {
  restaurantId: string;
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations("tables");
  return (
    <Dialog
      title={t("add")}
      trigger={(open) => (
        <Button variant={variant} onClick={open}>
          + {t("add")}
        </Button>
      )}
    >
      <CreateTableForm restaurantId={restaurantId} />
    </Dialog>
  );
}

function EditTableForm({ restaurantId, table }: { restaurantId: string; table: TableRow }) {
  const t = useTranslations();
  const form = useActionForm(updateTableAction.bind(null, restaurantId, table.id));
  const state = form.state;
  useCloseOnSuccess(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <TableFields state={state} table={table} />
      <div className="flex justify-end">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditTableDialog({ restaurantId, table }: { restaurantId: string; table: TableRow }) {
  const t = useTranslations("tables");
  return (
    <Dialog
      title={t("edit")}
      trigger={(open) => (
        <Button variant="secondary" size="sm" onClick={open}>
          {t("edit")}
        </Button>
      )}
    >
      <EditTableForm restaurantId={restaurantId} table={table} />
    </Dialog>
  );
}

function BulkForm({ restaurantId, onDone }: { restaurantId: string; onDone: (msg: string) => void }) {
  const t = useTranslations();
  const form = useActionForm(async (prev: unknown, fd: FormData) => {
    const res = await bulkCreateTablesAction(restaurantId, prev, fd);
    if (res?.ok && res.data) onDone(t("tables.bulkResult", res.data));
    return res;
  });
  const state = form.state;
  useCloseOnSuccess(state);
  const err = useFieldError(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={t("tables.from")}
          name="from"
          type="number"
          min={0}
          required
          defaultValue={1}
          inputMode="numeric"
          error={err("from")}
        />
        <Field
          label={t("tables.to")}
          name="to"
          type="number"
          min={0}
          required
          defaultValue={20}
          inputMode="numeric"
          error={err("to")}
        />
        <Field
          label={t("tables.prefix")}
          name="prefix"
          maxLength={24}
          placeholder="T"
          error={err("prefix")}
        />
      </div>
      <p className="-mt-2 text-sm text-fg-muted">{t("tables.prefixHint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("tables.capacity")}
          name="capacity"
          type="number"
          min={1}
          max={100}
          inputMode="numeric"
        />
        <Field label={t("tables.zone")} name="zone" maxLength={64} hint={t("tables.zoneHint")} />
      </div>
      <div className="flex justify-end">
        <SubmitButton>{t("tables.bulk")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BulkTablesDialog({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("tables");
  const [message, setMessage] = useState<string | null>(null);
  const clear = useCallback(() => setMessage(null), []);
  return (
    <>
      <Dialog
        title={t("bulk")}
        trigger={(open) => (
          <Button variant="secondary" onClick={open}>
            {t("bulk")}
          </Button>
        )}
      >
        <BulkForm restaurantId={restaurantId} onDone={setMessage} />
      </Dialog>
      <Toast message={message} onDone={clear} />
    </>
  );
}

/** Regenerate / enable / disable / delete, with confirmation for destructive commands. */
export function TableCommand({
  restaurantId,
  tableId,
  command,
  confirm,
  children,
  danger,
}: {
  restaurantId: string;
  tableId: string;
  command: "regenerate" | "enable" | "disable" | "delete";
  confirm?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const t = useTranslations("errorCodes");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => {
        const res = await tableCommandAction(restaurantId, fd);
        setError(res && !res.ok ? (t.has(res.error) ? t(res.error) : t("internal")) : null);
      }}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="tableId" value={tableId} />
      <input type="hidden" name="command" value={command} />
      <button
        type="submit"
        className={
          danger
            ? "w-full rounded-lg px-3 py-2 text-start text-sm text-danger hover:bg-danger-soft"
            : "w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2"
        }
      >
        {children}
      </button>
      {error ? (
        <p role="alert" className="px-3 pb-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}
