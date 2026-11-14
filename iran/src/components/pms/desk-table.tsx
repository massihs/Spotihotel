import { FileDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { LinkPending } from "@/components/ui/link-pending";
import { getMoney } from "@/lib/money-server";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";
import type { Cell, Table } from "@/server/modules/pms/desk-reports";

/**
 * The front office's tables (reservations, cashier, reports): one look, one print layout and the
 * same CSV export for all of them.
 */

/** Pills linking to the tabs of a page (`?tab=`), the current one filled. */
export async function DeskTabs({
  base,
  tabs,
  current,
  ns,
}: {
  base: string;
  tabs: readonly string[];
  current: string;
  ns: string;
}) {
  const t = await getTranslations(ns);
  return (
    <nav className="seg mb-5 print:hidden" aria-label={t("title")}>
      {tabs.map((x) => (
        <Link
          key={x}
          href={`${base}?tab=${x}`}
          aria-current={x === current ? "page" : undefined}
          className="seg-item"
        >
          {t(`tabs.${x}`)}
          <LinkPending />
        </Link>
      ))}
    </nav>
  );
}

/** From / to (Persian calendar in Iran), an optional search and an optional choice, as a GET form. */
export async function PeriodForm({
  base,
  tab,
  from,
  to,
  q,
  search = false,
  period = true,
  choice,
}: {
  base: string;
  tab: string;
  from?: string;
  to?: string;
  q?: string;
  search?: boolean;
  period?: boolean;
  choice?: { name: string; value: string; options: { value: string; label: string }[] };
}) {
  const t = await getTranslations("deskReports");
  const locale = await getLocale();
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)] print:hidden"
      action={`${prefix}${base}`}
    >
      <input type="hidden" name="tab" value={tab} />
      {period ? (
        <>
          <label className="w-40 text-sm">
            <span className="mb-1 block text-fg-muted">{t("from")}</span>
            <DateInput name="from" defaultValue={from} />
          </label>
          <label className="w-40 text-sm">
            <span className="mb-1 block text-fg-muted">{t("to")}</span>
            <DateInput name="to" defaultValue={to} />
          </label>
        </>
      ) : null}
      {choice ? (
        <label className="text-sm">
          <span className="mb-1 block text-fg-muted">{t(`choice.${choice.name}`)}</span>
          <select
            name={choice.name}
            defaultValue={choice.value}
            className="h-11 rounded-xl border border-border-strong bg-surface px-3"
          >
            {choice.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {search ? (
        <label className="min-w-48 flex-1 text-sm">
          <span className="mb-1 block text-fg-muted">{t("search")}</span>
          <input
            name="q"
            defaultValue={q}
            placeholder={t("searchHint")}
            className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3"
          />
        </label>
      ) : null}
      <button type="submit" className={buttonClasses("primary", "md")}>
        {t("show")}
      </button>
    </form>
  );
}

/** CSV of the table on screen (same filters) and the browser's print. */
export async function DeskActions({ csv }: { csv?: string }) {
  const t = await getTranslations("deskReports");
  const locale = await getLocale();
  const prefix = locale === DEFAULT_LOCALE ? "" : `/${locale}`;
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {csv ? (
        <a href={`${prefix}${csv}`} className={buttonClasses("secondary", "md")}>
          <FileDown className="size-4" aria-hidden="true" />
          {t("csv")}
        </a>
      ) : null}
      <PrintButton label={t("print")} />
    </div>
  );
}

/** Formats a cell for reading (money in the hotel's currency, days in the local calendar). */
export async function cellFormatter(currency: string, timeZone = "UTC") {
  const [slowMoney, locale, t] = await Promise.all([getMoney(currency), getLocale(), getTranslations()]);
  // Thousands of cells: one number format for all of them (Toman: the label after the figure).
  const toman = currency === "IRR";
  const tomanFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const tomanLabel = slowMoney(1000).replace(/^[^\s]+\s?/, "");
  const money = toman ? (c: number) => `${tomanFmt.format(Math.round(c / 1000))} ${tomanLabel}` : slowMoney;
  const codes = new Map<string, string>();
  const dayFmt = new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
  const n = new Intl.NumberFormat(locale);
  const stampFmt = new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
  const plain = new Intl.NumberFormat(locale, { useGrouping: false });
  return (type: string, value: Cell, ns?: string) => {
    if (value === null || value === "") return "—";
    switch (type) {
      case "money":
        return money(Number(value));
      case "int":
        return n.format(Number(value));
      case "datetime":
        return stampFmt.format(new Date(String(value)));
      case "ref":
        return plain.format(Number(value));
      case "pct":
        return `${n.format(Number(value))}%`;
      case "day":
        return /^\d{4}-\d{2}-\d{2}$/.test(String(value))
          ? dayFmt.format(new Date(`${value}T12:00:00Z`))
          : String(value);
      case "code": {
        const key = `${ns}.${value}`;
        let label = codes.get(key);
        if (label === undefined) {
          label = ns && t.has(key as never) ? t(key as never) : String(value);
          codes.set(key, label);
        }
        return label;
      }
      default:
        return String(value);
    }
  };
}

