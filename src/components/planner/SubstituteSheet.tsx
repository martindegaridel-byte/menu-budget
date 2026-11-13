"use client";
import { ArrowRight, ChevronLeft, PiggyBank, Replace, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ICON_STROKE } from "@/components/ds/cn";
import { Sheet } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { CHEAPER_PCT, cheaperSuggestions, closeness, perUnitLabel, priceDeltaPct, unitPrices } from "@/lib/client/substitutes";
import { AISLES } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";

/** Remplacer un ingrédient d'un plat : choix de l'ingrédient, puis du remplaçant (même unité). */
export function SubstituteSheet({
  open,
  onClose,
  recipeName,
  ingredientIds,
  substituted,
  ingredients,
  excluded,
  storeId,
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
  /** Magasin du menu : prix des remplaçants. */
  storeId?: string;
  onPick: (from: string, to: string) => void;
  onReset: (from: string) => void;
}) {
  const [from, setFrom] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const source = from ? ingredients.get(from) : undefined;
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    if (!open || !storeId) return;
    let alive = true;
    api
      .getPrices(storeId)
      .then((r) => alive && setPrices(unitPrices(r.prices)))
      .catch(() => undefined); // sans prix, la liste reste utilisable
    return () => {
      alive = false;
    };
  }, [open, storeId]);

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
  const suggestions = useMemo(() => (source && !q.trim() ? cheaperSuggestions(source, options, prices) : []), [source, q, options, prices]);
  const rest = options.filter((o) => !suggestions.includes(o));

  const priceInfo = (o: IngredientOption) => {
    const unit = prices.get(o.id);
    if (unit === undefined || !source) return null;
    const label = perUnitLabel(unit, o.unit);
    const delta = priceDeltaPct(source.id, o.id, prices);
    return (
      <span className="shrink-0 text-right text-caption tabular-nums">
        <span className="block text-muted">
          {formatEuros(label.cents)}/{label.per}
        </span>
        {delta !== null && delta !== 0 && (
          <span className={delta <= CHEAPER_PCT ? "font-medium text-accent-text" : "text-subtle"}>
            {delta > 0 ? "+" : "−"}
            {Math.abs(delta)} %
          </span>
        )}
      </span>
    );
  };
  const option = (o: IngredientOption) => (
    <li key={o.id}>
      <button
        type="button"
        onClick={() => {
          onPick(source!.id, o.id);
          close();
        }}
        className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-field px-3 text-left hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{o.name}</span>
          <span className="text-caption text-muted">{AISLES[o.aisle]}</span>
        </span>
        {priceInfo(o)}
        <ArrowRight aria-hidden className="size-4 shrink-0 text-subtle" strokeWidth={ICON_STROKE} />
      </button>
    </li>
  );

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
          {suggestions.length > 0 && (
            <section aria-labelledby="sub-cheaper" className="rounded-field bg-surface-2 p-2 ring-1 ring-inset ring-line">
              <h3 id="sub-cheaper" className="flex items-center gap-1.5 px-1 pb-1 text-caption font-semibold text-accent-text">
                <PiggyBank aria-hidden className="size-4" strokeWidth={ICON_STROKE} /> Proches et moins chers
              </h3>
              <ul className="space-y-1">{suggestions.map(option)}</ul>
            </section>
          )}
          <ul className="space-y-1.5" aria-label="Autres remplaçants">
            {rest.map(option)}
          </ul>
          {options.length === 0 && <p className="text-body-sm text-muted">Aucun remplaçant de même unité ne correspond.</p>}
          <p className="text-caption text-subtle">Même quantité, même unité ; le prix du menu est recalculé. Prix indicatifs dans votre magasin, écart par rapport à l&apos;ingrédient remplacé.</p>
        </div>
      )}
    </Sheet>
  );
}
