import { logoUrl } from "@/server/modules/restaurants/settings";
import { PlaceInitials } from "@/components/ui/place-initials";

/** Brand header of the public booking / queue pages. */
export function PlaceHeader({
  name,
  logoKey,
  title,
}: {
  name: string;
  logoKey: string | null;
  title: string;
}) {
  const logo = logoUrl(logoKey);
  return (
    <header
      className="relative overflow-hidden px-5 pt-10 pb-16 text-white"
      style={{ background: "var(--brand-gradient)" }}
    >
      <div
        className="pointer-events-none absolute -end-16 -top-16 size-56 rounded-full bg-white/10"
        aria-hidden="true"
      />
      <div className="relative mx-auto flex max-w-md items-center gap-3">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white">
          {logo ? (
            <img src={logo} alt="" className="size-full object-contain p-1" />
          ) : (
            <PlaceInitials name={name} className="text-2xl" />
          )}
        </span>
        <div>
          <p className="text-sm opacity-85">{title}</p>
          <h1 className="text-2xl font-bold">{name}</h1>
        </div>
      </div>
    </header>
  );
}
