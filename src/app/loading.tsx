/** Écran de chargement affiché immédiatement en changeant d'onglet (et pendant le préchargement). */
export default function Loading() {
  return (
    <div role="status" aria-label="Chargement" className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-card bg-surface-2" />
        <div className="h-7 w-48 animate-pulse rounded-field bg-surface-2" />
      </div>
      <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3 rounded-card bg-surface p-4 ring-1 ring-inset ring-line">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="h-12 animate-pulse rounded-field bg-surface-2" />
          <div className="h-12 animate-pulse rounded-field bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
