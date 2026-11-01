"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Toast } from "@/components/ui/toast";
import type { PublicMenu, PublicProduct } from "@/server/modules/menu/public";
import { ProductSheet } from "./product-sheet";

export type CartSummary = { itemCount: number; totalCents: number };

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function useMoney(currency: string) {
  const format = useFormatter();
  return useCallback(
    (cents: number) => format.number(cents / 100, { style: "currency", currency }),
    [format, currency],
  );
}

export function MenuApp({
  menu,
  currency,
  initialCart,
  header,
}: {
  menu: PublicMenu;
  currency: string;
  initialCart: CartSummary;
  header: ReactNode;
}) {
  const t = useTranslations("guest");
  const money = useMoney(currency);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [cart, setCart] = useState(initialCart);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const [active, setActive] = useState<string | null>(menu.categories[0]?.id ?? null);
  const chipsRef = useRef<HTMLDivElement>(null);

  const q = normalize(query.trim());
  const matches = useCallback(
    (p: PublicProduct) =>
      !q || normalize(`${p.name} ${p.description ?? ""} ${p.ingredients ?? ""}`).includes(q),
    [q],
  );
  const sections = useMemo(
    () =>
      menu.categories
        .map((c) => ({ ...c, items: c.productIds.map((id) => menu.products[id]!).filter(matches) }))
        .filter((c) => c.items.length > 0),
    [menu, matches],
  );
  const featured = useMemo(
    () => (q ? [] : Object.values(menu.products).filter((p) => p.isFeatured)),
    [menu, q],
  );

  // Scroll-spy: highlight the category currently on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.getAttribute("data-category"));
      },
      { rootMargin: "-120px 0px -65% 0px" },
    );
    document.querySelectorAll("[data-category]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    chip?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  const open = openId ? menu.products[openId] : null;

  return (
    <>
      {header}
      <div className="sticky top-0 z-20 border-b border-border bg-bg/95 pt-2 pb-2 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
        <div className="px-4">
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search")}
              enterKeyHint="search"
              className="h-11 w-full rounded-xl border border-border bg-surface ps-10 pe-3 text-[16px] placeholder:text-fg-subtle focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none"
            />
          </label>
        </div>
        {!q ? (
          <nav aria-label={t("categoriesNav")}>
            <div ref={chipsRef} className="no-scrollbar mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5">
              {menu.categories.map((c) => (
                <a
                  key={c.id}
                  href={`#c-${c.id}`}
                  data-chip={c.id}
                  aria-current={active === c.id ? "true" : undefined}
                  onClick={() => setActive(c.id)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                    active === c.id ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted hover:text-fg",
                  )}
                >
                  {c.name}
                </a>
              ))}
            </div>
          </nav>
        ) : null}
      </div>

      <main className="pb-32">
        {featured.length > 0 ? (
          <section className="pt-5" aria-labelledby="featured-title">
            <h2 id="featured-title" className="px-4 text-lg font-semibold">
              {t("featured")}
            </h2>
            <ul className="no-scrollbar mt-3 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
              {featured.map((p) => (
                <li key={p.id} className="w-56 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="block w-full overflow-hidden rounded-2xl border border-border bg-surface text-start"
                  >
                    <ProductImage product={p} size="md" className="aspect-[4/3] w-full" eager />
                    <div className="p-3">
                      <p className="truncate font-medium">{p.name}</p>
                      <Price product={p} money={money} soldOutLabel={t("soldOut")} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sections.length === 0 ? (
          <p className="px-4 py-16 text-center text-fg-muted">{t("noResults", { q: query.trim() })}</p>
        ) : (
          sections.map((c, ci) => (
            <section
              key={c.id}
              id={`c-${c.id}`}
              data-category={c.id}
              className="scroll-mt-32 pt-6"
              aria-labelledby={`h-${c.id}`}
            >
              <h2 id={`h-${c.id}`} className="px-4 text-lg font-semibold">
                {c.name}
              </h2>
              {c.description ? <p className="px-4 text-sm text-fg-muted">{c.description}</p> : null}
              <ul className="mt-2 divide-y divide-border">
                {c.items.map((p, pi) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(p.id)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-4 text-start active:bg-surface-2",
                        !p.isAvailable && "opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{p.name}</p>
                        {p.description ? (
                          <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{p.description}</p>
                        ) : null}
                        <div className="mt-1.5">
                          <Price product={p} money={money} soldOutLabel={t("soldOut")} />
                        </div>
                      </div>
                      {p.images[0] ? (
                        <ProductImage
                          product={p}
                          size="sm"
                          className="size-24 shrink-0 rounded-xl"
                          eager={ci === 0 && pi < 3}
                        />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>

      {cart.itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Link
            href="/table/cart"
            className="flex h-14 items-center justify-between rounded-2xl bg-accent px-5 font-semibold text-accent-fg shadow-2xl active:scale-[0.99]"
          >
            <span className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-accent-fg/20 text-sm tabular-nums">
                {cart.itemCount}
              </span>
              {t("viewCart")}
            </span>
            <span className="tabular-nums">{money(cart.totalCents)}</span>
          </Link>
        </div>
      ) : null}

      {open ? (
        <ProductSheet
          product={open}
          currency={currency}
          onClose={() => setOpenId(null)}
          onAdded={(summary) => {
            setCart(summary);
            setOpenId(null);
            setToast(t("added"));
          }}
        />
      ) : null}
      <Toast
        message={toast}
        onDone={clearToast}
        duration={2500}
        className="bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
      />
    </>
  );
}

function Price({
  product: p,
  money,
  soldOutLabel,
}: {
  product: PublicProduct;
  money: (c: number) => string;
  soldOutLabel: string;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span className={cn("font-semibold tabular-nums", p.compareAtPriceCents && "text-accent")}>
        {money(p.priceCents)}
      </span>
      {p.compareAtPriceCents ? (
        <s className="text-fg-subtle tabular-nums">{money(p.compareAtPriceCents)}</s>
      ) : null}
      {!p.isAvailable ? (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
          {soldOutLabel}
        </span>
      ) : null}
    </span>
  );
}

export function ProductImage({
  product,
  size,
  className,
  eager,
}: {
  product: PublicProduct;
  size: "sm" | "md" | "lg";
  className?: string;
  eager?: boolean;
}) {
  const img = product.images[0];
  if (!img) return <div className={cn("bg-surface-2", className)} />;
  return (
    <img
      src={img[size]}
      srcSet={`${img.sm} 320w, ${img.md} 640w, ${img.lg} 1280w`}
      sizes={size === "sm" ? "96px" : size === "md" ? "224px" : "100vw"}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      className={cn("bg-surface-2 bg-cover object-cover", className)}
      style={img.placeholder ? { backgroundImage: `url(${img.placeholder})` } : undefined}
    />
  );
}
