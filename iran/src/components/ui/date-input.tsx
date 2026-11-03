"use client";

import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { EDITION } from "@/config/edition";
import { cn } from "@/lib/cn";
import { fromJalali, jalaliMonthLength, toJalali } from "@/lib/jalali-calendar";

type Props = {
  /** Form field name: a hidden input carries the Gregorian ISO day ("2026-11-03"). */
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (day: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  "aria-label"?: string;
  id?: string;
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Date field. The Iran edition shows a Persian (Jalali) calendar — weeks from Saturday, Friday
 * marked as the weekend — while the value stays a Gregorian ISO day for the server. Elsewhere it
 * is the browser's native date picker.
 */
export function DateInput(props: Props) {
  if (EDITION !== "iran") {
    const { onChange, value, ...rest } = props;
    return (
      <input
        type="date"
        {...rest}
        {...(value !== undefined ? { value } : {})}
        onChange={(e) => onChange?.(e.target.value)}
        className={cn(
          "h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-[15px]",
          props.className,
        )}
      />
    );
  }
  return <JalaliPicker {...props} />;
}

function JalaliPicker({
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  required,
  disabled,
  readOnly,
  className,
  id,
  ...aria
}: Props) {
  const locale = useLocale();
  const t = useTranslations("dateInput");
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? value : inner;
  const start = toJalali(current || todayIso());
  const [view, setView] = useState({ jy: start.jy, jm: start.jm });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cal = `${locale === "fa" ? "fa-IR" : locale}-u-ca-persian`;
  /** "سه‌شنبه ۱۲ آبان ۱۴۰۵": weekday, day, month, year — whatever order Intl would pick. */
  const label = (day: string) => {
    const parts = new Intl.DateTimeFormat(cal, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).formatToParts(new Date(`${day}T12:00:00Z`));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
  };
  const monthTitle = new Intl.DateTimeFormat(cal, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${fromJalali(view.jy, view.jm, 15)}T12:00:00Z`),
  );
  const num = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale);
  const pick = (day: string) => {
    if (value === undefined) setInner(day);
    onChange?.(day);
    setOpen(false);
  };
  const move = (delta: number) => {
    const m = view.jm - 1 + delta;
    setView({ jy: view.jy + Math.floor(m / 12), jm: (((m % 12) + 12) % 12) + 1 });
  };
  const toggle = () => {
    if (disabled || readOnly) return;
    if (!open) {
      const s = toJalali(current || todayIso());
      setView({ jy: s.jy, jm: s.jm });
    }
    setOpen(!open);
  };

  // Saturday-first grid: JS getUTCDay() 6 (Saturday) → column 0.
  const first = fromJalali(view.jy, view.jm, 1);
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 1) % 7;
  const length = jalaliMonthLength(view.jy, view.jm);
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length }, (_, i) => fromJalali(view.jy, view.jm, i + 1)),
  ];
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : locale, {
      weekday: "narrow",
      timeZone: "UTC",
    }).format(
      // 2024-01-06 is a Saturday.
      new Date(Date.UTC(2024, 0, 6 + i, 12)),
    ),
  );
  const today = todayIso();

  return (
    <div ref={box} className="relative">
      {name ? <input type="hidden" name={name} value={current} required={required} /> : null}
      <button
        type="button"
        id={id}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        aria-label={aria["aria-label"]}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-xl border border-border-strong bg-surface px-3 text-start text-[15px]",
          "focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none",
          (disabled || readOnly) && "cursor-default opacity-70",
          className,
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-fg-subtle")}>
          {current ? label(current) : t("pick")}
        </span>
        {current && !required && !readOnly ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={t("clear")}
            onClick={(e) => {
              e.stopPropagation();
              pick("");
            }}
            className="grid size-6 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
          >
            <X className="size-3.5" />
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={popId}
          role="dialog"
          aria-label={monthTitle}
          className="absolute start-0 top-12 z-50 w-72 rounded-2xl border border-border bg-surface p-3 shadow-[var(--shadow-float)]"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label={t("previous")}
              className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
            >
              <ChevronRight className="size-4 ltr:rotate-180" />
            </button>
            <p className="text-sm font-bold">{monthTitle}</p>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label={t("next")}
              className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
            >
              <ChevronLeft className="size-4 ltr:rotate-180" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {weekdays.map((w, i) => (
              <span key={i} className={cn("py-1 font-semibold text-fg-muted", i === 6 && "text-danger")}>
                {w}
              </span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={`e${i}`} />;
              const off = (min && day < min) || (max && day > max);
              const friday = i % 7 === 6;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!!off}
                  onClick={() => pick(day)}
                  aria-pressed={day === current}
                  className={cn(
                    "h-9 rounded-lg text-sm tabular-nums",
                    day === current
                      ? "bg-accent font-bold text-accent-fg"
                      : day === today
                        ? "font-bold text-accent-text ring-1 ring-accent"
                        : "hover:bg-surface-2",
                    friday && day !== current && "text-danger",
                    off && "opacity-30",
                  )}
                >
                  {num.format(toJalali(day).jd)}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2">
            <button
              type="button"
              disabled={!!((min && today < min) || (max && today > max))}
              onClick={() => pick(today)}
              className="rounded-full px-3 py-1 text-sm font-semibold text-accent-text hover:bg-accent-soft disabled:opacity-40"
            >
              {t("today")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-3 py-1 text-sm text-fg-muted hover:bg-surface-2"
            >
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
