"use client";

import { AlertTriangle, ClipboardCheck, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { useMoney } from "@/components/ui/use-money";
import { Sheet, field, num, useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";
import { parseMoneyInput } from "@/lib/money";
import {
  adjustStockAction,
  createPurchaseAction,
  createStockItemAction,
  createSupplierAction,
  deleteStockItemAction,
  deleteSupplierAction,
  setRecipeAction,
  updateStockItemAction,
} from "@/app/[locale]/dashboard/[restaurantId]/inventory/actions";

const UNITS = ["g", "kg", "ml", "l", "piece", "pack"] as const;
type Unit = (typeof UNITS)[number];
export type StockRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockThreshold: number;
  avgCostCents: number;
  isLow: boolean;
};

// ─── Stock list ──────────────────────────────────────────────────────────────

export function StockTable({
  rid,
  items,
  currency,
  canManage,
}: {
  rid: string;
  items: StockRow[];
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations("inventory");
  const format = useFormatter();
  const money = useMoney(currency);
  const [edit, setEdit] = useState<StockRow | "new" | null>(null);
  const [adjust, setAdjust] = useState<{ item: StockRow; kind: "count" | "waste" } | null>(null);
  const value = items.reduce((s, i) => s + Math.max(0, i.quantity) * i.avgCostCents, 0);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-fg-muted">{t("stockValue")}</p>
          <p className="text-lg font-bold tabular-nums">{money(Math.round(value))}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3">
          <p className="text-xs text-fg-muted">{t("lowCount")}</p>
          <p className={cn("text-lg font-bold tabular-nums", items.some((i) => i.isLow) && "text-danger")}>
            {items.filter((i) => i.isLow && i.lowStockThreshold > 0).length}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setEdit("new")}
            className="ms-auto inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg"
          >
            <Plus className="size-4" />
            {t("newItem")}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center text-fg-muted">
          {t("noItems")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {items.map((i) => {
            const low = i.lowStockThreshold > 0 && i.isLow;
            const pct =
              i.lowStockThreshold > 0 ? Math.min(100, (i.quantity / (i.lowStockThreshold * 3)) * 100) : 100;
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-semibold">
                    {low ? <AlertTriangle className="size-4 text-danger" aria-hidden="true" /> : null}
                    {i.name}
                  </p>
                  <div className="mt-1.5 h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={cn("h-full rounded-full", low ? "bg-danger" : "bg-accent")}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">
                    {t("avgCost", { amount: money(i.avgCostCents), unit: t(`units.${i.unit}`) })}
                    {i.lowStockThreshold > 0
                      ? ` · ${t("threshold", { qty: format.number(i.lowStockThreshold, { maximumFractionDigits: 2 }), unit: t(`units.${i.unit}`) })}`
                      : ""}
                  </p>
                </div>
                <p className={cn("text-lg font-bold tabular-nums", low && "text-danger")}>
                  {format.number(i.quantity, { maximumFractionDigits: i.unit === "piece" ? 0 : 2 })}{" "}
                  <span className="text-sm font-medium text-fg-muted">{t(`units.${i.unit}`)}</span>
                </p>
                {canManage ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setAdjust({ item: i, kind: "count" })}
                      className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm ring-1 ring-border"
                      title={t("count")}
                    >
                      <ClipboardCheck className="size-4" />
                      <span className="max-sm:hidden">{t("count")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjust({ item: i, kind: "waste" })}
                      className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm ring-1 ring-border"
                      title={t("waste")}
                    >
                      <Trash2 className="size-4" />
                      <span className="max-sm:hidden">{t("waste")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEdit(i)}
                      className="grid size-9 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
                      aria-label={t("edit")}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {edit ? (
        <ItemForm
          rid={rid}
          item={edit === "new" ? null : edit}
          currency={currency}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {adjust ? <AdjustForm rid={rid} {...adjust} onClose={() => setAdjust(null)} /> : null}
    </>
  );
}

function ItemForm({
  rid,
  item,
  currency,
  onClose,
}: {
  rid: string;
  item: StockRow | null;
  currency: string;
  onClose: () => void;
}) {
  const t = useTranslations("inventory");
  const { pending, error, run } = useRun();
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState<Unit>((item?.unit as Unit) ?? "kg");
  const [threshold, setThreshold] = useState(item ? String(item.lowStockThreshold) : "");
  const [initial, setInitial] = useState("");
  const [cost, setCost] = useState("");
  return (
    <Sheet title={item ? t("editItem") : t("newItem")} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          {t("name")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(field, "mt-1")}
            maxLength={120}
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">
            {t("unit")}
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as Unit)}
              className={cn(field, "mt-1")}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`units.${u}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {t("lowThreshold")}
            <input
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              className={cn(field, "mt-1")}
            />
          </label>
        </div>
        {!item ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              {t("initialQty")}
              <input
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
            <label className="block text-sm font-medium">
              {t("unitCost")}
              <input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                inputMode="numeric"
                dir="ltr"
                className={cn(field, "mt-1")}
              />
            </label>
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex gap-2 pt-2">
          {item ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                window.confirm(t("deleteConfirm")) && run(() => deleteStockItemAction(rid, item.id), onClose)
              }
              className="h-11 rounded-xl px-4 text-sm font-semibold text-danger ring-1 ring-border"
            >
              {t("delete")}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () =>
                  item
                    ? updateStockItemAction(rid, item.id, {
                        name,
                        unit,
                        lowStockThreshold: num(threshold) || 0,
                      })
                    : createStockItemAction(rid, {
                        name,
                        unit,
                        lowStockThreshold: num(threshold) || 0,
                        initialQuantity: num(initial) || 0,
                        unitCostCents: parseMoneyInput(cost, currency) ?? 0,
                      }),
                onClose,
              )
            }
            className="h-11 flex-1 rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function AdjustForm({
  rid,
  item,
  kind,
  onClose,
}: {
  rid: string;
  item: StockRow;
  kind: "count" | "waste";
  onClose: () => void;
}) {
  const t = useTranslations("inventory");
  const { pending, error, run } = useRun();
  const [value, setValue] = useState(kind === "count" ? String(item.quantity) : "");
  const [note, setNote] = useState("");
  return (
    <Sheet title={`${kind === "count" ? t("count") : t("waste")} — ${item.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-fg-muted">{kind === "count" ? t("countHint") : t("wasteHint")}</p>
      <label className="block text-sm font-medium">
        {t("quantity")} ({t(`units.${item.unit}`)})
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          className={cn(field, "mt-1 text-lg")}
          autoFocus
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        {t("note")}
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          className={cn(field, "mt-1")}
        />
      </label>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !Number.isFinite(num(value)) || value === ""}
        onClick={() => run(() => adjustStockAction(rid, item.id, kind, num(value), note), onClose)}
        className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
      >
        {t("save")}
      </button>
    </Sheet>
  );
}

// ─── Purchases ───────────────────────────────────────────────────────────────

export function PurchaseForm({
  rid,
  items,
  suppliers,
  currency,
}: {
  rid: string;
  items: StockRow[];
  suppliers: { id: string; name: string }[];
  currency: string;
}) {
  const t = useTranslations("inventory");
  const money = useMoney(currency);
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<{ stockItemId: string; quantity: string; cost: string }[]>([
    { stockItemId: "", quantity: "", cost: "" },
  ]);
  const parsed = lines.map((l) => ({
    stockItemId: l.stockItemId,
    quantity: num(l.quantity),
    unitCostCents: parseMoneyInput(l.cost, currency) ?? NaN,
  }));
  const valid = parsed.every((l) => l.stockItemId && l.quantity > 0 && Number.isFinite(l.unitCostCents));
  const total = valid ? parsed.reduce((s, l) => s + Math.round(l.quantity * l.unitCostCents), 0) : 0;
  const reset = () => {
    setOpen(false);
    setSupplier("");
    setReference("");
    setLines([{ stockItemId: "", quantity: "", cost: "" }]);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!items.length}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-40"
      >
        <Truck className="size-4" />
        {t("newPurchase")}
      </button>
      {open ? (
        <Sheet title={t("newPurchase")} onClose={reset}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">
              {t("supplier")}
              <select
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className={cn(field, "mt-1")}
              >
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t("reference")}
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={64}
                className={cn(field, "mt-1")}
              />
            </label>
          </div>
          <div className="mt-4 space-y-2">
            {lines.map((l, i) => {
              const it = items.find((x) => x.id === l.stockItemId);
              return (
                <div key={i} className="grid grid-cols-[1fr_5.5rem_7rem_2.25rem] items-end gap-2">
                  <select
                    value={l.stockItemId}
                    onChange={(e) =>
                      setLines((ls) =>
                        ls.map((x, k) => (k === i ? { ...x, stockItemId: e.target.value } : x)),
                      )
                    }
                    className={field}
                    aria-label={t("item")}
                  >
                    <option value="">{t("item")}</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))
                    }
                    placeholder={it ? t(`units.${it.unit}`) : t("quantity")}
                    inputMode="decimal"
                    dir="ltr"
                    className={field}
                  />
                  <input
                    value={l.cost}
                    onChange={(e) =>
                      setLines((ls) => ls.map((x, k) => (k === i ? { ...x, cost: e.target.value } : x)))
                    }
                    placeholder={t("unitCostShort")}
                    inputMode="numeric"
                    dir="ltr"
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : ls))}
                    className="grid size-9 place-items-center rounded-full text-fg-subtle hover:bg-surface-2"
                    aria-label={t("delete")}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, { stockItemId: "", quantity: "", cost: "" }])}
              className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text"
            >
              <Plus className="size-4" />
              {t("addLine")}
            </button>
          </div>
          <p className="mt-4 flex justify-between text-lg font-bold">
            <span>{t("total")}</span>
            <span className="tabular-nums">{money(total)}</span>
          </p>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
          <button
            type="button"
            disabled={pending || !valid}
            onClick={() =>
              run(
                () =>
                  createPurchaseAction(rid, {
                    supplierId: supplier || null,
                    reference,
                    note: "",
                    lines: parsed,
                  }),
                reset,
              )
            }
            className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
          >
            {t("savePurchase")}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

// ─── Suppliers ───────────────────────────────────────────────────────────────

export function SupplierList({
  rid,
  suppliers,
  canManage,
}: {
  rid: string;
  suppliers: { id: string; name: string; phone: string | null }[];
  canManage: boolean;
}) {
  const t = useTranslations("inventory");
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-surface p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("supplierName")}
            className={cn(field, "min-w-0 flex-1")}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("phone")}
            dir="ltr"
            inputMode="tel"
            className={cn(field, "w-40")}
          />
          <button
            type="button"
            disabled={pending || !name.trim()}
            onClick={() =>
              run(
                () => createSupplierAction(rid, { name, phone, note: "" }),
                () => (setName(""), setPhone("")),
              )
            }
            className="h-11 rounded-xl bg-accent px-5 font-semibold text-accent-fg disabled:opacity-40"
          >
            {t("add")}
          </button>
          {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}
      {suppliers.length === 0 ? (
        <p className="py-8 text-center text-fg-muted">{t("noSuppliers")}</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent-text">
                <Truck className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                {s.phone ? (
                  <a href={`tel:${s.phone}`} dir="ltr" className="text-sm text-fg-muted">
                    {s.phone}
                  </a>
                ) : null}
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(t("deleteConfirm")) && run(() => deleteSupplierAction(rid, s.id))
                  }
                  className="grid size-9 place-items-center rounded-full text-fg-subtle hover:bg-danger-soft hover:text-danger"
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export function RecipeList({
  rid,
  recipes,
  items,
  currency,
  canManage,
}: {
  rid: string;
  recipes: {
    id: string;
    name: string;
    priceCents: number;
    costCents: number;
    items: { stockItemId: string; quantity: number; name: string; unit: string }[];
  }[];
  items: StockRow[];
  currency: string;
  canManage: boolean;
}) {
  const t = useTranslations("inventory");
  const money = useMoney(currency);
  const [edit, setEdit] = useState<(typeof recipes)[number] | null>(null);
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-2">
        {recipes.map((r) => {
          const margin =
            r.priceCents > 0 && r.costCents > 0
              ? Math.round(((r.priceCents - r.costCents) / r.priceCents) * 100)
              : null;
          return (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="text-xs text-fg-muted">
                    {t("price")} {money(r.priceCents)} · {t("cost")} {money(r.costCents)}
                  </p>
                </div>
                {margin != null ? (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-bold",
                      margin >= 60
                        ? "bg-success-soft text-success"
                        : margin >= 30
                          ? "bg-warning-soft"
                          : "bg-danger-soft text-danger",
                    )}
                  >
                    {t("margin", { pct: margin })}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                {r.items.length
                  ? r.items.map((i) => `${i.name} ${i.quantity}${t(`units.${i.unit}`)}`).join(" · ")
                  : t("noRecipe")}
              </p>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setEdit(r)}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent-text"
                >
                  <Pencil className="size-3.5" />
                  {t("editRecipe")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {edit ? <RecipeForm rid={rid} recipe={edit} items={items} onClose={() => setEdit(null)} /> : null}
    </>
  );
}

function RecipeForm({
  rid,
  recipe,
  items,
  onClose,
}: {
  rid: string;
  recipe: { id: string; name: string; items: { stockItemId: string; quantity: number }[] };
  items: StockRow[];
  onClose: () => void;
}) {
  const t = useTranslations("inventory");
  const { pending, error, run } = useRun();
  const [lines, setLines] = useState(
    recipe.items.map((i) => ({ stockItemId: i.stockItemId, quantity: String(i.quantity) })),
  );
  const parsed = lines
    .filter((l) => l.stockItemId)
    .map((l) => ({ stockItemId: l.stockItemId, quantity: num(l.quantity) }));
  const valid = parsed.every((l) => l.quantity > 0);
  return (
    <Sheet title={`${t("recipe")} — ${recipe.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-fg-muted">{t("recipeHint")}</p>
      <div className="space-y-2">
        {lines.map((l, i) => {
          const it = items.find((x) => x.id === l.stockItemId);
          return (
            <div key={i} className="grid grid-cols-[1fr_6rem_2.25rem] gap-2">
              <select
                value={l.stockItemId}
                onChange={(e) =>
                  setLines((ls) => ls.map((x, k) => (k === i ? { ...x, stockItemId: e.target.value } : x)))
                }
                className={field}
                aria-label={t("item")}
              >
                <option value="">{t("item")}</option>
                {items.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <input
                value={l.quantity}
                onChange={(e) =>
                  setLines((ls) => ls.map((x, k) => (k === i ? { ...x, quantity: e.target.value } : x)))
                }
                placeholder={it ? t(`units.${it.unit}`) : ""}
                inputMode="decimal"
                dir="ltr"
                className={field}
              />
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                className="grid size-9 place-items-center self-center rounded-full text-fg-subtle hover:bg-surface-2"
                aria-label={t("delete")}
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { stockItemId: "", quantity: "" }])}
          className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text"
        >
          <Plus className="size-4" />
          {t("addIngredient")}
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        disabled={pending || !valid}
        onClick={() => run(() => setRecipeAction(rid, recipe.id, parsed), onClose)}
        className="mt-4 h-12 w-full rounded-xl bg-accent font-bold text-accent-fg disabled:opacity-40"
      >
        {t("save")}
      </button>
    </Sheet>
  );
}
