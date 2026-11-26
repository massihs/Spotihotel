import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "accent" | "brass" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent bg-[image:var(--brand-gradient)] text-accent-fg hover:brightness-110 shadow-none",
  accent: "bg-accent bg-[image:var(--brand-gradient)] text-accent-fg hover:brightness-110 shadow-none",
  /** Gold, for the call to action on the night-blue panels. */
  brass:
    "bg-[var(--brass)] bg-[image:var(--brass-gradient)] text-[color:var(--brass-ink)] hover:brightness-105 shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_12px_30px_-12px_var(--brass-glow)]",
  // Outlined tiles: the line is the element, the fill a tile inside it (globals.css, .k-frame).
  secondary: "k-frame text-fg [--k-line:var(--border)]",
  outline: "k-frame text-fg [--k-line:var(--border-strong)]",
  ghost: "text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

/** Kâshi: every button is an octagonal tile (cut corners), larger cut on larger buttons. */
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 k-cut k-sm",
  md: "h-10 px-4 text-sm gap-2 k-cut",
  lg: "h-12 px-6 text-base gap-2 k-cut",
  xl: "h-14 px-6 text-base gap-2 k-cut k-lg",
};
/** The fine gold line inside the solid buttons that carry the main action. */
const glazed: Partial<Record<ButtonVariant, string>> = { primary: "k-glaze", accent: "k-glaze" };

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center font-semibold whitespace-nowrap select-none",
    "transition-[background-color,box-shadow,transform,opacity,color] duration-150 active:scale-[0.98]",
    // The ring is drawn inside: a cut tile would clip one drawn outside.
    "focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)]",
    "disabled:pointer-events-none disabled:opacity-40",
    variants[variant],
    sizes[size],
    size !== "sm" ? glazed[variant] : undefined,
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}
