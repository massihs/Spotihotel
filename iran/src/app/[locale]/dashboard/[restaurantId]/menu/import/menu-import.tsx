"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { applyImportAction, previewImportAction } from "./actions";

type Preview = {
  rows: {
    line: number;
    category: string;
    name: string;
    priceCents: number | null;
    description: string | null;
    error: string | null;
    duplicate: boolean;
  }[];
  newCategories: string[];
};

/** Pick a file → preview every line → import. */
export function MenuImport({ restaurantId, currency }: { restaurantId: string; currency: string }) {
  const t = useTranslations("menuImport");
  const te = useTranslations();
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ created: number; skipped: number; newCategories: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fail = (code: string) =>
    setError(te.has(`errorCodes.${code}`) ? te(`errorCodes.${code}`) : te("errorCodes.internal"));
  const form = () => {
    const fd = new FormData();
    fd.set("file", file!);
    return fd;
  };

  const template = () => {
    const rows = [
      [t("colCategory"), t("colName"), t("colPrice"), t("colDescription")],
      [t("sampleCategory"), t("sampleName"), t("samplePrice"), t("sampleDescription")],
    ];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "spotifood-menu.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const ok = preview?.rows.filter((r) => !r.error && !r.duplicate).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border-2 border-dashed border-border bg-surface p-6 text-center">
        <FileSpreadsheet className="mx-auto size-10 text-accent" aria-hidden="true" />
        <p className="mt-3 font-semibold">{t("pick")}</p>
        <p className="mt-1 text-sm text-fg-muted">{t("pickHint")}</p>
        <input
          ref={input}
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0] ?? null;
            setFile(f);
            setPreview(null);
            setDone(null);
            setError(null);
            if (!f) return;
            const fd = new FormData();
            fd.set("file", f);
            startTransition(async () => {
              const res = await previewImportAction(restaurantId, fd);
              if (res?.ok && res.data) setPreview(res.data);
              else fail(res?.ok === false ? res.error : "internal");
            });
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button disabled={pending} onClick={() => input.current?.click()}>
            {file ? t("another") : t("choose")}
          </Button>
          <Button variant="secondary" onClick={template}>
            <Download className="size-4" aria-hidden="true" />
            {t("template")}
          </Button>
        </div>
        {file ? (
          <p className="mt-3 text-xs text-fg-muted" dir="ltr">
            {file.name}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {done ? (
        <div role="status" className="rounded-2xl bg-success-soft p-4 text-sm text-success">
          <p className="font-semibold">
            {t("done", { created: done.created, categories: done.newCategories })}
          </p>
          {done.skipped ? <p>{t("skipped", { count: done.skipped })}</p> : null}
          <Link
            href={`/dashboard/${restaurantId}/menu`}
            className={cn(buttonClasses("secondary", "sm"), "mt-3")}
          >
            {t("toMenu")}
          </Link>
        </div>
      ) : preview ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <p>
              {t("summary", { ok, total: preview.rows.length })}
              {preview.newCategories.length ? (
                <span className="text-fg-muted">
                  {" "}
                  · {t("newCategories", { list: preview.newCategories.join("، ") })}
                </span>
              ) : null}
            </p>
            <Button
              disabled={pending || ok === 0}
              onClick={() =>
                startTransition(async () => {
                  const res = await applyImportAction(restaurantId, form());
                  if (res?.ok && res.data) setDone(res.data);
                  else fail(res?.ok === false ? res.error : "internal");
                })
              }
            >
              {t("import", { count: ok })}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-fg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">#</th>
                  <th className="px-3 py-2 text-start font-medium">{t("colCategory")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("colName")}</th>
                  <th className="px-3 py-2 text-end font-medium">{t("colPrice")}</th>
                  <th className="px-3 py-2 text-start font-medium">{t("status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((r) => (
                  <tr
                    key={r.line}
                    className={cn(r.error && "bg-danger-soft/40", r.duplicate && "text-fg-muted")}
                  >
                    <td className="px-3 py-2 text-fg-subtle tabular-nums">{r.line}</td>
                    <td className="px-3 py-2">{r.category}</td>
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {r.priceCents != null ? formatMoney(r.priceCents, currency, locale) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {r.error ? (
                        <span className="text-danger">{t(`errors.${r.error}`)}</span>
                      ) : r.duplicate ? (
                        t("duplicate")
                      ) : (
                        <span className="text-success">✓</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
