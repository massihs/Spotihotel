import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/cn";

/**
 * The picture of a dish that has none: a tile in the hotel's colour with the Persian star lattice
 * and the dish's category icon in a medallion, so a menu without photos still looks composed
 * (guest menu, menu manager, till).
 */
export function DishTile({
  icon,
  className,
  size = "md",
}: {
  icon: string | null | undefined;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "relative isolate grid place-items-center overflow-hidden bg-[linear-gradient(150deg,var(--brand-100),var(--brand-50)_55%,var(--brand-100))]",
        className,
      )}
      aria-hidden="true"
    >
      <span className="texture-khatam [--tex-color:var(--brand-600)] [--tex-opacity:0.13] [--tex-size:44px]" />
      <span
        className={cn(
          "relative grid place-items-center rounded-full bg-surface/90 text-brand-700 shadow-[0_4px_14px_-6px_oklch(0.3_var(--brand-c)_var(--brand-h)/0.35)] ring-1 ring-brand-200",
          size === "sm"
            ? "size-9 [&_svg]:size-4"
            : size === "lg"
              ? "size-16 [&_svg]:size-7"
              : "size-12 [&_svg]:size-5",
        )}
      >
        <CategoryIcon icon={icon ?? ""} />
      </span>
    </span>
  );
}
