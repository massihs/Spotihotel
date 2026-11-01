"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const DialogContext = createContext<{ close: () => void } | null>(null);

/** Lets content (e.g. a form) close its parent dialog after a successful action. */
export function useDialog() {
  return use(DialogContext);
}

/**
 * Accessible modal built on the native <dialog> element:
 * focus trap, Escape to close, inert background and top-layer rendering come for free.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  size = "md",
}: {
  trigger: (open: () => void) => ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      {trigger(show)}
      <dialog
        ref={ref}
        onClose={close}
        onClick={(e) => {
          if (e.target === ref.current) close(); // backdrop click
        }}
        className={cn(
          "m-auto w-[calc(100%-2rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
          size === "lg" ? "max-w-2xl" : "max-w-md",
        )}
      >
        {open ? (
          <DialogContext value={{ close }}>
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="×"
                className="-me-1 grid size-8 place-items-center rounded-lg text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="max-h-[75dvh] overflow-y-auto px-5 py-5">{children}</div>
          </DialogContext>
        ) : null}
      </dialog>
    </>
  );
}
