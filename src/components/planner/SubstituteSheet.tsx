"use client";
import { ArrowRight, ChevronLeft, Replace, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ICON_STROKE } from "@/components/ds/cn";
import { Sheet } from "@/components/ui";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { AISLES } from "@/lib/domain/schemas";

/** Proximité d'un remplaçant : même famille (base, viande, poisson…), même origine, même rayon. */
function closeness(a: IngredientOption, b: IngredientOption): number {
  const shared = (a.tags ?? []).filter((t) => (b.tags ?? []).includes(t)).length;
  return shared * 4 + (a.animal && a.animal === b.animal ? 2 : 0) + (a.aisle === b.aisle ? 1 : 0);
}

/** Remplacer un ingrédient d'un plat : choix de l'ingrédient, puis du remplaçant (même unité). */
export function SubstituteSheet({
  open,
  onClose,
  recipeName,
  ingredientIds,
  substituted,
  ingredients,
  excluded,
  onPick,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  recipeName?: string;
  ingredientIds: readonly string[];
  substituted: readonly { from: string; to: string }[];
  ingredients: ReadonlyMap<string, IngredientOption>;
  excluded: ReadonlySet<string>;
  onPick: (from: string, to: string) => void;
  onReset: (from: string) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const source = from ? ingredients.get(from) : undefined;

  const options = useMemo(() => {
    if (!source) return [];
    const query = q.trim().toLowerCase();
    return [...ingredients.values()]
      .filter((i) => i.id !== source.id && i.unit === source.unit && !i.staple && !excluded.has(i.id) && !ingredientIds.includes(i.id))
      .filter((i) => !query || i.name.toLowerCase().includes(query))
      .map((i) => ({ i, score: closeness(source, i) }))
      .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name, "fr"))
      .map((x) => x.i)
      .slice(0, query ? 40 : 24);
  }, [source, q, ingredients, excluded, ingredientIds]);

  const close = () => {
    setFrom(null);
    setQ("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={close} title={recipeName ? `Remplacer dans « ${recipeName} »` : "Remplacer un ingrédient"}>
      {!source ? (
        <ul className="space-y-2">
          {ingredientIds.map((id) => {
            const sub = substituted.find((s) => s.from === id);
            const ing = ingredients.get(id);
            if (!ing) return null;
            return (
              <li key={id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFrom(id)}
                  className="focus-ring flex min-h-14 flex-1 items-center justify-between gap-3 rounded-field bg-surface-2 px-3 text-left ring-1 ring-inset ring-line hover:bg-surface-3"
                >
                  <span>
                    <span className="block font-medium">{sub ? ingredients.get(sub.to)?.name : ing.name}</span>
                    <span className="text-caption text-muted">{sub ? `remplace ${ing.name}` : AISLES[ing.aisle]}</span>
                  </span>
                  <Replace aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />
                </button>
                {sub && (
                  <button
                    type="button"
                    onClick={() => onReset(id)}
                    aria-label={`Revenir à ${ing.name}`}
                    className="focus-ring grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
                  >
                    <RotateCcw aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={() => setFrom(null)} className="focus-ring -ml-1 inline-flex min-h-11 items-center gap-1 rounded-field px-1 text-body-sm font-medium text-muted hover:text-fg">
            <ChevronLeft aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Autre ingrédient
          </button>
          <p className="text-body-sm">
            Remplacer <span className="font-semibold">{source.name}</span> par :
          </p>
          <div className="relative">
            <label htmlFor="sub-search" className="sr-only">
              Rechercher un remplaçant
            </label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" strokeWidth={ICON_STROKE} />
            <input id="sub-search" type="search" className="input pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="space-y-1.5">
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(source.id, o.id);
                    close();
                  }}
                  className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-field px-3 text-left hover:bg-surface-2"
                >
                  <span>
                    <span className="block font-medium">{o.name}</span>
                    <span className="text-caption text-muted">{AISLES[o.aisle]}</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 text-subtle" strokeWidth={ICON_STROKE} />
                </button>
              </li>
            ))}
          </ul>
          {options.length === 0 && <p className="text-body-sm text-muted">Aucun remplaçant de même unité ne correspond.</p>}
          <p className="text-caption text-subtle">Même quantité, même unité ; le prix du menu est recalculé.</p>
        </div>
      )}
    </Sheet>
  );
}
