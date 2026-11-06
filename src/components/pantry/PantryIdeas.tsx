"use client";
import { ChevronRight, Lightbulb, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Chip, CollapsibleCard } from "@/components/ds";
import { ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import { CUISINES, PreferencesSchema, type Cuisine } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { PantrySuggestion } from "@/lib/engine/suggest";
import { DEFAULT_PREFERENCES } from "@/components/planner/Planner";

const MAX = 3;

/** « Que faire avec ce que j'ai ? » : choisir 1 à 3 produits du placard, voir les recettes qui les utilisent. */
export function PantryIdeas({ stock }: { stock: { ing: IngredientOption; urgent: boolean }[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [results, setResults] = useState<PantrySuggestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const names = new Map(stock.map((s) => [s.ing.id, s.ing.name]));
  const sorted = [...stock].sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.ing.name.localeCompare(b.ing.name, "fr"));

  const search = async () => {
    setBusy(true);
    try {
      let prefs = DEFAULT_PREFERENCES;
      try {
        const parsed = PreferencesSchema.safeParse(JSON.parse(localStorage.getItem("mb:prefs") ?? "null"));
        if (parsed.success) prefs = parsed.data;
      } catch {
        /* préférences par défaut */
      }
      setResults((await api.suggestFromPantry({ ...prefs, maxTotalMinutes: Math.max(prefs.maxTotalMinutes, 60) }, picked)).suggestions);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleCard icon={Lightbulb} title="Que faire avec ce que j'ai ?" summary="Choisissez 1 à 3 produits : on trouve les recettes qui les utilisent." defaultOpen={stock.some((s) => s.urgent)}>
      {stock.length === 0 ? (
        <p className="text-body-sm text-muted">Ajoutez des ingrédients à votre placard pour obtenir des idées.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-body-sm text-muted">Choisissez jusqu&apos;à {MAX} produits ; ceux qui périment bientôt sont en premier.</p>
          <div className="flex flex-wrap gap-2">
            {sorted.map(({ ing, urgent }) => {
              const on = picked.includes(ing.id);
              return (
                <Chip
                  key={ing.id}
                  state={on ? "selected" : "neutral"}
                  disabled={!on && picked.length >= MAX}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== ing.id) : [...picked, ing.id])}
                >
                  {ing.name}
                  {urgent && <span className="sr-only"> (périme bientôt)</span>}
                  {urgent && <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-warn align-middle" />}
                </Chip>
              );
            })}
          </div>
          <Button icon={Search} fullWidth loading={busy} disabled={picked.length === 0} onClick={() => void search()}>
            Trouver des recettes
          </Button>
          {results && (
            <div aria-live="polite">
              {results.length === 0 ? (
                <p className="text-body-sm text-muted">Aucune recette compatible avec vos critères n&apos;utilise ces produits.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {results.map((r) => (
                    <li key={r.recipeId}>
                      <Link href={`/recettes/${r.recipeId}`} className="focus-ring flex min-h-16 items-center gap-3 rounded-field px-1 py-2 hover:bg-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{r.name}</span>
                          <span className="text-caption text-muted">
                            {CUISINES[r.cuisine as Cuisine] ?? r.cuisine} · {r.totalMinutes} min · utilise {r.uses.map((id) => names.get(id) ?? id).join(", ").toLowerCase()}
                          </span>
                          {r.missing.length > 0 && <span className="block text-caption text-subtle">À acheter : {r.missing.length} produit{r.missing.length > 1 ? "s" : ""}</span>}
                        </span>
                        <Badge tone={r.extraCents === 0 ? "accent" : "neutral"}>{r.extraCents === 0 ? "Rien à acheter" : `+ ${formatEuros(r.extraCents)}`}</Badge>
                        <ChevronRight aria-hidden className="size-4 text-subtle" strokeWidth={ICON_STROKE} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </CollapsibleCard>
  );
}
