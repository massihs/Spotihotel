"use client";

import {
  Archive,
  CakeSlice,
  Coffee,
  LayoutGrid,
  MapPin,
  Clock,
  Plus,
  Sofa,
  SquareMenu,
  UtensilsCrossed,
  Waves,
  Wine,
  Calculator,
  Pencil,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, useRun } from "@/components/ui/sheet-kit";
import { FormError, Label, inputCls } from "@/components/pms/kit";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import {
  addOutletTablesAction,
  archiveOutletAction,
  createOutletAction,
  setOutletMenuAction,
  updateOutletAction,
} from "@/app/[locale]/dashboard/[restaurantId]/outlets/actions";

export const KINDS = ["restaurant", "cafe", "bar", "lounge", "pool_bar", "pastry"] as const;
type Kind = (typeof KINDS)[number];

export const KIND_ICON: Record<string, typeof Coffee> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Wine,
  lounge: Sofa,
  pool_bar: Waves,
  pastry: CakeSlice,
};
/** Tile tint per kind: shades of the hotel's colour. */
const KIND_TILE: Record<string, string> = {
  restaurant: "bg-brand-100 text-brand-700",
  cafe: "bg-tone-amber/20 text-tone-orange",
  bar: "bg-tone-violet/15 text-tone-violet",
  lounge: "bg-brand-200 text-brand-800",
  pool_bar: "bg-tone-sky/15 text-tone-sky",
  pastry: "bg-tone-rose/15 text-tone-rose",
};

export type OutletView = {
  id: string;
  name: string;
  kind: string;
  location: string | null;
  hours: string | null;
  roomService: boolean;
  tables: number;
  openTables: number;
  categories: number;
  ordersToday: number;
  salesToday: string;
};

/** One click: a typical outlet with its tables, renamed afterwards if needed. */
export function QuickAdd({
  restaurantId,
  presets,
}: {
  restaurantId: string;
  presets: { kind: Kind; name: string; tables: number }[];
}) {
  const t = useTranslations("outlets");
  const r = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-fg-muted">{t("quickAdd")}</span>
      {presets.map((p) => {
        const Icon = KIND_ICON[p.kind] ?? UtensilsCrossed;
        return (
          <button
            key={p.kind}
            type="button"
            disabled={r.pending}
            onClick={() =>
              r.run(() => createOutletAction(restaurantId, { name: p.name, kind: p.kind, tables: p.tables }))
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-surface px-3 text-sm font-semibold ring-1 ring-border transition-colors ring-inset hover:bg-brand-50 hover:ring-brand-200 disabled:opacity-50"
          >
            <span className={cn("grid size-6 place-items-center rounded-md", KIND_TILE[p.kind])}>
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            {p.name}
            <span className="text-xs font-medium text-fg-subtle">{t("tablesN", { n: p.tables })}</span>
          </button>
        );
      })}
      {r.error ? (
        <span role="alert" className="text-xs text-danger">
          {r.error}
        </span>
      ) : null}
    </div>
  );
}

