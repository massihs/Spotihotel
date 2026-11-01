"use client";

import {
  ChefHat,
  ChevronDown,
  ChevronLeft,
  Loader2,
  Plus,
  ReceiptText,
  Send,
  ShoppingBag,
  Smartphone,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  checkCouponAction,
  placeOrderAction,
  removeItemAction,
  renameAction,
  setNoteAction,
  setQuantityAction,
} from "@/app/[locale]/table/actions";
import { useMoney } from "@/components/ui/use-money";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { couponDiscount } from "@/lib/coupon";
import type { CartLineView } from "@/server/modules/cart/service";
import type { Totals } from "@/server/modules/pricing";
import { QuantityStepper } from "./parts";

export function GuestTopBar({
  title,
  subtitle,
  extra,
  backHref = "/table",
}: {
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  backHref?: string;
}) {
  const t = useTranslations("guest");
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md supports-[backdrop-filter]:bg-bg/85">
      <div className="mx-auto flex max-w-2xl items-center gap-3 lg:max-w-6xl">
        <Link
          href={backHref}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 active:bg-surface-3"
          aria-label={t("backToMenu")}
        >
          <ChevronLeft className="size-5 ltr:rotate-0 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg leading-tight font-semibold">{title}</h1>
          {subtitle ? <div className="truncate text-sm text-fg-muted">{subtitle}</div> : null}
        </div>
        {extra ? <div className="ms-auto shrink-0">{extra}</div> : null}
      </div>
    </div>
  );
}

