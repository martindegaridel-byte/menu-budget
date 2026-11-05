import type { Nutrition } from "@/lib/domain/schemas";
import { cn } from "@/components/ds/cn";

/** Macros d'une portion : barre de répartition de l'énergie + valeurs. */
export function MacroBar({ n, compact = false, className }: { n: Nutrition; compact?: boolean; className?: string }) {
  const e = Math.max(1, 4 * n.protein + 4 * n.carbs + 9 * n.fat);
  const parts = [
    { key: "P", label: "Protéines", g: n.protein, share: (4 * n.protein) / e, color: "bg-sky-400" },
    { key: "G", label: "Glucides", g: n.carbs, share: (4 * n.carbs) / e, color: "bg-amber-300" },
    { key: "L", label: "Lipides", g: n.fat, share: (9 * n.fat) / e, color: "bg-rose-400" },
  ];
  return (
    <div className={cn("space-y-1.5", className)}>
      <div aria-hidden className={cn("flex overflow-hidden rounded-full bg-surface-3", compact ? "h-1" : "h-1.5")}>
        {parts.map((p) => (
          <span key={p.key} className={p.color} style={{ width: `${Math.round(p.share * 100)}%` }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-caption tabular-nums text-muted">
        <span className="font-medium text-fg">{n.kcal} kcal</span>
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn("size-1.5 rounded-full", p.color)} />
            <span className="sr-only">{p.label} :</span>
            <span aria-hidden>{p.key}</span> {p.g} g
          </span>
        ))}
      </p>
    </div>
  );
}
