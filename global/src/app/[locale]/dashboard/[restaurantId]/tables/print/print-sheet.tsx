"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type CardData = { id: string; label: string; zone: string | null; enabled: boolean; qr: string };

export function PrintSheet({
  restaurantId,
  restaurantName,
  logo,
  cards,
  initialSelection,
  labels,
}: {
  restaurantId: string;
  restaurantName: string;
  logo: string | null;
  cards: CardData[];
  initialSelection: string[] | null;
  labels: { title: string; subtitle: string; table: string; scan: string; scanSub: string };
}) {
  const t = useTranslations();
  const printable = useMemo(() => cards.filter((c) => c.enabled), [cards]);
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        (initialSelection ?? printable.map((c) => c.id)).filter((id) => printable.some((c) => c.id === id)),
      ),
  );
  const [size, setSize] = useState<"large" | "small">("large");
  const chosen = printable.filter((c) => selected.has(c.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <style>{`@page { size: A4; margin: 8mm; }`}</style>
      <div className="print:hidden">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/dashboard/${restaurantId}/tables`} className="text-sm text-fg-muted hover:text-fg">
              ← {t("print.back")}
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{labels.title}</h1>
            <p className="mt-1 max-w-2xl text-fg-muted">{labels.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-fg-muted">{t("print.format")}</span>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as "large" | "small")}
                className="h-10 rounded-xl border border-border bg-surface px-3 text-sm"
              >
                <option value="large">{t("print.large")}</option>
                <option value="small">{t("print.small")}</option>
              </select>
            </label>
            <Button onClick={() => window.print()} disabled={chosen.length === 0}>
              {t("print.print")}
            </Button>
          </div>
        </div>

        <Card className="mb-8 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium" aria-live="polite">
              {t("print.selected", { count: chosen.length })}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className={buttonClasses("ghost", "sm")}
                onClick={() => setSelected(new Set(printable.map((c) => c.id)))}
              >
                {t("common.selectAll")}
              </button>
              <button
                type="button"
                className={buttonClasses("ghost", "sm")}
                onClick={() => setSelected(new Set())}
              >
                {t("common.selectNone")}
              </button>
            </div>
          </div>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">{labels.title}</legend>
            {cards.map((c) => (
              <label
                key={c.id}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-lg border px-3 text-sm",
                  !c.enabled
                    ? "cursor-not-allowed border-dashed border-border text-fg-subtle"
                    : "cursor-pointer",
                  c.enabled && selected.has(c.id) ? "border-accent bg-accent-soft" : "border-border",
                )}
                title={!c.enabled ? t("print.qrDisabledNote") : undefined}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={c.enabled && selected.has(c.id)}
                  disabled={!c.enabled}
                  onChange={() => toggle(c.id)}
                />
                {c.label}
              </label>
            ))}
          </fieldset>
        </Card>
      </div>

      {/* Printable sheet. On screen it is a preview; on paper only this remains. */}
      <div
        className={cn(
          "grid justify-center gap-4 print:gap-[6mm]",
          size === "large" ? "grid-cols-[repeat(auto-fill,95mm)]" : "grid-cols-[repeat(auto-fill,62mm)]",
          size === "large" ? "print:grid-cols-[95mm_95mm]" : "print:grid-cols-[62mm_62mm_62mm]",
        )}
      >
        {chosen.map((c) => (
          <article
            key={c.id}
            className={cn(
              "flex break-inside-avoid flex-col items-center justify-between rounded-[5mm] border border-neutral-300 bg-white text-center text-neutral-900 print:border-neutral-400",
              size === "large" ? "h-[136mm] w-[95mm] p-[8mm]" : "h-[89mm] w-[62mm] p-[5mm]",
            )}
          >
            <header className="flex flex-col items-center">
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  className={
                    size === "large" ? "h-[16mm] w-auto object-contain" : "h-[10mm] w-auto object-contain"
                  }
                />
              ) : null}
              <p
                className={cn(
                  "font-semibold tracking-tight",
                  size === "large" ? "mt-[3mm] text-[15pt]" : "mt-[2mm] text-[10pt]",
                )}
              >
                {restaurantName}
              </p>
            </header>
            <div className="flex flex-col items-center">
              <p
                className={cn(
                  "font-medium tracking-[0.3em] text-neutral-500",
                  size === "large" ? "text-[9pt]" : "text-[7pt]",
                )}
              >
                {labels.table}
              </p>
              <p
                className={cn(
                  "leading-none font-bold tracking-tight",
                  size === "large" ? "text-[30pt]" : "text-[20pt]",
                )}
              >
                {c.label}
              </p>
            </div>
            <img
              src={c.qr}
              alt={`QR ${labels.table} ${c.label}`}
              className={size === "large" ? "size-[55mm]" : "size-[36mm]"}
            />
            <footer>
              <p className={cn("font-semibold", size === "large" ? "text-[13pt]" : "text-[9pt]")}>
                {labels.scan}
              </p>
              <p className={cn("text-neutral-500", size === "large" ? "text-[8pt]" : "text-[6.5pt]")}>
                {labels.scanSub}
              </p>
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