export function CartView({
  lines,
  totals,
  currency,
  pricesIncludeTax,
  seatLabel,
  displayName,
  hasIssues,
  orderCount,
  restaurantName,
  requirePhone = false,
}: {
  lines: CartLineView[];
  totals: Totals;
  currency: string;
  pricesIncludeTax: boolean;
  seatLabel: string;
  displayName: string | null;
  hasIssues: boolean;
  orderCount: number;
  restaurantName?: string;
  /** Food courts: the guest gives a mobile number to be texted when the order is ready. */
  requirePhone?: boolean;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const format = useFormatter();
  const rate = (bps: number) => format.number(bps / 10_000, { style: "percent", maximumFractionDigits: 2 });
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <>
      <GuestTopBar
        title={t("guest.cartTitle")}
        subtitle={restaurantName ? `${restaurantName} · ${seatLabel}` : seatLabel}
      />
      {lines.length === 0 ? (
        <main className="px-6 py-20 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full bg-surface-2">
            <ShoppingBag className="size-9 text-fg-muted" aria-hidden="true" />
          </div>
          <p className="mt-5 text-lg font-bold">{t("guest.cartEmpty")}</p>
          <p className="mt-1 text-fg-muted">{t("guest.cartEmptyBody")}</p>
          <Link
            href="/table"
            className="mt-7 inline-flex h-12 items-center rounded-full bg-accent px-7 font-bold text-accent-fg"
          >
            {t("guest.backToMenu")}
          </Link>
          {orderCount > 0 ? (
            <Link href="/table/orders" className="mt-4 block text-sm font-semibold text-accent-text">
              {t("guest.ordersLink", { count: orderCount })}
            </Link>
          ) : null}
        </main>
      ) : (
        <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-4 pb-40 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-6 lg:pt-6 lg:pb-12">
          <div className="lg:col-span-2">
            <Steps />
          </div>
          <div className="flex flex-col gap-4">
            <section className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
              <div className="flex items-center justify-between px-4 pt-4">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <ShoppingBag className="size-5 text-accent" aria-hidden="true" />
                  {t("guest.items", { count: itemCount })}
                </h2>
              </div>
              <ul className="px-4">
                {lines.map((l) => (
                  <CartLine key={l.id} line={l} money={money} />
                ))}
              </ul>
              <div className="border-t border-border p-3">
                <Link
                  href="/table"
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-sm font-semibold text-accent-text hover:bg-accent-soft/50"
                >
                  <Plus className="size-4" strokeWidth={2.5} aria-hidden="true" />
                  {t("guest.addMore")}
                </Link>
              </div>
            </section>
            <p className="hidden px-4 text-center text-xs text-fg-subtle lg:block">{t("guest.personal")}</p>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
            <OrderPanel
              requirePhone={requirePhone}
              displayName={displayName}
              totalCents={totals.totalCents}
              money={money}
              disabled={hasIssues || totals.totalCents === 0}
              hasIssues={hasIssues}
              summary={(couponCents) => (
                <dl className="space-y-2 text-[15px]">
                  {!pricesIncludeTax || couponCents ? (
                    <div className="flex justify-between">
                      <dt className="text-fg-muted">{t("guest.subtotal")}</dt>
                      <dd className="tabular-nums">
                        {money(pricesIncludeTax ? totals.totalCents : totals.subtotalCents)}
                      </dd>
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
                  {couponCents ? (
                    <div className="flex justify-between font-semibold text-success">
                      <dt>{t("guest.coupon")}</dt>
                      <dd className="tabular-nums">−{money(couponCents)}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-border pt-3 text-lg font-bold">
                    <dt>{t("guest.total")}</dt>
                    <dd className="tabular-nums">{money(totals.totalCents - couponCents)}</dd>
                  </div>
                </dl>
              )}
            />
            <p className="px-4 text-center text-xs text-fg-subtle lg:hidden">{t("guest.personal")}</p>
            {orderCount > 0 ? (
              <Link href="/table/orders" className="block text-center text-sm font-semibold text-accent-text">
                {t("guest.ordersLink", { count: orderCount })}
              </Link>
            ) : null}
          </aside>
        </main>
      )}
    </>
  );
}

const PHONE_KEY = "sf-guest-phone";

/** Three steps: cart → confirm → follow; the second is current on this page. */
function Steps() {
  const t = useTranslations("guest.checkoutSteps");
  const steps = ["cart", "confirm", "track"] as const;
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold" aria-label={t("label")}>
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full tabular-nums",
              i <= 1 ? "bg-accent text-accent-fg" : "bg-surface-3 text-fg-muted",
            )}
            aria-current={i === 1 ? "step" : undefined}
          >
            {i + 1}
          </span>
          <span className={cn("truncate", i <= 1 ? "text-fg" : "text-fg-subtle")}>{t(s)}</span>
          {i < steps.length - 1 ? (
            <span className={cn("h-0.5 flex-1 rounded-full", i < 1 ? "bg-accent" : "bg-surface-3")} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** A collapsible checkout extra: one line when closed, its field when open. */
function Extra({
  icon,
  title,
  value,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  value?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen || undefined} className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 select-none [&::-webkit-details-marker]:hidden">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text [&_svg]:size-[18px]"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          {value ? <span className="block truncate text-sm text-fg-muted">{value}</span> : null}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/** Opens the collapsible row holding a field, then focuses it. */
function reveal(id: string) {
  const el = document.getElementById(id);
  el?.closest("details")?.setAttribute("open", "");
  el?.focus();
}

function OrderPanel({
  totalCents,
  money,
  disabled,
  hasIssues,
  summary,
  requirePhone,
  displayName,
}: {
  totalCents: number;
  money: (c: number) => string;
  disabled: boolean;
  hasIssues: boolean;
  summary: (couponCents: number) => React.ReactNode;
  requirePhone: boolean;
  displayName: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [note, setNote] = useState("");
  // A returning guest's number is remembered on this device only (prefilled after hydration).
  const phoneRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!phoneRef.current) return;
    try {
      phoneRef.current.value ||= localStorage.getItem(PHONE_KEY) ?? "";
    } catch {
      /* ignore */
    }
  }, []);
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{
    code: string;
    kind: string;
    value: number;
    minOrderCents: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const couponCents = coupon && totalCents >= coupon.minOrderCents ? couponDiscount(coupon, totalCents) : 0;
  const totalLabel = money(totalCents - couponCents);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const field =
    "w-full rounded-xl border border-border-strong bg-surface px-3.5 text-[16px] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none";
  const phoneInput = (
    <>
      <input
        id="guest-phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        ref={phoneRef}
        onChange={() => setPhoneError(null)}
        placeholder="09xx xxx xxxx"
        aria-label={requirePhone ? t("guest.phone") : t("guest.phoneOptional")}
        aria-invalid={phoneError ? true : undefined}
        aria-describedby={phoneError ? "guest-phone-error" : undefined}
        className={cn(field, "h-12 text-start tracking-wide", phoneError && "border-danger")}
      />
      {phoneError ? (
        <p id="guest-phone-error" role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {phoneError}
        </p>
      ) : null}
    </>
  );

  return (
    <>
      {requirePhone ? (
        // Food courts text the guest when the order is ready: the number is the point, keep it open.
        <section className="rounded-2xl border border-accent/30 bg-accent-soft/60 p-4">
          <label htmlFor="guest-phone" className="flex items-center gap-2 font-bold">
            <Smartphone className="size-5 text-accent-text" aria-hidden="true" />
            {t("guest.phone")}
          </label>
          <p className="mt-1 mb-3 text-sm text-fg-muted">{t("guest.phoneHint")}</p>
          {phoneInput}
        </section>
      ) : null}

      <section className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
        <Extra
          icon={<UserRound />}
          title={t("guest.nameShort")}
          value={displayName || t("guest.yourNameHint")}
        >
          <NameForm displayName={displayName} />
        </Extra>
        {!requirePhone ? (
          <Extra
            icon={<Smartphone />}
            title={t("guest.phoneOptional")}
            value={t("guest.phoneClubHint")}
            defaultOpen={!!phoneError}
          >
            {phoneInput}
          </Extra>
        ) : null}
        <Extra
          icon={<Ticket />}
          title={t("guest.coupon")}
          value={
            coupon ? (
              <span dir="ltr" className="font-mono font-bold text-accent-text">
                {coupon.code}
              </span>
            ) : (
              t("guest.couponHint")
            )
          }
        >
          {coupon ? (
            <div className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2.5">
              <span dir="ltr" className="font-mono font-bold">
                {coupon.code}
              </span>
              <span className="text-sm text-accent-text">
                {couponCents
                  ? `−${money(couponCents)}`
                  : t("guest.couponMin", { amount: money(coupon.minOrderCents) })}
              </span>
              <button
                type="button"
                onClick={() => setCoupon(null)}
                className="ms-auto grid size-8 place-items-center rounded-full hover:bg-surface"
                aria-label={t("guest.removeCoupon")}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                id="guest-coupon"
                value={couponInput}
                onChange={(e) => (setCouponInput(e.target.value.toUpperCase()), setCouponError(null))}
                dir="ltr"
                autoCapitalize="characters"
                aria-label={t("guest.coupon")}
                placeholder="NOWRUZ"
                className={cn(field, "h-12 flex-1 font-mono tracking-wider")}
              />
              <button
                type="button"
                disabled={couponInput.trim().length < 3 || pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await checkCouponAction(couponInput);
                    if (res?.ok && res.data) {
                      setCoupon(res.data);
                      setCouponInput("");
                    } else setCouponError(t("errorCodes.coupon_invalid"));
                  })
                }
                className="h-12 shrink-0 rounded-xl px-4 font-semibold ring-1 ring-border-strong disabled:opacity-40"
              >
                {t("guest.applyCoupon")}
              </button>
            </div>
          )}
          {couponError ? (
            <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
              {couponError}
            </p>
          ) : null}
        </Extra>
        <Extra
          icon={<ChefHat />}
          title={t("guest.forKitchen")}
          value={note || t("guest.orderNotePlaceholder")}
        >
          <textarea
            id="order-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            aria-label={t("guest.forKitchen")}
            placeholder={t("guest.orderNotePlaceholder")}
            className={cn(field, "resize-none py-3")}
          />
        </Extra>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
        <h2 className="mb-3 flex items-center gap-2 font-bold">
          <ReceiptText className="size-5 text-accent-text" aria-hidden="true" />
          {t("guest.summary")}
        </h2>
        {summary(couponCents)}
      </section>
      {hasIssues ? <p className="text-sm font-medium text-danger">{t("guest.fixCart")}</p> : null}
      {error ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      {/* Phones: pinned to the thumb. Desktop: the last block of the sticky checkout column. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <button
          type="button"
          disabled={disabled || pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              setPhoneError(null);
              const phone = phoneRef.current?.value.trim() ?? "";
              if (requirePhone && !phone) {
                setPhoneError(t("errorCodes.phone_required"));
                reveal("guest-phone");
                return;
              }
              const res = await placeOrderAction(note, phone, coupon?.code ?? "");
              if (res?.ok) {
                if (phone) {
                  try {
                    localStorage.setItem(PHONE_KEY, phone);
                  } catch {
                    /* ignore */
                  }
                }
                router.push("/table/orders?placed=1");
              } else if (res) {
                const msg = t.has(`errorCodes.${res.error}`)
                  ? t(`errorCodes.${res.error}`)
                  : t("errorCodes.internal");
                if (res.error === "coupon_invalid" || res.error === "coupon_min_order") {
                  setCoupon(null);
                  setCouponError(msg);
                  reveal("guest-coupon");
                } else if (res.error === "phone_required" || res.error === "invalid_phone") {
                  setPhoneError(msg);
                  reveal("guest-phone");
                } else {
                  setError(msg);
                  router.refresh();
                }
              }
            })
          }
          className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-accent ps-5 pe-2 text-lg font-bold text-accent-fg shadow-accent transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          <span className="flex items-center gap-2">
            {pending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-5 rtl:-scale-x-100" aria-hidden="true" />
            )}
            {t("guest.checkout")}
          </span>
          <span className="rounded-xl bg-white/20 px-3 py-1.5 text-base tabular-nums">{totalLabel}</span>
        </button>
      </div>
    </>
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
    <li className={cn("border-b border-border py-4 last:border-0", pending && "opacity-60")}>
      <div className="flex gap-3">
        {l.image ? (
          <img
            src={l.image}
            alt=""
            width={72}
            height={72}
            className="size-[72px] shrink-0 rounded-xl bg-surface-2 object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold">{l.name || "—"}</p>
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
            <p role="alert" className="mt-1 text-sm font-medium text-danger">
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
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-2 px-4 text-[16px] focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
              />
              <button
                type="submit"
                className="h-10 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg"
              >
                {t("save")}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNote(true)}
              className="mt-1 text-start text-sm font-medium text-fg-muted"
            >
              {l.note ? `« ${l.note} »` : `+ ${t("note")}`}
            </button>
          )}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="font-bold text-accent-text tabular-nums">
              {l.line ? money(l.line.lineTotalCents) : ""}
            </p>
            <QuantityStepper
              size="md"
              value={quantity}
              min={1}
              disabled={pending}
              onRemove={() => startTransition(async () => report(await removeItemAction(l.id)))}
              onChange={(n) =>
                startTransition(async () => {
                  setQuantity(n);
                  report(await setQuantityAction(l.id, n));
                })
              }
            />
          </div>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function NameForm({ displayName }: { displayName: string | null }) {
  const t = useTranslations("guest");
  const [state, action, pending] = useActionState(renameAction, null);
  return (
    <form action={action} className="flex gap-2">
      <input
        id="guest-name"
        name="displayName"
        defaultValue={displayName ?? ""}
        maxLength={24}
        autoComplete="given-name"
        aria-label={t("nameShort")}
        placeholder={t("namePlaceholder")}
        className="h-12 min-w-0 flex-1 rounded-xl border border-border-strong bg-surface px-3.5 text-[16px] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-12 shrink-0 rounded-xl bg-surface-2 px-5 text-sm font-bold active:bg-surface-3"
      >
        {state?.ok ? "✓" : t("save")}
      </button>
    </form>
  );
}
