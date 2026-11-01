"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import type { CartLineView } from "@/server/modules/cart/service";
import type { Totals } from "@/server/modules/pricing";
import {
  placeOrderAction,
  removeItemAction,
  renameAction,
  setNoteAction,
  setQuantityAction,
} from "@/app/[locale]/table/actions";
import { useMoney } from "./menu-app";
import { QuantityStepper } from "./product-sheet";

export function CartView({
  lines,
  totals,
  currency,
  pricesIncludeTax,
  seatLabel,
  displayName,
  hasIssues,
  orderCount,
}: {
  lines: CartLineView[];
  totals: Totals;
  currency: string;
  pricesIncludeTax: boolean;
  seatLabel: string;
  displayName: string | null;
  hasIssues: boolean;
  orderCount: number;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const format = useFormatter();
  const rate = (bps: number) => format.number(bps / 10_000, { style: "percent", maximumFractionDigits: 2 });

  return (
    <main className="px-4 pb-16">
      <div className="flex items-center gap-3 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        <Link
          href="/table"
          className="grid size-10 place-items-center rounded-full bg-surface-2"
          aria-label={t("guest.backToMenu")}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 rtl:rotate-180"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold">{t("guest.cartTitle")}</h1>
      </div>

      <NameForm seatLabel={seatLabel} displayName={displayName} />

      {lines.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-medium">{t("guest.cartEmpty")}</p>
          <p className="mt-1 text-fg-muted">{t("guest.cartEmptyBody")}</p>
          <Link
            href="/table"
            className="mt-6 inline-flex h-12 items-center rounded-2xl bg-accent px-6 font-semibold text-accent-fg"
          >
            {t("guest.backToMenu")}
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-4 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm text-fg-muted">
            {t("guest.personal")}
          </p>
          <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-surface">
            {lines.map((l) => (
              <CartLine key={l.id} line={l} money={money} />
            ))}
          </ul>
          <dl className="mt-5 space-y-1.5 rounded-2xl border border-border bg-surface p-4 text-sm">
            {!pricesIncludeTax ? (
              <div className="flex justify-between">
                <dt>{t("guest.subtotal")}</dt>
                <dd className="tabular-nums">{money(totals.subtotalCents)}</dd>
              </div>
            ) : null}
            {totals.taxes.map((tx) => (
              <div key={tx.rateBps} className="flex justify-between text-fg-muted">
                <dt>
                  {pricesIncludeTax
                    ? t("guest.vat", { rate: rate(tx.rateBps) })
                    : t("guest.vatExcl", { rate: rate(tx.rateBps) })}
                </dt>
                <dd className="tabular-nums">{money(tx.taxCents)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>{t("guest.total")}</dt>
              <dd className="tabular-nums">{money(totals.totalCents)}</dd>
            </div>
          </dl>
          <OrderPanel
            totalLabel={money(totals.totalCents)}
            disabled={hasIssues || totals.totalCents === 0}
            hasIssues={hasIssues}
          />
        </>
      )}
      {orderCount > 0 ? (
        <Link href="/table/orders" className="mt-6 block text-center text-sm font-medium text-accent">
          {t("guest.ordersLink", { count: orderCount })}
        </Link>
      ) : null}
    </main>
  );
}

function OrderPanel({
  totalLabel,
  disabled,
  hasIssues,
}: {
  totalLabel: string;
  disabled: boolean;
  hasIssues: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-5 space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{t("guest.orderNote")}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("guest.orderNotePlaceholder")}
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[16px] placeholder:text-fg-subtle"
        />
      </label>
      {hasIssues ? <p className="text-sm text-danger">{t("guest.fixCart")}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="sticky bottom-0 bg-bg pt-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await placeOrderAction(note);
              if (res?.ok) router.push("/table/orders?placed=1");
              else if (res) {
                setError(
                  t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"),
                );
                router.refresh();
              }
            })
          }
          className="h-14 w-full rounded-2xl bg-accent text-lg font-semibold text-accent-fg shadow-xl disabled:opacity-50"
        >
          {pending ? "…" : t("guest.placeOrder", { price: totalLabel })}
        </button>
      </div>
    </div>
  );
}

function CartLine({ line: l, money }: { line: CartLineView; money: (c: number) => string }) {
  const t = useTranslations("guest");
  const tErr = useTranslations("errorCodes");
  const [quantity, setQuantity] = useOptimistic(l.quantity);
  const [pending, startTransition] = useTransition();
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(l.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const report = (res: Awaited<ReturnType<typeof setQuantityAction>>) =>
    setError(res && !res.ok ? (tErr.has(res.error) ? tErr(res.error) : tErr("internal")) : null);

  return (
    <li className={cn("p-4", pending && "opacity-70")}>
      <div className="flex gap-3">
        {l.image ? (
          <img
            src={l.image}
            alt=""
            width={64}
            height={64}
            className="size-16 shrink-0 rounded-xl object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex justify-between gap-2">
            <p className="font-medium">{l.name || "—"}</p>
            <p className="shrink-0 font-semibold tabular-nums">
              {l.line ? money(l.line.lineTotalCents) : ""}
            </p>
          </div>
          {l.line?.selections.length ? (
            <p className="mt-0.5 text-sm text-fg-muted">
              {l.line.selections
                .map((s) =>
                  s.priceDeltaCents ? `${s.valueName} (+${money(s.priceDeltaCents)})` : s.valueName,
                )
                .join(" · ")}
            </p>
          ) : null}
          {l.issue ? (
            <p role="alert" className="mt-1 text-sm text-danger">
              {t.has(`issues.${l.issue}`) ? t(`issues.${l.issue}`) : t("issues.product_unavailable")}
            </p>
          ) : null}
          {editingNote ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const res = await setNoteAction(l.id, note);
                  report(res);
                  if (res?.ok) setEditingNote(false);
                });
              }}
            >
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                autoFocus
                aria-label={t("note")}
                placeholder={t("notePlaceholder")}
                className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-[16px]"
              />
              <button type="submit" className="h-10 rounded-lg bg-fg px-3 text-sm font-medium text-bg">
                {t("save")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 text-start text-sm text-fg-muted underline-offset-2 hover:underline"
            >
              {l.note ? `« ${l.note} »` : `+ ${t("note")}`}
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => startTransition(async () => report(await removeItemAction(l.id)))}
          className="text-sm text-danger"
        >
          {t("remove")}
        </button>
        <QuantityStepper
          value={quantity}
          min={1}
          disabled={pending}
          onChange={(n) =>
            startTransition(async () => {
              setQuantity(n);
              report(await setQuantityAction(l.id, n));
            })
          }
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function NameForm({ seatLabel, displayName }: { seatLabel: string; displayName: string | null }) {
  const t = useTranslations("guest");
  const [state, action, pending] = useActionState(renameAction, null);
  return (
    <form action={action} className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-3">
      <label className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          {t("yourName")} <span className="font-normal text-fg-subtle">· {seatLabel}</span>
        </span>
        <input
          name="displayName"
          defaultValue={displayName ?? ""}
          maxLength={24}
          autoComplete="given-name"
          className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-[16px]"
        />
        <span className="mt-1 block text-xs text-fg-subtle">{state?.ok ? "✓" : t("yourNameHint")}</span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="mb-5 h-10 rounded-lg bg-surface-2 px-3 text-sm font-medium"
      >
        {t("save")}
      </button>
    </form>
  );
}
