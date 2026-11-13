"use client";
import { ArrowRight, Ban, ChefHat, Clock, CookingPot, Dumbbell, Loader2, Package, Scale, Sparkles, Store as StoreIcon, Wallet } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { CollapsibleCard, Segmented } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { Chips, IngredientPicker, Stepper } from "@/components/ui";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { Profile } from "@/lib/domain/profile";
import { CUISINES, DIETS, EQUIPMENT, NUTRITION_GOALS, type Classics, type Cuisine, type Diet, type Difficulty, type Equipment, type NutritionGoal, type Preferences, type Store } from "@/lib/domain/schemas";
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
const CLASSICS: { value: Classics; label: string }[] = [
  { value: "off", label: "Tous" },
  { value: "prefer", label: "Privilégier" },
  { value: "only", label: "Seulement" },
];
const INGREDIENT_LIMITS: { value: string; label: string }[] = [
  { value: "6", label: "6 max" },
  { value: "8", label: "8 max" },
  { value: "20", label: "Sans limite" },
];

/**
 * Repères indicatifs par repas et par personne, d'après les prix estimés du magasin
 * (paquets entiers, placard vide). Seul, on paie plus cher la portion (paquets
 * entamés) : solo 3,50 € / 5,50 €, à deux 2,50 € / 4,00 €, à quatre 2,00 € / 3,25 €.
 */
