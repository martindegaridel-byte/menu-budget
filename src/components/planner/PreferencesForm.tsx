"use client";
import { useId, useState } from "react";
import { Button, Card, Chips, IngredientPicker, Stepper } from "@/components/ui";
import type { IngredientOption } from "@/lib/client/catalog-types";
import {
  ALLERGENS,
  CUISINES,
  DIETS,
  EQUIPMENT,
  type Allergen,
  type Cuisine,
  type Diet,
  type Difficulty,
  type Equipment,
  type Preferences,
  type Store,
} from "@/lib/domain/schemas";
import { eurosToCents } from "@/lib/engine/money";

const entries = <K extends string>(o: Record<K, string>) => Object.entries(o) as [K, string][];
const toggle = <T,>(list: readonly T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const MEAL_PRESETS = [
  [1, "Ce soir"],
  [5, "5 soirs"],
  [7, "La semaine"],
] as const;

const TIMES = [15, 20, 30, 45, 60, 90, 300] as const;
const LEVELS: [Difficulty, string][] = [
  [1, "Débutant"],
  [2, "Intermédiaire"],
  [3, "Confirmé"],
];

export function BudgetInput({ value, onChange, id }: { value: number; onChange: (cents: number) => void; id?: string }) {
  const [text, setText] = useState(() => (value / 100).toFixed(2).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const errId = useId();
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            try {
              const cents = eurosToCents(e.target.value || "0");
              if (cents < 0 || cents > 1_000_000) throw new Error();
              setError(null);
              onChange(cents);
            } catch {
              setError("Montant invalide (ex. 25 ou 25,50)");
            }
          }}
          className="input pr-8 text-lg font-semibold tabular-nums"
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-500">
          €
        </span>
      </div>
      {error && (
        <p id={errId} className="mt-1 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function PreferencesForm({
  prefs,
  onChange,
  onSubmit,
  loading,
  ingredients,
  stores,
}: {
  prefs: Preferences;
  onChange: (p: Preferences) => void;
  onSubmit: () => void;
  loading: boolean;
  ingredients: readonly IngredientOption[];
  stores: readonly Store[];
}) {
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => onChange({ ...prefs, [k]: v });
  const [advanced, setAdvanced] = useState(false);
  const budgetId = useId();
  const storeId = useId();
  const timeId = useId();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
      aria-label="Vos critères"
    >
      <Card className="space-y-4">
        <div>
          <label htmlFor={budgetId} className="mb-1 block text-sm font-medium">
            Budget total
          </label>
          <BudgetInput id={budgetId} value={prefs.budgetCents} onChange={(v) => set("budgetCents", v)} />
        </div>

        <div>
          <Stepper label="Nombre de repas (1 repas = 1 plat)" value={prefs.meals} min={1} max={21} onChange={(v) => set("meals", v)} />
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Raccourcis">
            {MEAL_PRESETS.map(([n, label]) => (
              <Button key={n} size="sm" variant={prefs.meals === n ? "primary" : "secondary"} aria-pressed={prefs.meals === n} onClick={() => set("meals", n)}>
                {label}
              </Button>
            ))}
          </div>
        </div>

        <Stepper label="Personnes par repas" value={prefs.persons} min={1} max={12} onChange={(v) => set("persons", v)} />

        <Chips
          label="Régime"
          options={entries(DIETS)}
          selected={[prefs.diet]}
          onToggle={(d: Diet) => set("diet", d)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={storeId} className="mb-1 block text-sm font-medium">
              Magasin
            </label>
            <select id={storeId} className="input" value={prefs.storeId ?? ""} onChange={(e) => set("storeId", e.target.value || undefined)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-3 self-end rounded-xl px-1">
            <input type="checkbox" className="size-5 accent-emerald-700" checked={prefs.usePantry} onChange={(e) => set("usePantry", e.target.checked)} />
            <span className="text-sm font-medium">Utiliser mon placard</span>
          </label>
        </div>
      </Card>

      <Card className="space-y-4">
        <Chips
          label="Allergies et intolérances"
          options={entries(ALLERGENS)}
          selected={prefs.allergens}
          onToggle={(a: Allergen) => set("allergens", toggle(prefs.allergens, a))}
          hint="« Lait / lactose » exclut tous les produits laitiers."
        />
        <IngredientPicker
          label="Aliments exclus"
          options={ingredients}
          selected={prefs.excludedIngredientIds}
          onChange={(ids) => set("excludedIngredientIds", ids)}
        />
      </Card>

      <Card className="space-y-4">
        <Button variant="ghost" onClick={() => setAdvanced((v) => !v)} aria-expanded={advanced} className="w-full justify-between">
          <span>Temps, niveau, équipement et goûts</span>
          <span aria-hidden>{advanced ? "▲" : "▼"}</span>
        </Button>
        {advanced && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor={timeId} className="mb-1 block text-sm font-medium">
                  Temps total max
                </label>
                <select id={timeId} className="input" value={prefs.maxTotalMinutes} onChange={(e) => set("maxTotalMinutes", Number(e.target.value))}>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {t >= 300 ? "Pas de limite" : `${t} min`}
                    </option>
                  ))}
                </select>
              </div>
              <Chips
                label="Niveau en cuisine"
                options={LEVELS.map(([v, l]) => [String(v), l] as const)}
                selected={[String(prefs.maxDifficulty)]}
                onToggle={(v) => set("maxDifficulty", Number(v) as Difficulty)}
              />
            </div>
            <Chips
              label="Équipement disponible"
              options={entries(EQUIPMENT)}
              selected={prefs.equipment}
              onToggle={(e: Equipment) => set("equipment", toggle(prefs.equipment, e))}
            />
            <Chips
              label="Cuisines préférées"
              options={entries(CUISINES)}
              selected={prefs.likedCuisines}
              onToggle={(c: Cuisine) => set("likedCuisines", toggle(prefs.likedCuisines, c))}
            />
            <IngredientPicker
              label="Aliments favoris"
              options={ingredients}
              selected={prefs.favoriteIngredientIds}
              onChange={(ids) => set("favoriteIngredientIds", ids)}
            />
          </div>
        )}
      </Card>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? "Composition en cours…" : "Composer mes repas"}
      </Button>
    </form>
  );
}
