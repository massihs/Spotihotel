import { cn } from "@/lib/cn";

/** Words that say what the place is, not which one ("Restaurant Demo" → "D"). */
const GENERIC =
  /^(restaurant|restaurante|café|cafe|coffee|bar|bistro|hotel|hôtel|le|la|les|the|رستوران|کافه|کافی‌شاپ|هتل|مطعم|مقهى|فندق)$/i;

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !GENERIC.test(w));
  const list = kept.length ? kept : words;
  const first = [...(list[0] ?? "?")][0]!;
  // Two letters read well in Latin script; Persian and Arabic letters would join, so one.
  if (!/[A-Za-z]/.test(first)) return first;
  const second = list[1] ? [...list[1]][0]! : "";
  return (first + (/[A-Za-z]/.test(second) ? second : "")).toUpperCase();
}

/** A place without a logo: its initials on its brand colour, filling the logo frame. */
export function PlaceInitials({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-full place-items-center bg-gradient-to-br from-accent to-accent-hover font-black text-accent-fg",
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