const tightPerPortion = (persons: number) => Math.round(150 + 200 / persons);
const comfortPerPortion = (persons: number) => Math.round(250 + 300 / persons);
type Viability = { tone: "danger" | "warn" | "accent"; label: string; hint: string };
function viability(perPortionCents: number, persons: number): Viability {
  if (perPortionCents < tightPerPortion(persons))
    return { tone: "danger", label: "Très serré", hint: "Le menu risque de dépasser ou de se limiter à quelques plats très simples. Cochez vos condiments dans le placard pour gagner de la marge." };
  if (perPortionCents < comfortPerPortion(persons))
    return { tone: "warn", label: "Serré", hint: "Possible, mais avec moins de variété : surtout des plats à base de pâtes, riz, œufs et légumineuses." };
  return { tone: "accent", label: "Confortable", hint: "Assez de marge pour des menus variés et équilibrés." };
}
const VIABILITY_STYLE = {
  danger: { text: "text-danger-text", bg: "bg-danger-soft", ring: "ring-danger/30", dot: "bg-danger" },
  warn: { text: "text-warn-text", bg: "bg-warn-soft", ring: "ring-warn/30", dot: "bg-warn" },
  accent: { text: "text-accent-text", bg: "bg-accent-soft", ring: "ring-accent/25", dot: "bg-accent" },
} as const;
const euros0 = (c: number) => `${Math.round(c / 100)} €`;

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
          className={cn("input pr-10 font-numeric font-semibold tabular-nums", large && "min-h-14 rounded-card text-[28px] leading-none tracking-tight sm:min-h-16 sm:text-[34px]")}
        />
        <span aria-hidden className={cn("pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 font-semibold text-muted", large && "text-title-3 sm:text-title-2")}>
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
  pantryCount = null,
  monthHint = null,
}: {
  permanent?: Profile;
  /** Budget mensuel : reste du mois et suggestion pour la semaine (null si non fixé). */
  monthHint?: { remainingCents: number; weeklyCents: number } | null;
  /** Nombre d'articles enregistrés dans le placard (null = inconnu). */
  pantryCount?: number | null;
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
  const lunch = prefs.lunchPortions ?? 0;
  const eaters = prefs.persons + lunch;
  const portions = Math.max(1, prefs.meals * eaters);
  // Repère : un dessert ≈ 0,60 € et un petit-déjeuner ≈ 0,70 € par personne, pris sur le budget des dîners.
  const extrasEstimate = prefs.persons * (60 * (prefs.desserts ?? 0) + 70 * (prefs.breakfasts ?? 0));
  const perMeal = divideCeil(Math.max(0, prefs.budgetCents - extrasEstimate), portions);
  const via = viability(perMeal, eaters);
  const vs = VIABILITY_STYLE[via.tone];
  // Échelle du curseur adaptée au nombre de portions, avec les zones « très serré / serré / confortable ».
  const tightCents = tightPerPortion(eaters) * portions;
  const comfortCents = comfortPerPortion(eaters) * portions;
  const sliderMax = Math.min(1_000_000, Math.max(5_000, Math.ceil((comfortCents * 2) / 1_000) * 1_000, Math.ceil(prefs.budgetCents / 1_000) * 1_000));
  const pct = (c: number) => `${Math.min(100, (c / sliderMax) * 100)}%`;
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
        summary={`${formatEuros(prefs.budgetCents)} · ${prefs.meals} repas · ${prefs.persons} pers.${lunch ? ` + ${lunch} midi` : ""}${prefs.desserts ? ` · ${prefs.desserts} dessert${prefs.desserts > 1 ? "s" : ""}` : ""}${prefs.breakfasts ? ` · ${prefs.breakfasts} p'tit déj` : ""} · ≈ ${formatEuros(perMeal)} / repas`}
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
              max={sliderMax}
              step={100}
              value={Math.min(prefs.budgetCents, sliderMax)}
              onChange={(e) => set("budgetCents", Number(e.target.value))}
              aria-valuetext={`${formatEuros(prefs.budgetCents)}, ${via.label.toLowerCase()}`}
              className="mt-4 h-11 w-full cursor-pointer accent-[var(--mb-accent)]"
            />
            {/* Échelle : zones très serré / serré / confortable pour ce nombre de portions */}
            <div aria-hidden className="relative -mt-1 h-1.5 overflow-hidden rounded-full bg-accent/60">
              <span className="absolute inset-y-0 left-0 bg-danger/70" style={{ width: pct(tightCents) }} />
              <span className="absolute inset-y-0 bg-warn/70" style={{ left: pct(tightCents), width: `calc(${pct(comfortCents)} - ${pct(tightCents)})` }} />
            </div>
            <div aria-hidden className="relative mt-1.5 h-4 text-[11px] tabular-nums text-subtle">
              <span className="absolute left-0">0 €</span>
              {tightCents / sliderMax < 0.85 && tightCents / sliderMax > 0.1 && (
                <span className="absolute -translate-x-1/2" style={{ left: pct(tightCents) }}>
                  {euros0(tightCents)}
                </span>
              )}
              {comfortCents / sliderMax < 0.85 && (
                <span className="absolute -translate-x-1/2" style={{ left: pct(comfortCents) }}>
                  {euros0(comfortCents)}
                </span>
              )}
              <span className="absolute right-0">{euros0(sliderMax)}</span>
            </div>
            {monthHint && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
                <p className="text-body-sm">
                  Ce mois-ci, il vous reste <span className="font-semibold tabular-nums">{formatEuros(monthHint.remainingCents)}</span>, soit ≈{" "}
                  <span className="font-semibold tabular-nums">{formatEuros(monthHint.weeklyCents)}</span> pour cette semaine.
                </p>
                {monthHint.weeklyCents > 0 && monthHint.weeklyCents !== prefs.budgetCents && (
                  <button
                    type="button"
                    onClick={() => set("budgetCents", monthHint.weeklyCents)}
                    className="focus-ring min-h-11 rounded-full bg-accent-soft px-3 text-caption font-semibold text-accent-text ring-1 ring-inset ring-accent/30"
                  >
                    Utiliser {formatEuros(monthHint.weeklyCents)}
                  </button>
                )}
              </div>
            )}
            <div className={cn("mt-3 rounded-field p-3 ring-1 ring-inset", vs.bg, vs.ring)} aria-live="polite">
              <p className="flex items-baseline justify-between gap-2">
                <span className={cn("inline-flex items-center gap-1.5 text-body-sm font-semibold", vs.text)}>
                  <span aria-hidden className={cn("size-2 rounded-full", vs.dot)} />
                  {via.label}
                </span>
                <span className="text-body-sm text-muted">
                  <span className={cn("font-numeric text-title-3 font-semibold tabular-nums", vs.text)}>≈ {formatEuros(perMeal)}</span> / repas / pers.
                </span>
              </p>
              <p className="mt-1 text-caption text-muted">
                {via.hint} <span className="hidden text-subtle sm:inline">Repère indicatif, d&apos;après les prix estimés du magasin.</span>
              </p>
            </div>
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
            <div className="sm:col-span-2">
              <Stepper
                label="Portions en plus pour le midi du lendemain"
                value={lunch}
                min={0}
                max={Math.max(prefs.persons, lunch)}
                onChange={(v) => set("lunchPortions", v)}
                shortcuts={[
                  { value: 0, label: "Aucune" },
                  { value: prefs.persons, label: prefs.persons > 1 ? "Pour tous" : "Pour moi" },
                ]}
              />
              <p className="mt-1.5 text-caption text-muted">Chaque dîner est cuisiné en plus grande quantité : la gamelle du lendemain est comprise dans le budget.</p>
            </div>
            <Stepper
              label="Desserts"
              value={prefs.desserts ?? 0}
              min={0}
              max={14}
              onChange={(v) => set("desserts", v)}
              shortcuts={[
                { value: 0, label: "Aucun" },
                { value: prefs.meals, label: "1 par dîner" },
              ]}
            />
            <Stepper
              label="Petits-déjeuners"
              value={prefs.breakfasts ?? 0}
              min={0}
              max={14}
              onChange={(v) => set("breakfasts", v)}
              shortcuts={[
                { value: 0, label: "Aucun" },
                { value: 7, label: "Semaine" },
              ]}
            />
            <p className="-mt-3 text-caption text-muted sm:col-span-2">
              Pour {prefs.persons} personne{prefs.persons > 1 ? "s" : ""}, compris dans le budget : les dîners passent en priorité, puis desserts et petits-déjeuners profitent des ingrédients déjà achetés.
            </p>
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
                {pantryCount !== null && (
                  <Link
                    href="/placard"
                    className="focus-ring relative z-10 inline-flex min-h-6 items-center rounded-full bg-surface-3 px-2 text-caption font-medium tabular-nums text-muted ring-1 ring-inset ring-line hover:text-fg"
                    aria-label={`${pantryCount} article${pantryCount > 1 ? "s" : ""} dans le placard : ouvrir le placard`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {pantryCount} article{pantryCount > 1 ? "s" : ""}
                  </Link>
                )}
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
      <CollapsibleCard step={2} icon={Ban} title="Régime et contraintes" summary={`${DIETS[prefs.diet]}${prefs.nutritionGoal !== "aucun" ? ` · ${NUTRITION_GOALS[prefs.nutritionGoal]}` : ""} · ${nExcluded} exclusion${nExcluded > 1 ? "s" : ""} · ${nAllergens} allergie${nAllergens > 1 ? "s" : ""}`}>
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
          <div>
            <p className="mb-2 text-caption font-medium text-muted">Objectif nutritionnel</p>
            <Segmented
              label="Objectif nutritionnel"
              value={prefs.nutritionGoal}
              onChange={(g: NutritionGoal) => set("nutritionGoal", g)}
              options={[
                { value: "aucun", label: "Aucun" },
                { value: "proteine", label: "Protéiné", icon: Dumbbell },
                { value: "equilibre", label: "Équilibré", icon: Scale },
              ]}
            />
            <p className="mt-1.5 text-caption text-subtle">
              {prefs.nutritionGoal === "proteine"
                ? "Privilégie les plats à 30 g de protéines ou plus par portion, toujours dans le budget."
                : prefs.nutritionGoal === "equilibre"
                  ? "Privilégie une répartition proche de 15 % protéines, 50 % glucides, 35 % lipides."
                  : "Les valeurs nutritionnelles s'affichent quand même sur chaque plat."}
            </p>
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
        summary={`${timeLabel}${prefs.batchCooking ? " · batch cooking" : ""}${prefs.classics === "only" ? " · classiques" : ""}${prefs.maxIngredients < 20 ? ` · ${prefs.maxIngredients} ingrédients max` : ""} · ${LEVELS[prefs.maxDifficulty - 1]!.label} · ${prefs.equipment.length} équipement${prefs.equipment.length > 1 ? "s" : ""}`}
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
          <label className="flex min-h-11 cursor-pointer items-start justify-between gap-3 rounded-field bg-surface-2 p-3 ring-1 ring-inset ring-line">
            <span>
              <span className="flex items-center gap-2 text-body-sm font-medium">
                <CookingPot aria-hidden className="size-4 text-muted" strokeWidth={ICON_STROKE} />
                Batch cooking
              </span>
              <span className="mt-0.5 block text-caption text-muted">
                Tout préparer en une session (réglable dans l&apos;onglet Batch) : des plats qui se gardent, partagent leurs ingrédients et se cuisent en même temps.
              </span>
            </span>
            <input type="checkbox" role="switch" className="peer sr-only" checked={prefs.batchCooking} onChange={(e) => set("batchCooking", e.target.checked)} />
            <span
              aria-hidden
              className="relative mt-1 h-6 w-10 shrink-0 rounded-full bg-surface-3 ring-1 ring-inset ring-line-strong transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-fg after:transition-transform after:duration-150 peer-checked:bg-accent-2 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
            />
          </label>
          <div>
            <p className="mb-2 text-caption font-medium text-muted">Niveau en cuisine</p>
            <Segmented label="Niveau en cuisine" value={`${prefs.maxDifficulty}`} onChange={(v) => set("maxDifficulty", Number(v) as Difficulty)} options={LEVELS} />
          </div>
          <div>
            <p className="mb-1 text-caption font-medium text-muted">Plats simples et classiques</p>
            <p className="mb-2 text-caption text-subtle">Pâtes bolognaise, steak-purée, omelette, croque-monsieur… les plats que tout le monde connaît.</p>
            <Segmented label="Plats simples et classiques" value={prefs.classics} onChange={(v) => set("classics", v as Classics)} options={CLASSICS} />
          </div>
          <div>
            <p className="mb-1 text-caption font-medium text-muted">Ingrédients par recette</p>
            <p className="mb-2 text-caption text-subtle">Hors sel, poivre, huile et autres condiments de base.</p>
            <Segmented label="Nombre d'ingrédients par recette" value={`${prefs.maxIngredients <= 6 ? 6 : prefs.maxIngredients <= 8 ? 8 : 20}`} onChange={(v) => set("maxIngredients", Number(v))} options={INGREDIENT_LIMITS} />
          </div>
          <Chips label="Équipement disponible" options={entries(EQUIPMENT)} selected={prefs.equipment} onToggle={(e: Equipment) => set("equipment", toggle(prefs.equipment, e))} />
          <Chips label="Cuisines préférées" options={entries(CUISINES)} selected={prefs.likedCuisines} onToggle={(c: Cuisine) => set("likedCuisines", toggle(prefs.likedCuisines, c))} />
          <IngredientPicker label="Aliments favoris" options={ingredients} selected={prefs.favoriteIngredientIds} onChange={(ids) => set("favoriteIngredientIds", ids)} />
        </div>
      </CollapsibleCard>

      {/* Bouton principal collant */}
      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-20 pt-2 lg:bottom-4">
        <button
          type="submit"
          disabled={loading}
          className="focus-ring flex min-h-12 w-full items-center justify-center gap-2 rounded-card sm:min-h-14 bg-accent-2 text-body font-semibold text-accent-fg shadow-lift transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? <Loader2 aria-hidden className="size-5 animate-spin" strokeWidth={ICON_STROKE} /> : <Sparkles aria-hidden className="size-5" strokeWidth={ICON_STROKE} />}
          {loading ? "Composition en cours…" : "Générer mon menu"}
        </button>
      </div>
    </form>
  );
}
