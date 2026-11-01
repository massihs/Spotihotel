"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  SelectField,
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
  kind?: string;
};
type PlaceKind = "table" | "room";

function TableFields({
  state,
  table,
  kind,
  hotel = false,
}: {
  state: ActionState;
  table?: TableRow;
  kind: PlaceKind;
  /** Hotels can switch a place between table and room. */
  hotel?: boolean;
}) {
  const t = useTranslations("tables");
  const err = useFieldError(state);
  return (
    <>
      {hotel ? (
        <SelectField label={t("kindLabel")} name="kind" defaultValue={kind}>
          <option value="room">{t("kindRoom")}</option>
          <option value="table">{t("kindTable")}</option>
        </SelectField>
      ) : (
        <input type="hidden" name="kind" value={kind} />
      )}
      <Field
        label={t("label")}
        name="label"
        required
        maxLength={48}
        defaultValue={table?.label}
        hint={kind === "room" ? t("roomLabelHint") : t("labelHint")}
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

function CreateTableForm({ restaurantId, kind }: { restaurantId: string; kind: PlaceKind }) {
  const t = useTranslations();
  const form = useActionForm(createTableAction.bind(null, restaurantId));
  const state = form.state;
  useCloseOnSuccess(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <TableFields state={state} kind={kind} />
      <div className="flex justify-end">
        <SubmitButton>{t("common.add")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CreateTableDialog({
  restaurantId,
  variant = "primary",
  kind = "table",
}: {
  restaurantId: string;
  variant?: "primary" | "secondary";
  kind?: PlaceKind;
}) {
  const t = useTranslations("tables");
  const title = kind === "room" ? t("addRoom") : t("add");
  return (
    <Dialog
      title={title}
      trigger={(open) => (
        <Button variant={variant} onClick={open}>
          + {title}
        </Button>
      )}
    >
      <CreateTableForm restaurantId={restaurantId} kind={kind} />
    </Dialog>
  );
}

function EditTableForm({
  restaurantId,
  table,
  hotel,
}: {
  restaurantId: string;
  table: TableRow;
  hotel?: boolean;
}) {
  const t = useTranslations();
  const form = useActionForm(updateTableAction.bind(null, restaurantId, table.id));
  const state = form.state;
  useCloseOnSuccess(state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={state} />
      <TableFields
        state={state}
        table={table}
        kind={table.kind === "room" ? "room" : "table"}
        hotel={hotel || table.kind === "room"}
      />
      <div className="flex justify-end">
        <SubmitButton>{t("common.save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EditTableDialog({
  restaurantId,
  table,
  hotel,
}: {
  restaurantId: string;
  table: TableRow;
  hotel?: boolean;
}) {
  const t = useTranslations("tables");
  const label = table.kind === "room" ? t("editRoom") : t("edit");
  return (
    <Dialog
      title={label}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          {label}
        </Button>
      )}
    >
      <EditTableForm restaurantId={restaurantId} table={table} hotel={hotel} />
    </Dialog>
  );
}

function BulkForm({
  restaurantId,
  kind,
  onDone,
}: {
  restaurantId: string;
  kind: PlaceKind;
  onDone: (msg: string) => void;
}) {
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
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-3 gap-3">
        <Field
          label={t("tables.from")}
          name="from"
          type="number"
          min={0}
          required
          defaultValue={kind === "room" ? 101 : 1}
          inputMode="numeric"
          error={err("from")}
        />
        <Field
          label={t("tables.to")}
          name="to"
          type="number"
          min={0}
          required
          defaultValue={kind === "room" ? 120 : 20}
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
        <SubmitButton>{kind === "room" ? t("tables.bulkRooms") : t("tables.bulk")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function BulkTablesDialog({
  restaurantId,
  kind = "table",
}: {
  restaurantId: string;
  kind?: PlaceKind;
}) {
  const t = useTranslations("tables");
  const [message, setMessage] = useState<string | null>(null);
  const clear = useCallback(() => setMessage(null), []);
  const title = kind === "room" ? t("bulkRooms") : t("bulk");
  return (
    <>
      <Dialog
        title={title}
        trigger={(open) => (
          <Button variant="secondary" onClick={open}>
            {title}
          </Button>
        )}
      >
        <BulkForm restaurantId={restaurantId} kind={kind} onDone={setMessage} />
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
            ? "w-full rounded-xl px-3 py-2.5 text-start text-sm font-medium text-danger hover:bg-danger-soft"
            : "w-full rounded-xl px-3 py-2.5 text-start text-sm font-medium hover:bg-surface-2"
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
