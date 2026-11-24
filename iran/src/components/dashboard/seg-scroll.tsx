"use client";

import { useEffect } from "react";

/**
 * Rows of tabs wider than the screen (`.seg`): the current tab is brought to the middle, the
 * edges fade where more tabs hide, and the mouse wheel scrolls the row sideways. Applied to every
 * row on the page, including those drawn after a navigation.
 */
export function SegScroll() {
  useEffect(() => {
    const seen = new WeakSet<HTMLElement>();
    const lastActive = new WeakMap<HTMLElement, Element | null>();
    const rtl = () => document.documentElement.dir === "rtl";

    const update = (el: HTMLElement) => {
      const max = el.scrollWidth - el.clientWidth;
      const pos = Math.abs(el.scrollLeft);
      el.toggleAttribute("data-more-start", max > 2 && pos > 2);
      el.toggleAttribute("data-more-end", max > 2 && max - pos > 2);
    };
    const center = (el: HTMLElement) => {
      const active = el.querySelector('[aria-current="page"], [aria-current="true"], [aria-selected="true"]');
      if (active === lastActive.get(el)) return;
      lastActive.set(el, active);
      if (!active || el.scrollWidth <= el.clientWidth) return;
      const a = active.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      el.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
    };
    const attach = (el: HTMLElement) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.addEventListener("scroll", () => update(el), { passive: true });
      el.addEventListener(
        "wheel",
        (e) => {
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          const max = el.scrollWidth - el.clientWidth;
          if (max <= 2) return;
          const step = (rtl() ? -1 : 1) * e.deltaY;
          const pos = Math.abs(el.scrollLeft);
          const forward = (rtl() ? -step : step) > 0;
          // At the end of the row, the wheel scrolls the page again.
          if ((forward && max - pos <= 2) || (!forward && pos <= 2)) return;
          e.preventDefault();
          el.scrollLeft += step;
        },
        { passive: false },
      );
    };

    let frame = 0;
    const scan = () => {
      frame = 0;
      for (const el of document.querySelectorAll<HTMLElement>(".seg")) {
        attach(el);
        center(el);
        update(el);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    scan();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-current"],
    });
    window.addEventListener("resize", schedule);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
