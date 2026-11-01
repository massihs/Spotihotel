/** Instant feedback while a dashboard page loads: header, stat tiles and a list placeholder. */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade-in">
      <div className="mb-8 space-y-2">
        <div className="h-8 w-52 animate-pulse rounded-full bg-surface-3" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-full bg-surface-2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface shadow-[var(--shadow-soft)]" />
        ))}
      </div>
      <div className="mt-6 space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-soft)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
