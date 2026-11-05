"use client";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { BudgetGauge, Button, Card, Notice, Sheet, Stepper } from "@/components/ui";
import type { IngredientOption, RecipeSummary } from "@/lib/client/catalog-types";
import { CUISINES, type Cuisine } from "@/lib/domain/schemas";
import { formatEuros } from "@/lib/engine/money";
import type { MenuResult, SwapOption } from "@/lib/engine/optimize";
import { BudgetInput } from "./PreferencesForm";

const LEVEL = ["", "Facile", "Moyen", "Difficile"];

export function MenuSummary({
  result,
  budgetCents,
  persons,
  onBudget,
  onPersons,
  onReoptimize,
  busy,
}: {
  result: MenuResult;
  budgetCents: number;
  persons: number;
  onBudget: (c: number) => void;
  onPersons: (n: number) => void;
  onReoptimize: () => void;
  busy: boolean;
}) {
  return (
    <Card className="space-y-4" aria-labelledby="summary-title">
      <h2 id="summary-title" className="sr-only">
        Résumé du menu
      </h2>
      <BudgetGauge total={result.totalCents} budget={result.budgetCents} />
      {result.recipes.length > 0 && (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl bg-stone-50 p-2 dark:bg-stone-800">
            <dt className="text-stone-600 dark:text-stone-400">Par personne et par repas</dt>
            <dd className="text-lg font-semibold tabular-nums">≈ {formatEuros(result.perPersonPerMealCents)}</dd>
          </div>
          <div className="rounded-xl bg-stone-50 p-2 dark:bg-stone-800">
            <dt className="text-stone-600 dark:text-stone-400">Économie grâce au placard</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatEuros(result.pantrySavingsCents)}</dd>
          </div>
        </dl>
      )}
      <div aria-live="polite" className="space-y-2">
        {result.diagnostics.map((d, i) => (
          <Notice key={i} level={d.level}>
            {d.message}
          </Notice>
        ))}
      </div>
      <details className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800" open={result.status === "over-budget"}>
        <summary className="cursor-pointer font-medium">Ajuster en direct</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="live-budget" className="mb-1 block text-sm font-medium">
              Budget
            </label>
            <BudgetInput id="live-budget" value={budgetCents} onChange={onBudget} />
          </div>
          <Stepper label="Personnes" value={persons} min={1} max={12} onChange={onPersons} />
        </div>
        {result.status === "over-budget" && result.recipes.length > 0 && (
          <Button className="mt-3 w-full" onClick={onReoptimize} disabled={busy}>
            Réajuster le menu pour tenir le budget
          </Button>
        )}
      </details>
    </Card>
  );
}

export function MenuRecipes({
  result,
  recipes,
  ingredients,
  onSwap,
  onRegenerate,
  busy = false,
}: {
  result: MenuResult;
  recipes: ReadonlyMap<string, RecipeSummary>;
  ingredients: ReadonlyMap<string, IngredientOption>;
  onSwap: (slot: number) => void;
  onRegenerate?: (slot: number) => void;
  busy?: boolean;
}) {
  return (
    <ol className="space-y-3" aria-label="Plats du menu">
      {result.recipes.map((r, slot) => {
        const info = recipes.get(r.recipeId);
        return (
          <Card as="li" key={`${r.recipeId}-${slot}`} className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Repas {slot + 1}</p>
                <h3 className="text-lg font-semibold leading-tight">
                  <Link href={`/recettes/${r.recipeId}?p=${result.persons}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-emerald-600">
                    {r.name}
                  </Link>
                </h3>
                {info?.description && <p className="text-sm text-stone-600 dark:text-stone-400">{info.description}</p>}
              </div>
              <div className="text-right">
                <p className="whitespace-nowrap text-lg font-bold tabular-nums">{formatEuros(r.allocatedCents)}</p>
                <p className="whitespace-nowrap text-xs text-stone-600 dark:text-stone-400">≈ {formatEuros(r.perPersonCents)} / pers.</p>
              </div>
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-stone-600 dark:text-stone-400">
              <span>{CUISINES[r.cuisine as Cuisine] ?? r.cuisine}</span>
              <span>⏱ {r.totalMinutes} min</span>
              <span>{LEVEL[r.difficulty]}</span>
              {r.pantryIngredientIds.length > 0 && <span>🥫 {r.pantryIngredientIds.length} du placard</span>}
            </p>
            {r.skippedOptional.length > 0 && (
              <p className="text-xs text-stone-600 dark:text-stone-400">
                Facultatif non acheté pour tenir le budget : {r.skippedOptional.map((id) => ingredients.get(id)?.name ?? id).join(", ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {onRegenerate && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRegenerate(slot)}
                  disabled={busy}
                  aria-label={`Régénérer ${r.name}`}
                  className="min-h-11 gap-1.5"
                >
                  <RefreshCw aria-hidden className="size-4" strokeWidth={1.75} />
                  Régénérer ce plat
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => onSwap(slot)} aria-label={`Choisir un autre plat que ${r.name}`}>
                Choisir…
              </Button>
              <Link
                href={`/recettes/${r.recipeId}?p=${result.persons}`}
                className="inline-flex min-h-9 items-center rounded-xl px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-stone-800"
              >
                Voir la recette
              </Link>
            </div>
          </Card>
        );
      })}
    </ol>
  );
}

export function SwapSheet({
  open,
  onClose,
  current,
  options,
  loading,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current?: string;
  options: SwapOption[] | null;
  loading: boolean;
  onPick: (recipeId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={current ? `Remplacer « ${current} »` : "Remplacer"}>
      {loading && <p role="status">Recherche des alternatives…</p>}
      {options && options.length === 0 && <p>Aucune alternative compatible avec vos critères.</p>}
      {options && options.length > 0 && (
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.recipeId}>
              <button
                type="button"
                onClick={() => onPick(o.recipeId)}
                className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left ring-1 ring-stone-200 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-emerald-600 dark:ring-stone-700 dark:hover:bg-stone-800"
              >
                <span>
                  <span className="block font-medium">{o.name}</span>
                  <span className="text-sm text-stone-600 dark:text-stone-400">
                    {CUISINES[o.cuisine as Cuisine] ?? o.cuisine} · {o.totalMinutes} min
                  </span>
                </span>
                <span className="text-right">
                  <span className={`block font-semibold tabular-nums ${o.deltaCents > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-800 dark:text-emerald-300"}`}>
                    {o.deltaCents > 0 ? "+" : o.deltaCents < 0 ? "−" : "±"}
                    {formatEuros(Math.abs(o.deltaCents))}
                  </span>
                  <span className="text-xs text-stone-600 dark:text-stone-400">
                    total {formatEuros(o.newTotalCents)}
                    {!o.fitsBudget && " · hors budget"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
