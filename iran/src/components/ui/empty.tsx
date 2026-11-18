import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Nothing to show yet: a medallion in the section's blue over a faint khatam lattice, a line of
 * text, and optionally a title and an action. Works in server and client components alike.
 */
export function Empty({
  children,
  icon,
  title,
  action,
  size = "md",
  className,
}: {
  children?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-dashed border-border-strong bg-surface/60 text-center",
        size === "sm" ? "px-4 py-6" : size === "lg" ? "px-6 py-14" : "px-6 py-10",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="texture-khatam texture-fade-b [--tex-color:var(--shade,var(--accent))] [--tex-opacity:0.07] [--tex-size:52px]"
      />
      <span
        className={cn(
          "shade-soft relative mx-auto grid place-items-center rounded-2xl ring-1 ring-border",
          size === "sm"
            ? "size-10 [&_svg]:size-[1.1rem]"
            : size === "lg"
              ? "size-14 [&_svg]:size-6"
              : "size-12 [&_svg]:size-5",
        )}
      >
        {icon ?? <Inbox aria-hidden="true" />}
      </span>
      {title ? <p className="relative mt-3 font-bold text-fg">{title}</p> : null}
      {children ? (
        <p
          className={cn("relative mx-auto max-w-sm text-sm leading-6 text-fg-muted", title ? "mt-1" : "mt-3")}
        >
          {children}
        </p>
      ) : null}
      {action ? <div className="relative mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