/** The table itself, with a totals row; `links` turns a column into links (e.g. to the stay). */
export async function DeskTable({
  table,
  currency,
  links,
  empty,
  limit = 400,
  allHref,
  timeZone,
}: {
  table: Table;
  currency: string;
  /** The hotel's time zone, for date-and-time columns. */
  timeZone?: string;
  links?: Record<string, (row: Record<string, Cell>) => string | null>;
  empty?: string;
  /** Rows drawn on screen (the totals and the CSV always cover them all). */
  limit?: number;
  /** The same page with every row (shown when rows were left out). */
  allHref?: string;
}) {
  const [t, fmt] = await Promise.all([getTranslations("deskReports"), cellFormatter(currency, timeZone)]);
  const end = (type: string) => ["money", "int", "pct"].includes(type);
  const head = (key: string, ns?: string) => {
    if (t.has(`cols.${key}` as never)) return t(`cols.${key}` as never);
    return ns ? fmt("code", key, ns) : key;
  };
  if (!table.rows.length)
    return <Card className="p-10 text-center text-sm text-fg-muted">{empty ?? t("empty")}</Card>;
  const shown = table.rows.length > limit ? table.rows.slice(0, limit) : table.rows;
  return (
    <>
      {shown.length < table.rows.length ? (
        <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-warning-soft px-4 py-2.5 text-sm text-warning print:hidden">
          {t("truncated", { shown: shown.length, total: table.rows.length })}
          {allHref ? (
            <Link href={allHref} className="font-semibold underline">
              {t("showAll")}
            </Link>
          ) : null}
        </p>
      ) : null}
      <Card className="overflow-x-auto print:overflow-visible print:border-0 print:shadow-none">
        <table className="w-full text-sm">
          <thead className="shade-head sticky top-0 border-b border-border text-xs text-fg-muted">
            <tr>
              {table.cols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 font-medium whitespace-nowrap",
                    end(c.type) ? "text-end" : "text-start",
                  )}
                >
                  {head(c.key, c.type === "money" ? c.ns : undefined)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {shown.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-surface-2/60">
                {table.cols.map((c) => {
                  const text = fmt(c.type, row[c.key] ?? null, c.ns);
                  const href = links?.[c.key]?.(row);
                  const neg = c.type === "money" && Number(row[c.key]) < 0;
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        "px-3 py-2 whitespace-nowrap",
                        end(c.type) && "text-end",
                        neg && "text-success",
                        c.key === "difference" && Number(row[c.key]) < 0 && "font-semibold text-danger",
                      )}
                    >
                      {href ? (
                        <Link href={href} className="font-semibold text-accent-text hover:underline">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {table.totals ? (
            <tfoot className="border-t-2 border-border-strong bg-surface-2/70 font-semibold tabular-nums">
              <tr>
                {table.cols.map((c, i) => {
                  const v = table.totals![c.key];
                  return (
                    <td
                      key={c.key}
                      className={cn("px-3 py-2.5 whitespace-nowrap", end(c.type) && "text-end")}
                    >
                      {i === 0
                        ? `${t("total")} (${table.rows.length})`
                        : v === undefined || v === null || !end(c.type)
                          ? ""
                          : fmt(c.type, v, c.ns)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </Card>
    </>
  );
}

/** Label / value rows in a card (the comprehensive report, the shift summary…). */
export function KeyValues({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="divide-y divide-border text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 py-1.5">
            <dt className="text-fg-muted">{k}</dt>
            <dd className="font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** CSV text of a table (labels and codes translated, amounts in the hotel's major unit). */
export async function tableCsv(table: Table, currency: string) {
  const t = await getTranslations();
  const factor = currency === "IRR" ? 100 : 100;
  const cell = (v: Cell) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const label = (key: string, ns?: string) =>
    t.has(`deskReports.cols.${key}` as never)
      ? t(`deskReports.cols.${key}` as never)
      : ns && t.has(`${ns}.${key}` as never)
        ? t(`${ns}.${key}` as never)
        : key;
  const value = (type: string, v: Cell, ns?: string) =>
    v === null || v === undefined
      ? ""
      : type === "money"
        ? Math.round(Number(v) / factor)
        : type === "code" && ns && t.has(`${ns}.${v}` as never)
          ? t(`${ns}.${v}` as never)
          : v;
  const lines = [
    table.cols.map((c) => label(c.key, c.type === "money" ? c.ns : undefined)),
    ...table.rows.map((r) => table.cols.map((c) => value(c.type, r[c.key] ?? null, c.ns))),
  ];
  if (table.totals)
    lines.push(
      table.cols.map((c, i) =>
        i === 0 ? t("deskReports.total") : value(c.type, table.totals![c.key] ?? null, c.ns),
      ),
    );
  return "﻿" + lines.map((l) => l.map((x) => cell(x as Cell)).join(",")).join("\n");
}
