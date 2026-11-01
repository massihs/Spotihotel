"use client";

import {
  ArrowRight,
  BellRing,
  ChefHat,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { createPosOrderAction } from "@/app/[locale]/dashboard/[restaurantId]/pos/actions";
import { CategoryIcon } from "@/components/category-icon";
import { OptionPicker } from "@/components/pos/pos-terminal";
import { useMoney } from "@/components/ui/use-money";
import { cn } from "@/lib/cn";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import type { TableRound } from "@/server/modules/waiter/service";

export type WaiterTable = {
  id: string;
  label: string;
  kind?: string;
  zone: string | null;
  capacity: number | null;
  state: "free" | "in_progress" | "occupied";
  readyOrders: number;
  unpaidCents: number;
  totalCents: number;
};

type DraftLine = { key: string; productId: string; optionValueIds: string[]; quantity: number; note: string };
type Draft = { lines: DraftLine[]; note: string };

const EMPTY: Draft = { lines: [], note: "" };
const newKey = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
const draftKey = (rid: string, tableId: string) => `sf-waiter-draft:${rid}:${tableId}`;

function loadDraft(rid: string, tableId: string, menu: PublicMenu): Draft {
  try {
    const raw = localStorage.getItem(draftKey(rid, tableId));
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Draft;
    // Dishes removed from the menu since the draft was saved are dropped.
    return { note: d.note ?? "", lines: (d.lines ?? []).filter((l) => menu.products[l.productId]) };
  } catch {
    return EMPTY;
  }
}

const noSubscribe = () => () => {};
function draftTables(rid: string, tables: { id: string }[], _current: Draft) {
  try {
    return tables
      .filter((tb) => localStorage.getItem(draftKey(rid, tb.id)))
      .map((tb) => tb.id)
      .join(",");
  } catch {
    return "";
  }
}

function unitPrice(p: PublicProduct, ids: string[]) {
  return (
    p.priceCents +
    p.optionGroups
      .flatMap((g) => g.values)
      .filter((v) => ids.includes(v.id))
      .reduce((s, v) => s + v.priceDeltaCents, 0)
  );
}

/**
 * The waiter's order pad: tables at a glance, then the menu for one table. The order goes to
 * the kitchen and the bar as soon as it is sent (no till acceptance: the waiter is staff), and
 * every station printer prints its ticket. A draft is kept per table on the device.
 */
export function WaiterApp({
  restaurantId,
  menu,
  currency,
  tables,
  rounds,
}: {
  restaurantId: string;
  menu: PublicMenu;
  currency: string;
  tables: WaiterTable[];
  rounds: Record<string, TableRound[]>;
}) {
  const t = useTranslations("waiter");
  const tErr = useTranslations("errorCodes");
  const money = useMoney(currency);
  const [tableId, setTableId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "free" | "busy">("all");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [tab, setTab] = useState<"menu" | "rounds">("menu");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState<PublicProduct | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const table = tables.find((x) => x.id === tableId) ?? null;
  // Tables with a saved draft (read after hydration: the server has no local storage).
  const drafts = useSyncExternalStore(
    noSubscribe,
    () => draftTables(restaurantId, tables, draft),
    () => "",
  ).split(",");

  // The draft follows every change, so a locked phone or a reload loses nothing.
  useEffect(() => {
    if (!tableId) return;
    try {
      if (draft.lines.length || draft.note)
        localStorage.setItem(draftKey(restaurantId, tableId), JSON.stringify(draft));
      else localStorage.removeItem(draftKey(restaurantId, tableId));
    } catch {
      // Private mode: the draft lives in memory only.
    }
  }, [draft, tableId, restaurantId]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const open = (id: string) => {
    setTableId(id);
    setDraft(loadDraft(restaurantId, id, menu));
    setTab("menu");
    setQuery("");
    setCategory("all");
    setError(null);
    window.scrollTo({ top: 0 });
  };

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids =
      category === "all" || q
        ? menu.categories.flatMap((c) => c.productIds)
        : (menu.categories.find((c) => c.id === category)?.productIds ?? []);
    return ids.map((id) => menu.products[id]!).filter((p) => p && (!q || p.name.toLowerCase().includes(q)));
  }, [menu, category, query]);

  const add = (p: PublicProduct, optionValueIds: string[] = []) =>
    setDraft((d) => {
      const same = d.lines.find(
        (l) =>
          l.productId === p.id &&
          l.note === "" &&
          l.optionValueIds.join() === [...optionValueIds].sort().join(),
      );
      if (same)
        return {
          ...d,
          lines: d.lines.map((l) => (l === same ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l)),
        };
      return {
        ...d,
        lines: [
          ...d.lines,
          {
            key: newKey(),
            productId: p.id,
            optionValueIds: [...optionValueIds].sort(),
            quantity: 1,
            note: "",
          },
        ],
      };
    });
  const tap = (p: PublicProduct) => {
    if (!p.isAvailable) return;
    if (p.optionGroups.length) setPicking(p);
    else add(p);
  };
  const setQty = (key: string, q: number) =>
    setDraft((d) => ({
      ...d,
      lines:
        q <= 0
          ? d.lines.filter((l) => l.key !== key)
          : d.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, q) } : l)),
    }));
  const setLineNote = (key: string, note: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, note } : l)) }));

  const count = draft.lines.reduce((s, l) => s + l.quantity, 0);
  const total = draft.lines.reduce(
    (s, l) => s + unitPrice(menu.products[l.productId]!, l.optionValueIds) * l.quantity,
    0,
  );
  const qtyOf = (productId: string) =>
    draft.lines.filter((l) => l.productId === productId).reduce((s, l) => s + l.quantity, 0);

  const send = () => {
    if (!tableId || !draft.lines.length) return;
    setError(null);
    start(async () => {
      const res = await createPosOrderAction(restaurantId, {
        channel: "dine_in",
        tableId,
        lines: draft.lines.map((l) => ({
          productId: l.productId,
          optionValueIds: l.optionValueIds,
          quantity: l.quantity,
          note: l.note.trim(),
        })),
        note: draft.note.trim(),
        idempotencyKey: newKey(),
      });
      if (res?.ok) {
        setDraft(EMPTY);
        setTicketOpen(false);
        setTab("rounds");
        setToast(`${t("sent", { number: res.data?.number ?? "" })} ${t("printed")}`);
      } else setError(res ? (tErr.has(res.error) ? tErr(res.error) : tErr("internal")) : tErr("internal"));
    });
  };

  // ── Tables ──
  if (!table) {
    const mine = new Set(
      Object.entries(rounds)
        .filter(([, r]) => r.some((x) => x.byMe))
        .map(([id]) => id),
    );
    const shown = tables.filter((tb) =>
      filter === "all"
        ? true
        : filter === "mine"
          ? mine.has(tb.id)
          : filter === "free"
            ? tb.state === "free"
            : tb.state !== "free",
    );
    const zones = [...new Set(shown.map((tb) => tb.zone ?? ""))];
    return (
      <div className="space-y-4">
        {toast ? <Toast text={toast} onClose={() => setToast(null)} /> : null}
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(["all", "mine", "free", "busy"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-bold whitespace-nowrap",
                filter === f ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              {t(`filter${f[0]!.toUpperCase()}${f.slice(1)}` as "filterAll")}
            </button>
          ))}
        </div>
        {tables.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 p-6 text-center text-fg-muted">{t("noTables")}</p>
        ) : null}
        {zones.map((z) => (
          <section key={z || "-"}>
            {z ? <h2 className="mb-2 text-sm font-bold text-fg-muted">{z}</h2> : null}
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {shown
                .filter((tb) => (tb.zone ?? "") === z)
                .map((tb) => {
                  const r = rounds[tb.id] ?? [];
                  const hasDraft = drafts.includes(tb.id);
                  return (
                    <li key={tb.id}>
                      <button
                        type="button"
                        onClick={() => open(tb.id)}
                        className={cn(
                          "relative flex aspect-square w-full flex-col justify-between rounded-2xl border-2 p-3 text-start transition-transform active:scale-95",
                          tb.state === "free"
                            ? "border-border bg-surface"
                            : tb.state === "in_progress"
                              ? "border-warning bg-warning-soft"
                              : "border-accent bg-accent-soft",
                        )}
                      >
                        <span className="flex items-start justify-between gap-1">
                          <span className="text-3xl leading-none font-black tabular-nums">{tb.label}</span>
                          {tb.capacity ? (
                            <span className="inline-flex items-center gap-0.5 text-xs text-fg-muted">
                              <Users className="size-3" aria-hidden="true" />
                              {tb.capacity}
                            </span>
                          ) : null}
                        </span>
                        <span className="space-y-0.5 text-xs">
                          {tb.readyOrders ? (
                            <span className="flex items-center gap-1 font-bold text-success">
                              <BellRing className="size-3.5" aria-hidden="true" />
                              {t("ready", { count: tb.readyOrders })}
                            </span>
                          ) : null}
                          <span className="block font-semibold">
                            {tb.state === "free"
                              ? t("free")
                              : tb.state === "in_progress"
                                ? t("cooking")
                                : t("busy")}
                          </span>
                          {r.length ? (
                            <span className="block text-fg-muted tabular-nums">
                              {t("rounds", { count: r.length })} · {money(tb.totalCents)}
                            </span>
                          ) : null}
                        </span>
                        {hasDraft ? (
                          <span
                            className="absolute -end-1 -top-1 size-3.5 rounded-full bg-accent ring-2 ring-bg"
                            title={t("draftKept")}
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  // ── One table ──
  const tableRounds = rounds[table.id] ?? [];
  return (
    <div className="pb-28">
      {toast ? <Toast text={toast} onClose={() => setToast(null)} /> : null}
      <div className="sticky top-14 z-20 -mx-4 space-y-3 bg-bg/95 px-4 pt-1 pb-3 backdrop-blur sm:top-16 lg:top-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setTableId(null)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-bold ring-1 ring-border"
          >
            <ArrowRight className="size-4 ltr:rotate-180" aria-hidden="true" />
            {t("back")}
          </button>
          <h2 className="text-2xl font-black">
            {t(table.kind === "room" ? "tableRoom" : "table", { label: table.label })}
          </h2>
          {tableRounds.length ? (
            <span className="ms-auto text-sm text-fg-muted tabular-nums">
              {t("tableTotal")}: <b className="text-fg">{money(table.totalCents)}</b>
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {(["menu", "rounds"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={cn(
                "h-10 flex-1 rounded-xl text-sm font-bold",
                tab === k ? "bg-fg text-bg" : "bg-surface text-fg-muted ring-1 ring-border",
              )}
            >
              {k === "menu" ? t("menuTab") : `${t("roundsTab")} (${tableRounds.length})`}
            </button>
          ))}
        </div>
        {tab === "menu" ? (
          <>
            <label className="flex h-11 items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-[var(--ring)]">
              <Search className="size-4 text-fg-subtle" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none"
              />
            </label>
            <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
              <CatChip on={category === "all"} onClick={() => setCategory("all")}>
                {t("all")}
              </CatChip>
              {menu.categories.map((c) => (
                <CatChip key={c.id} on={category === c.id} onClick={() => setCategory(c.id)}>
                  <CategoryIcon icon={c.icon} className="size-4" />
                  {c.name}
                </CatChip>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {tab === "menu" ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const q = qtyOf(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => tap(p)}
                  disabled={!p.isAvailable}
                  aria-label={t("add", { name: p.name })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl bg-surface p-2.5 text-start ring-1 transition-transform active:scale-[0.98] disabled:opacity-45",
                    q ? "ring-2 ring-accent" : "ring-border",
                  )}
                >
                  {p.images[0] ? (
                    <img
                      src={p.images[0].sm}
                      alt=""
                      loading="lazy"
                      className="size-14 shrink-0 rounded-xl bg-surface-2 object-cover"
                    />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg-subtle">
                      <ChefHat className="size-5" aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{p.name}</span>
                    <span className="block text-sm text-fg-muted tabular-nums">
                      {p.isAvailable ? money(p.priceCents) : t("soldOut")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full text-base font-black",
                      q ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg",
                    )}
                  >
                    {q ? q : <Plus className="size-5" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <Rounds rounds={tableRounds} money={money} t={t} />
      )}

      {/* Order bar */}
      <div
        hidden={tab === "rounds" && !count}
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 lg:start-auto lg:end-6 lg:bottom-4 lg:w-[26rem] lg:px-0"
      >
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          disabled={!count}
          className="flex h-14 w-full items-center gap-3 rounded-2xl bg-fg px-4 text-bg shadow-[var(--shadow-float)] disabled:opacity-40"
        >
          <span className="grid size-8 place-items-center rounded-full bg-bg/15 text-sm font-black tabular-nums">
            {count}
          </span>
          <span className="flex-1 text-start font-bold">{count ? t("viewTicket") : t("emptyTicket")}</span>
          {count ? <span className="font-bold tabular-nums">{money(total)}</span> : null}
        </button>
      </div>

      {ticketOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-end sm:place-items-center"
          role="dialog"
          aria-modal="true"
          aria-label={t("ticket")}
        >
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setTicketOpen(false)}
          />
          <div className="animate-sheet-up relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl bg-surface sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <p className="text-lg font-black">
                  {t("ticket")} · {t(table.kind === "room" ? "tableRoom" : "table", { label: table.label })}
                </p>
                <p className="text-xs text-fg-muted">
                  {t("ticketItems", { count })} · {t("draftKept")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTicketOpen(false)}
                aria-label={t("close")}
                className="grid size-9 place-items-center rounded-full bg-surface-2"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
              {draft.lines.map((l) => {
                const p = menu.products[l.productId]!;
                const opts = p.optionGroups
                  .flatMap((g) => g.values)
                  .filter((v) => l.optionValueIds.includes(v.id));
                return (
                  <li key={l.key} className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p.name}</p>
                        {opts.length ? (
                          <p className="text-xs text-fg-muted">{opts.map((o) => o.name).join("، ")}</p>
                        ) : null}
                        <p className="text-sm text-fg-muted tabular-nums">
                          {money(unitPrice(p, l.optionValueIds) * l.quantity)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
                        <button
                          type="button"
                          onClick={() => setQty(l.key, l.quantity - 1)}
                          aria-label={l.quantity === 1 ? t("remove") : t("decrease")}
                          className="grid size-9 place-items-center rounded-full bg-surface"
                        >
                          {l.quantity === 1 ? (
                            <Trash2 className="size-4 text-danger" aria-hidden="true" />
                          ) : (
                            <Minus className="size-4" aria-hidden="true" />
                          )}
                        </button>
                        <span className="w-6 text-center font-black tabular-nums">{l.quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQty(l.key, l.quantity + 1)}
                          aria-label={t("increase")}
                          className="grid size-9 place-items-center rounded-full bg-surface"
                        >
                          <Plus className="size-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <input
                      value={l.note}
                      onChange={(e) => setLineNote(l.key, e.target.value)}
                      maxLength={280}
                      placeholder={t("itemNote")}
                      aria-label={t("itemNote")}
                      className="mt-2 h-10 w-full rounded-xl bg-surface-2 px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                  </li>
                );
              })}
            </ul>
            <div className="space-y-3 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <textarea
                value={draft.note}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                maxLength={500}
                rows={2}
                placeholder={t("orderNote")}
                aria-label={t("orderNote")}
                className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
              <p className="flex justify-between text-base font-black tabular-nums">
                <span>{t("ticketItems", { count })}</span>
                <span>{money(total)}</span>
              </p>
              {error ? (
                <p
                  role="alert"
                  className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY)}
                  className="h-14 rounded-2xl bg-surface-2 px-4 text-sm font-bold text-fg-muted"
                >
                  {t("clear")}
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={pending || !draft.lines.length}
                  className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-base font-black text-accent-fg disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="size-5 rtl:-scale-x-100" aria-hidden="true" />
                  )}
                  {pending ? t("sending") : t("send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {picking ? (
        <OptionPicker
          product={picking}
          money={money}
          onClose={() => setPicking(null)}
          onAdd={(ids) => {
            add(picking, ids);
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}

function CatChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap",
        on ? "bg-accent text-accent-fg" : "bg-surface text-fg-muted ring-1 ring-border",
      )}
    >
      {children}
    </button>
  );
}

function Rounds({
  rounds,
  money,
  t,
}: {
  rounds: TableRound[];
  money: (c: number) => string;
  t: ReturnType<typeof useTranslations<"waiter">>;
}) {
  const tStatus = useTranslations("orderStatus");
  if (!rounds.length)
    return <p className="rounded-2xl bg-surface-2 p-6 text-center text-fg-muted">{t("noRounds")}</p>;
  return (
    <ol className="space-y-3">
      {[...rounds].reverse().map((r) => (
        <li key={r.id} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2">
            <ReceiptText className="size-4 text-fg-muted" aria-hidden="true" />
            <span className="font-black">#{r.number}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-bold",
                r.status === "ready"
                  ? "bg-success-soft text-success"
                  : r.status === "served"
                    ? "bg-surface-2 text-fg-muted"
                    : "bg-warning-soft text-warning",
              )}
            >
              {tStatus.has(r.status) ? tStatus(r.status) : r.status}
            </span>
            <span className="ms-auto text-xs text-fg-muted">
              {t("by", { name: r.byMe ? t("byMe") : (r.by ?? "QR") })}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {r.items.map((it, i) => (
              <li key={i}>
                <b className="tabular-nums">{it.quantity}×</b> {it.name}
                {it.options.length ? <span className="text-fg-muted"> · {it.options.join("، ")}</span> : null}
                {it.note ? <span className="block text-xs text-warning">↳ {it.note}</span> : null}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between text-sm">
            <span className={r.paid ? "text-success" : "text-fg-muted"}>
              {r.paid ? t("paid") : t("unpaid")}
            </span>
            <b className="tabular-nums">{money(r.totalCents)}</b>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-float)]"
    >
      <ChefHat className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="×" className="opacity-80">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
