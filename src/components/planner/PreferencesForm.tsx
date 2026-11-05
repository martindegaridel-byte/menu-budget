"use client";
import { ArrowRight, Ban, ChefHat, Clock, Loader2, Package, Sparkles, Store as StoreIcon, Wallet } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { CollapsibleCard, Segmented } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { Chips, IngredientPicker, Stepper } from "@/components/ui";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { Profile } from "@/lib/domain/profile";
import { CUISINES, DIETS, EQUIPMENT, type Cuisine, type Diet, type Difficulty, type Equipment, type Preferences, type Store } from "@/lib/domain/schemas";
import { divideCeil, eurosToCents, formatEuros } from "@/lib/engine/money";

const entries = <K extends string>(o: Record<K, string>) => Object.entries(o) as [K, string][];
const toggle = <T,>(list: readonly T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const DIET_SHORT: Record<Diet, string> = {
  omnivore: "Omnivore",
  flexitarien: "Flexi",
  pescetarien: "Pescé",
  vegetarien: "Végé",
  vegan: "Vegan",
};
const LEVELS: { value: `${Difficulty}`; label: string }[] = [
  { value: "1", label: "Débutant" },
  { value: "2", label: "Intermédiaire" },
  { value: "3", label: "Confirmé" },
];
const TIMES = [15, 20, 30, 45, 60, 90, 300] as const;
const BUDGET_MAX_CENTS = 15_000;

/** Champ budget en euros (saisie libre « 25 » ou « 25,50 »). */
export function BudgetInput({ value, onChange, id, large = false }: { value: number; onChange: (cents: number) => void; id?: string; large?: boolean }) {
  const [text, setText] = useState(() => (value / 100).toFixed(2).replace(".", ","));
  const [lastValue, setLastValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const errId = useId();
  // Valeur modifiée ailleurs (curseur) : on resynchronise le texte.
  if (value !== lastValue) {
    setLastValue(value);
    setText((value / 100).toFixed(value % 100 === 0 ? 0 : 2).replace(".", ","));
  }
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
              setLastValue(cents);
              onChange(cents);
            } catch {
              setError("Montant invalide (ex. 25 ou 25,50)");
            }
          }}
          className={cn("input pr-10 font-numeric font-semibold tabular-nums", large && "min-h-16 rounded-card text-[34px] leading-none tracking-tight")}
        />
        <span aria-hidden className={cn("pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-muted", large && "text-title-2")}>
          €
        </span>
      </div>
      {error && (
        <p id={errId} className="mt-1.5 text-caption text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

function Field({ label, htmlFor, icon: Icon, children }: { label: string; htmlFor?: string; icon?: typeof Clock; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-1.5 text-caption font-medium text-muted">
        {Icon && <Icon aria-hidden className="size-4" strokeWidth={ICON_STROKE} />}
        {label}
      </label>
      {children}
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
  permanent,
}: {
  permanent?: Profile;
  prefs: Preferences;
  onChange: (p: Preferences) => void;
  onSubmit: () => void;
  loading: boolean;
  ingredients: readonly IngredientOption[];
  stores: readonly Store[];
}) {
  const set = <K extends keyof Preferences>(k: K, v: Preferences[K]) => onChange({ ...prefs, [k]: v });
  const budgetId = useId();
  const sliderId = useId();
  const storeId = useId();
  const timeId = useId();
  const perMeal = divideCeil(prefs.budgetCents, Math.max(1, prefs.meals * prefs.persons));
  const nExcluded = (permanent?.excludedIngredientIds.length ?? 0) + prefs.excludedIngredientIds.length;
  const nAllergens = permanent?.allergens.length ?? 0;
  const timeLabel = prefs.maxTotalMinutes >= 300 ? "sans limite" : `${prefs.maxTotalMinutes} min max`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-3"
      aria-label="Vos critères"
    >
      {/* 1. Budget & repas */}
      <CollapsibleCard
        step={1}
        icon={Wallet}
        title="Budget et repas"
        defaultOpen
        summary={`${formatEuros(prefs.budgetCents)} · ${prefs.meals} repas · ${prefs.persons} pers. · ≈ ${formatEuros(perMeal)} / repas`}
      >
        <div className="space-y-5">
          <div>
            <label htmlFor={budgetId} className="mb-2 block text-caption font-medium text-muted">
              Budget total pour la période
            </label>
            <BudgetInput id={budgetId} large value={prefs.budgetCents} onChange={(v) => set("budgetCents", v)} />
            <label htmlFor={sliderId} className="sr-only">
              Ajuster le budget
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={BUDGET_MAX_CENTS}
              step={100}
              value={Math.min(prefs.budgetCents, BUDGET_MAX_CENTS)}
              onChange={(e) => set("budgetCents", Number(e.target.value))}
              aria-valuetext={formatEuros(prefs.budgetCents)}
              className="mt-4 h-11 w-full cursor-pointer accent-[var(--mb-accent)]"
            />
            <p className="flex items-baseline justify-between text-body-sm text-muted" aria-live="polite">
              <span>Soit environ</span>
              <span>
                <span className="font-numeric text-title-3 font-semibold tabular-nums text-accent-text">≈ {formatEuros(perMeal)}</span> / repas / pers.
              </span>
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Stepper
              label="Repas (1 repas = 1 plat)"
              value={prefs.meals}
              min={1}
              max={21}
              onChange={(v) => set("meals", v)}
              shortcuts={[
                { value: 5, label: "5 soirs" },
                { value: 7, label: "Semaine" },
              ]}
            />
            <Stepper
              label="Personnes"
              value={prefs.persons}
              min={1}
              max={12}
              onChange={(v) => set("persons", v)}
              shortcuts={[
                { value: 1, label: "Solo" },
                { value: 2, label: "Duo" },
                { value: 4, label: "Coloc" },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Magasin" htmlFor={storeId} icon={StoreIcon}>
              <select id={storeId} className="input" value={prefs.storeId ?? ""} onChange={(e) => set("storeId", e.target.value || undefined)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 self-end rounded-field bg-surface-2 px-3 ring-1 ring-inset ring-line">
              <span className="flex items-center gap-2 text-body-sm font-medium">
                <Package aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />
                Utiliser mon placard
              </span>
              <input type="checkbox" role="switch" className="peer sr-only" checked={prefs.usePantry} onChange={(e) => set("usePantry", e.target.checked)} />
              <span
                aria-hidden
                className="relative h-6 w-10 rounded-full bg-surface-3 ring-1 ring-inset ring-line-strong transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-fg after:transition-transform after:duration-150 peer-checked:bg-accent-2 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
              />
            </label>
          </div>
        </div>
      </CollapsibleCard>

      {/* 2. Régime & contraintes */}
      <CollapsibleCard step={2} icon={Ban} title="Régime et contraintes" summary={`${DIETS[prefs.diet]} · ${nExcluded} exclusion${nExcluded > 1 ? "s" : ""} · ${nAllergens} allergie${nAllergens > 1 ? "s" : ""}`}>
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-caption font-medium text-muted">Régime</p>
            <Segmented
              label="Régime"
              value={prefs.diet}
              onChange={(d: Diet) => set("diet", d)}
              options={entries(DIETS).map(([value]) => ({ value, label: DIET_SHORT[value] }))}
            />
            <p className="mt-1.5 text-caption text-subtle">{DIETS[prefs.diet]}</p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
            <p className="text-body-sm">
              <span className="font-semibold tabular-nums">{permanent?.excludedIngredientIds.length ?? 0}</span> exclusion
              {(permanent?.excludedIngredientIds.length ?? 0) > 1 ? "s" : ""} permanente{(permanent?.excludedIngredientIds.length ?? 0) > 1 ? "s" : ""} ·{" "}
              <span className="font-semibold tabular-nums">{nAllergens}</span> allergie{nAllergens > 1 ? "s" : ""}
            </p>
            <Link href="/exclusions" className="link inline-flex min-h-11 shrink-0 items-center gap-1 text-body-sm">
              Modifier <ArrowRight aria-hidden className="size-4" strokeWidth={ICON_STROKE} />
            </Link>
          </div>
          <IngredientPicker
            label="Exclure en plus, pour ce menu seulement"
            tone="danger"
            options={ingredients}
            selected={prefs.excludedIngredientIds}
            onChange={(ids) => set("excludedIngredientIds", ids)}
          />
        </div>
      </CollapsibleCard>

      {/* 3. Temps, niveau, équipement, goûts */}
      <CollapsibleCard
        step={3}
        icon={ChefHat}
        title="Temps, niveau, équipement et goûts"
        summary={`${timeLabel} · ${LEVELS[prefs.maxDifficulty - 1]!.label} · ${prefs.equipment.length} équipement${prefs.equipment.length > 1 ? "s" : ""}`}
      >
        <div className="space-y-5">
          <Field label="Temps total maximum par plat" htmlFor={timeId} icon={Clock}>
            <select id={timeId} className="input" value={prefs.maxTotalMinutes} onChange={(e) => set("maxTotalMinutes", Number(e.target.value))}>
              {TIMES.map((t) => (
                <option key={t} value={t}>
                  {t >= 300 ? "Pas de limite" : `${t} min`}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <p className="mb-2 text-caption font-medium text-muted">Niveau en cuisine</p>
            <Segmented label="Niveau en cuisine" value={`${prefs.maxDifficulty}`} onChange={(v) => set("maxDifficulty", Number(v) as Difficulty)} options={LEVELS} />
          </div>
          <Chips label="Équipement disponible" options={entries(EQUIPMENT)} selected={prefs.equipment} onToggle={(e: Equipment) => set("equipment", toggle(prefs.equipment, e))} />
          <Chips label="Cuisines préférées" options={entries(CUISINES)} selected={prefs.likedCuisines} onToggle={(c: Cuisine) => set("likedCuisines", toggle(prefs.likedCuisines, c))} />
          <IngredientPicker label="Aliments favoris" options={ingredients} selected={prefs.favoriteIngredientIds} onChange={(ids) => set("favoriteIngredientIds", ids)} />
        </div>
      </CollapsibleCard>

      {/* Bouton principal collant */}
      <div className="sticky bottom-[96px] z-20 pt-2 lg:bottom-4">
        <button
          type="submit"
          disabled={loading}
          className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-card bg-gradient-to-b from-accent to-accent-2 text-body font-semibold text-accent-fg shadow-lift transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? <Loader2 aria-hidden className="size-5 animate-spin" strokeWidth={ICON_STROKE} /> : <Sparkles aria-hidden className="size-5" strokeWidth={ICON_STROKE} />}
          {loading ? "Composition en cours…" : "Générer mon menu"}
        </button>
      </div>
    </form>
  );
}
