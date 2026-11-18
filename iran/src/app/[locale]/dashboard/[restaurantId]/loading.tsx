/** Instant feedback while a dashboard page loads: header, stat tiles and a list placeholder. */
export default function Loading() {
  return (
    <div aria-busy="true" className="animate-fade-in">
      <div className="mb-8 space-y-2">
        <div className="skeleton h-8 w-52 rounded-full" />
        <div className="skeleton h-4 w-72 max-w-full rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl shadow-[var(--shadow-soft)]" />
        ))}
      </div>
      <div className="mt-6 space-y-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-soft)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