function OutletFields({ values }: { values?: Partial<OutletView> }) {
  const t = useTranslations("outlets");
  return (
    <>
      <label className="block">
        <Label>{t("name")}</Label>
        <input
          name="name"
          required
          minLength={2}
          defaultValue={values?.name}
          className={inputCls}
          placeholder={t("namePlaceholder")}
        />
      </label>
      <fieldset>
        <Label>{t("kind")}</Label>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]!;
            return (
              <label
                key={k}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold ring-1 ring-border ring-inset has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-500"
              >
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  defaultChecked={(values?.kind ?? "restaurant") === k}
                  className="sr-only"
                />
                <Icon className="size-4 text-brand-600" aria-hidden="true" />
                {t(`kinds.${k}`)}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <Label>{t("location")}</Label>
          <input
            name="location"
            defaultValue={values?.location ?? ""}
            className={inputCls}
            placeholder={t("locationPlaceholder")}
          />
        </label>
        <label className="block">
          <Label>{t("hours")}</Label>
          <input
            name="hours"
            defaultValue={values?.hours ?? ""}
            className={inputCls}
            placeholder="07:00 – 23:00"
            dir="ltr"
          />
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
        <input
          type="checkbox"
          name="roomService"
          defaultChecked={values?.roomService ?? true}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span className="text-sm">
          <b className="block">{t("roomService")}</b>
          <span className="text-fg-muted">{t("roomServiceHint")}</span>
        </span>
      </label>
    </>
  );
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Full form: name, kind, place, hours and how many tables to lay out right away. */
export function NewOutletButton({ restaurantId }: { restaurantId: string }) {
  const t = useTranslations("outlets");
  const [open, setOpen] = useState(false);
  const r = useRun();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {t("new")}
      </Button>
      {open ? (
        <Sheet title={t("new")} onClose={() => setOpen(false)}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              r.run(
                () =>
                  createOutletAction(restaurantId, {
                    name: str(fd, "name"),
                    kind: str(fd, "kind") as Kind,
                    location: str(fd, "location"),
                    hours: str(fd, "hours"),
                    roomService: fd.get("roomService") === "on",
                    tables: Number(str(fd, "tables") || 0),
                    seats: Number(str(fd, "seats") || 4),
                    tablePrefix: str(fd, "tablePrefix"),
                  }),
                () => setOpen(false),
              );
            }}
          >
            <OutletFields />
            <div className="grid grid-cols-3 gap-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
              <label className="block">
                <Label>{t("tables")}</Label>
                <input name="tables" type="number" min={0} max={200} defaultValue={12} className={inputCls} />
              </label>
              <label className="block">
                <Label>{t("seats")}</Label>
                <input name="seats" type="number" min={1} max={30} defaultValue={4} className={inputCls} />
              </label>
              <label className="block">
                <Label hint={t("prefixHint")}>{t("prefix")}</Label>
                <input name="tablePrefix" maxLength={8} className={inputCls} placeholder="C" dir="ltr" />
              </label>
            </div>
            <FormError error={r.error} />
            <Button type="submit" className="w-full" disabled={r.pending}>
              {t("create")}
            </Button>
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

function SheetAction({
  label,
  icon,
  title,
  children,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-brand-50 hover:text-brand-800 [&_svg]:size-3.5"
      >
        {icon}
        {label}
      </button>
      {open ? (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </Sheet>
      ) : null}
    </>
  );
}

/** One outlet: who it is, today's activity, and its shortcuts (till, QR codes, menu, settings). */
export function OutletCard({
  restaurantId,
  outlet,
  categories,
  canManage,
}: {
  restaurantId: string;
  outlet: OutletView;
  categories: { id: string; name: string; outletIds: string[] }[];
  canManage: boolean;
}) {
  const t = useTranslations("outlets");
  const Icon = KIND_ICON[outlet.kind] ?? UtensilsCrossed;
  const edit = useRun();
  const menu = useRun();
  const add = useRun();
  const archive = useRun();
  const base = `/dashboard/${restaurantId}`;
  return (
    <article className="flex flex-col rounded-xl border border-border bg-surface shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[0_6px_20px_-10px_hsl(var(--shadow-color)/0.25)]">
      <header className="flex items-start gap-3 rounded-t-xl border-b border-border bg-brand-50/70 p-4">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", KIND_TILE[outlet.kind])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-bold">{outlet.name}</h2>
          <p className="text-xs font-semibold text-brand-700">{t(`kinds.${outlet.kind}`)}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted">
            {outlet.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {outlet.location}
              </span>
            ) : null}
            {outlet.hours ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden="true" />
                <bdi dir="ltr">{outlet.hours}</bdi>
              </span>
            ) : null}
          </p>
        </div>
      </header>
      <dl className="grid grid-cols-3 divide-x divide-border text-center rtl:divide-x-reverse">
        <div className="px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{t("tablesLabel")}</dt>
          <dd className="mt-0.5 font-bold tabular-nums">
            {outlet.openTables}
            <span className="text-xs font-medium text-fg-subtle"> / {outlet.tables}</span>
          </dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{t("ordersToday")}</dt>
          <dd className="mt-0.5 font-bold tabular-nums">{outlet.ordersToday}</dd>
        </div>
        <div className="px-2 py-3">
          <dt className="text-[11px] text-fg-muted">{t("salesToday")}</dt>
          <dd className="mt-0.5 truncate text-sm font-bold tabular-nums">{outlet.salesToday}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border p-2">
        <Link
          href={`${base}/pos?outlet=${outlet.id}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-brand-700 [&_svg]:size-3.5"
        >
          <Calculator aria-hidden="true" />
          {t("openTill")}
        </Link>
        <Link
          href={`${base}/tables`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-brand-50 hover:text-brand-800 [&_svg]:size-3.5"
        >
          <LayoutGrid aria-hidden="true" />
          {t("qr")}
        </Link>
        {canManage ? (
          <>
            <SheetAction
              label={t("menu")}
              icon={<SquareMenu aria-hidden="true" />}
              title={t("menuTitle", { name: outlet.name })}
            >
              {(close) => (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const ids = new FormData(e.currentTarget).getAll("category").map(String);
                    menu.run(() => setOutletMenuAction(restaurantId, outlet.id, ids), close);
                  }}
                >
                  <p className="text-sm text-fg-muted">{t("menuHint")}</p>
                  <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
                    {categories.map((c) => (
                      <li key={c.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-brand-50">
                          <input
                            type="checkbox"
                            name="category"
                            value={c.id}
                            defaultChecked={c.outletIds.includes(outlet.id)}
                            className="size-4 accent-[var(--accent)]"
                          />
                          <span className="flex-1 text-sm font-semibold">{c.name}</span>
                          <span className="text-xs text-fg-subtle">
                            {c.outletIds.length === 0
                              ? t("shared")
                              : c.outletIds.includes(outlet.id)
                                ? ""
                                : t("otherOutlets", { n: c.outletIds.length })}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {!categories.length ? <p className="text-sm text-fg-muted">{t("noCategories")}</p> : null}
                  <FormError error={menu.error} />
                  <Button type="submit" className="w-full" disabled={menu.pending}>
                    {t("save")}
                  </Button>
                </form>
              )}
            </SheetAction>
            <SheetAction
              label={t("addTables")}
              icon={<Plus aria-hidden="true" />}
              title={t("addTablesTitle", { name: outlet.name })}
            >
              {(close) => (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    add.run(
                      () =>
                        addOutletTablesAction(
                          restaurantId,
                          outlet.id,
                          Number(str(fd, "tables")),
                          Number(str(fd, "seats") || 4),
                        ),
                      close,
                    );
                  }}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <Label>{t("tables")}</Label>
                      <input
                        name="tables"
                        type="number"
                        min={1}
                        max={200}
                        defaultValue={4}
                        className={inputCls}
                      />
                    </label>
                    <label className="block">
                      <Label>{t("seats")}</Label>
                      <input
                        name="seats"
                        type="number"
                        min={1}
                        max={30}
                        defaultValue={4}
                        className={inputCls}
                      />
                    </label>
                  </div>
                  <FormError error={add.error} />
                  <Button type="submit" className="w-full" disabled={add.pending}>
                    {t("addTables")}
                  </Button>
                </form>
              )}
            </SheetAction>
            <SheetAction label={t("edit")} icon={<Pencil aria-hidden="true" />} title={outlet.name}>
              {(close) => (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    edit.run(
                      () =>
                        updateOutletAction(restaurantId, outlet.id, {
                          name: str(fd, "name"),
                          kind: str(fd, "kind") as Kind,
                          location: str(fd, "location"),
                          hours: str(fd, "hours"),
                          roomService: fd.get("roomService") === "on",
                        }),
                      close,
                    );
                  }}
                >
                  <OutletFields values={outlet} />
                  <FormError error={edit.error} />
                  <Button type="submit" className="w-full" disabled={edit.pending}>
                    {t("save")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-danger"
                    disabled={archive.pending}
                    onClick={() => {
                      if (window.confirm(t("archiveConfirm", { name: outlet.name })))
                        archive.run(() => archiveOutletAction(restaurantId, outlet.id), close);
                    }}
                  >
                    <Archive className="size-4" aria-hidden="true" />
                    {t("archive")}
                  </Button>
                  <FormError error={archive.error} />
                </form>
              )}
            </SheetAction>
          </>
        ) : null}
      </div>
    </article>
  );
}
