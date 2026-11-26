import { UserRound } from "@/components/icons";
import { cn } from "@/lib/cn";

/** People take turns in the theme's blues, always the same one for the same name. */
const SHADES = [
  "shade-royal",
  "shade-azure",
  "shade-cyan",
  "shade-periwinkle",
  "shade-indigo",
  "shade-sky",
  "shade-steel",
  "shade-navy",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** "سارا محمدی" → "س‌م", "Hans Müller" → "HM" (letters kept apart in Persian). */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "#";
  const letters = parts.map((p) => [...p][0]!.toUpperCase());
  return letters.join(/[؀-ۿ]/.test(letters.join("")) ? "‌" : "");
}

/** A person's initials in a medallion of their own blue (a silhouette when there is no name). */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const n = (name ?? "").trim();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "shade-fill grid shrink-0 place-items-center rounded-full font-bold tracking-tight select-none",
        SHADES[hash(n || "#") % SHADES.length],
        size === "sm" ? "size-8 text-[11px]" : size === "lg" ? "size-14 text-lg" : "size-10 text-[13px]",
        className,
      )}
    >
      {/\p{L}/u.test(n) ? (
        initialsOf(n)
      ) : (
        <UserRound className={size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5"} />
      )}
    </span>
  );
}
