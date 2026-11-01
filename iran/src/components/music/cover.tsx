import { Music } from "lucide-react";
import { cn } from "@/lib/cn";

/** Album / station artwork; a gradient tile in the station color when there is no image. */
export function Cover({
  src,
  color = "#7c3aed",
  alt = "",
  className,
  rounded = "rounded-md",
}: {
  src?: string | null;
  color?: string;
  alt?: string;
  className?: string;
  rounded?: string;
}) {
  if (src)
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn(
          "aspect-square shrink-0 object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
          rounded,
          className,
        )}
      />
    );
  return (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      className={cn(
        "grid aspect-square shrink-0 place-items-center text-white/85 shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
        rounded,
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${color}, #191414 85%)` }}
    >
      <Music className="size-[38%]" aria-hidden="true" />
    </span>
  );
}

/** Four covers in a 2×2 grid (Spotify playlist art). Falls back to a single cover. */
export function Mosaic({
  covers,
  color,
  className,
  rounded = "rounded-md",
}: {
  covers: (string | null)[];
  color?: string;
  className?: string;
  rounded?: string;
}) {
  const imgs = covers.filter(Boolean) as string[];
  if (imgs.length < 4) return <Cover src={imgs[0]} color={color} className={className} rounded={rounded} />;
  return (
    <span
      className={cn(
        "grid aspect-square shrink-0 grid-cols-2 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
        rounded,
        className,
      )}
    >
      {imgs.slice(0, 4).map((s, i) => (
        <img key={i} src={s} alt="" className="size-full object-cover" />
      ))}
    </span>
  );
}

export function Equalizer({ on, className }: { on: boolean; className?: string }) {
  return (
    <span className={cn("flex h-3.5 items-end gap-[3px]", className)} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full bg-current",
            on ? "animate-[eq_0.9s_ease-in-out_infinite]" : "h-1",
          )}
          style={on ? { animationDelay: `${i * 0.13}s` } : undefined}
        />
      ))}
    </span>
  );
}
