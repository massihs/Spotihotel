"use client";

import { Copy, Download, Eye, Plus, Power, Printer, Trash2, Wifi, WifiOff, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { ActionForm, FormFeedback, SelectField, SubmitButton, useActionForm } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import {
  newAgentTokenAction,
  previewPrinterAction,
  printerCommandAction,
  savePrinterAction,
  setCashierAcceptanceAction,
} from "./actions";

export type PrinterView = {
  id: string;
  name: string;
  host: string;
  port: number;
  paperMm: number;
  target: string;
  stationId: string | null;
  copies: number;
  isActive: boolean;
  lastStatus: string | null;
  lastError: string | null;
};

function useRunner() {
  const tErr = useTranslations("errorCodes");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T,>(
    fn: () => Promise<{ ok: true; data?: T } | { ok: false; error: string } | null | undefined>,
    done?: (d?: T) => void,
  ) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok) setError(tErr.has(res.error) ? tErr(res.error) : tErr("internal"));
      else done?.(res?.data);
    });
  return { pending, error, run };
}

function PrinterForm({
  restaurantId,
  printer,
  stations,
  onDone,
}: {
  restaurantId: string;
  printer: PrinterView | null;
  stations: { id: string; name: string }[];
  onDone: () => void;
}) {
  const t = useTranslations("printers");
  const form = useActionForm(savePrinterAction.bind(null, restaurantId, printer?.id ?? null));
  const [target, setTarget] = useState(printer?.target ?? "station");
  useEffect(() => {
    if (form.state?.ok) onDone();
  }, [form.state, onDone]);
  return (
    <ActionForm
      form={form}
      className="grid gap-3 rounded-2xl border border-border bg-surface-2/50 p-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <FormFeedback state={form.state} />
      </div>
      <Field
        label={t("name")}
        name="name"
        defaultValue={printer?.name ?? ""}
        placeholder={t("namePlaceholder")}
        required
      />
      <SelectField
        label={t("target")}
        name="target"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      >
        <option value="station">{t("targets.station")}</option>
        <option value="cashier">{t("targets.cashier")}</option>
        <option value="all">{t("targets.all")}</option>
      </SelectField>
      {target === "station" ? (
        <SelectField label={t("station")} name="stationId" defaultValue={printer?.stationId ?? ""}>
          <option value="">{t("allStations")}</option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
      ) : null}
      <Field
        label={t("host")}
        name="host"
        defaultValue={printer?.host ?? ""}
        placeholder="192.168.1.50"
        dir="ltr"
        required
      />
      <Field
        label={t("port")}
        name="port"
        type="number"
        defaultValue={String(printer?.port ?? 9100)}
        dir="ltr"
      />
      <SelectField label={t("paper")} name="paperMm" defaultValue={String(printer?.paperMm ?? 80)}>
        <option value="80">80 mm</option>
        <option value="58">58 mm</option>
      </SelectField>
      <SelectField label={t("copies")} name="copies" defaultValue={String(printer?.copies ?? 1)}>
        {[1, 2, 3].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </SelectField>
      <div className="flex items-end justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("cancel")}
        </Button>
        <SubmitButton>{t("save")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Settings → Printers: till acceptance, local print agent, network printers, browser printing. */
export function PrintersPanel({
  restaurantId,
  readOnly,
  appUrl,
  data,
  stations,
}: {
  restaurantId: string;
  readOnly: boolean;
  appUrl: string;
  data: {
    printers: PrinterView[];
    pending: number;
    agentSeenAt: string | null;
    /** Server render time, for relative times that hydrate cleanly. */
    now: number;
    agentOnline: boolean;
    agentConfigured: boolean;
    cashierAcceptance: boolean;
  };
  stations: { id: string; name: string }[];
}) {
  const t = useTranslations("printers");
  const format = useFormatter();
  const { pending, error, run } = useRunner();
  const [editing, setEditing] = useState<PrinterView | "new" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const online = data.agentOnline;
  const stationName = (id: string | null) => stations.find((s) => s.id === id)?.name ?? t("allStations");
  const command = token ? `node print-agent.mjs ${appUrl} ${token}` : null;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}

      {/* 1. Flow */}
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border p-4">
        <input
          type="checkbox"
          defaultChecked={data.cashierAcceptance}
          disabled={readOnly || pending}
          onChange={(e) => run(() => setCashierAcceptanceAction(restaurantId, e.target.checked))}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="block font-semibold">{t("acceptance")}</span>
          <span className="mt-0.5 block text-sm text-fg-muted">{t("acceptanceHint")}</span>
        </span>
      </label>

      {/* 2. Agent */}
      <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-10 place-items-center rounded-xl",
                online ? "bg-success-soft text-success" : "bg-surface-2 text-fg-subtle",
              )}
              aria-hidden="true"
            >
              {online ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
            </span>
            <div>
              <p className="font-semibold">{t("agent")}</p>
              <p className="text-sm text-fg-muted">
                {online
                  ? t("agentOnline")
                  : data.agentSeenAt
                    ? t("agentSeen", { when: format.relativeTime(new Date(data.agentSeenAt), data.now) })
                    : data.agentConfigured
                      ? t("agentWaiting")
                      : t("agentNone")}
                {data.pending ? ` · ${t("pendingJobs", { n: data.pending })}` : ""}
              </p>
            </div>
          </div>
          {!readOnly ? (
            <div className="flex flex-wrap gap-2">
              <a
                href="/print-agent.mjs"
                download
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ring-1 ring-border hover:bg-surface-2"
              >
                <Download className="size-4" aria-hidden="true" />
                {t("download")}
              </a>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(
                    () => newAgentTokenAction(restaurantId),
                    (tok) => setToken(tok ?? null),
                  )
                }
              >
                {data.agentConfigured ? t("newToken") : t("connect")}
              </Button>
            </div>
          ) : null}
        </div>
        {command ? (
          <div className="mt-4 space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
            <p className="font-medium">{t("tokenOnce")}</p>
            <div className="flex items-center gap-2">
              <code
                dir="ltr"
                className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-surface px-3 py-2 text-xs whitespace-nowrap"
              >
                {command}
              </code>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  navigator.clipboard.writeText(command).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  )
                }
              >
                <Copy className="size-4" aria-hidden="true" />
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>
        ) : null}
        <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-fg-muted">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
        </ol>
      </section>

      {/* 3. Printers */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold">{t("list")}</p>
          {!readOnly && editing === null ? (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden="true" />
              {t("add")}
            </Button>
          ) : null}
        </div>
        {editing === "new" ? (
          <PrinterForm
            restaurantId={restaurantId}
            printer={null}
            stations={stations}
            onDone={() => setEditing(null)}
          />
        ) : null}
        {data.printers.length === 0 && editing === null ? (
          <p className="rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">
            {t("empty")}
          </p>
        ) : null}
        <ul className="space-y-2">
          {data.printers.map((p) =>
            editing !== "new" && editing?.id === p.id ? (
              <li key={p.id}>
                <PrinterForm
                  restaurantId={restaurantId}
                  printer={p}
                  stations={stations}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-2xl border border-border p-3",
                  !p.isActive && "opacity-60",
                )}
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text"
                  aria-hidden="true"
                >
                  <Printer className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-fg-muted">
                    {p.target === "station"
                      ? stationName(p.stationId)
                      : t(`targets.${p.target as "cashier"}`)}{" "}
                    ·{" "}
                    <span dir="ltr">
                      {p.host}:{p.port}
                    </span>{" "}
                    · {p.paperMm} mm{p.copies > 1 ? ` · ×${p.copies}` : ""}
                  </p>
                  {p.lastStatus ? (
                    <p className={cn("text-xs", p.lastStatus === "done" ? "text-success" : "text-danger")}>
                      {p.lastStatus === "done" ? t("lastOk") : t("lastFailed", { error: p.lastError ?? "" })}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => previewPrinterAction(restaurantId, p.id),
                        (d) => setPreview(d ?? null),
                      )
                    }
                  >
                    <Eye className="size-4" aria-hidden="true" />
                    {t("preview")}
                  </Button>
                  {!readOnly ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => run(() => printerCommandAction(restaurantId, p.id, "test"))}
                      >
                        {t("test")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                        {t("edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        aria-label={p.isActive ? t("disable") : t("enable")}
                        title={p.isActive ? t("disable") : t("enable")}
                        onClick={() =>
                          run(() => printerCommandAction(restaurantId, p.id, p.isActive ? "off" : "on"))
                        }
                      >
                        <Power className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        aria-label={t("delete")}
                        title={t("delete")}
                        onClick={() => run(() => printerCommandAction(restaurantId, p.id, "delete"))}
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ),
          )}
        </ul>
      </section>

      {/* 4. Browser printing */}
      <section className="rounded-2xl bg-surface-2/60 p-4 text-sm">
        <p className="font-semibold">{t("browser")}</p>
        <p className="mt-1 text-fg-muted">{t("browserHint")}</p>
        <code
          dir="ltr"
          className="mt-2 block overflow-x-auto rounded-lg bg-surface px-3 py-2 text-xs whitespace-nowrap"
        >
          chrome --kiosk-printing {appUrl}
        </code>
      </section>

      {preview ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t("preview")}
        >
          <div className="relative max-h-[90dvh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
            <button
              type="button"
              onClick={() => setPreview(null)}
              aria-label={t("cancel")}
              className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-black/5 text-black"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <img src={preview} alt={t("preview")} className="mx-auto w-72 max-w-full" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
