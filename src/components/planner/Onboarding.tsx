"use client";
import { ArrowLeft, ArrowRight, Carrot, Check, HeartPulse, Package, Store as StoreIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button, Chip, Segmented, Stepper, useToast } from "@/components/ds";
import { cn, ICON_STROKE } from "@/components/ds/cn";
import { api } from "@/lib/client/api";
import type { IngredientOption } from "@/lib/client/catalog-types";
import type { Profile } from "@/lib/domain/profile";
import { ALLERGENS, DIETS, type Allergen, type Diet, type Preferences, type Store } from "@/lib/domain/schemas";
import { BudgetInput } from "./PreferencesForm";

export const ONBOARDED_KEY = "mb:onboarded";

const DIET_SHORT: Record<Diet, string> = { omnivore: "Omnivore", flexitarien: "Flexi", pescetarien: "Pescé", vegetarien: "Végé", vegan: "Vegan" };
/** Condiments que presque tout le monde a déjà : présélectionnés. */
const COMMON_STAPLES = ["sel", "poivre", "huile-tournesol", "huile-olive", "sucre", "moutarde", "vinaigre-vin", "herbes-provence"];

/** Accueil en 3 étapes à la première ouverture : magasin et budget, régime et allergies, condiments. */
export function Onboarding({
  prefs,
  stores,
  ingredients,
  permanent,
  onDone,
}: {
  prefs: Preferences;
  stores: readonly Store[];
  ingredients: readonly IngredientOption[];
  permanent: Profile;
  onDone: (prefs: Preferences) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Preferences>(prefs);
  const [allergens, setAllergens] = useState<Allergen[]>(permanent.allergens);
  const staples = ingredients.filter((i) => i.staple);
  const [owned, setOwned] = useState<Set<string>>(new Set(COMMON_STAPLES.filter((id) => staples.some((s) => s.id === id))));
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const storeId = useId();
  const budgetId = useId();
  const titleId = useId();

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      if (!skip) {
        await api.putProfile({ ...permanent, allergens });
        const { items } = await api.getPantry();
        const others = items.filter((i) => !staples.some((s) => s.id === i.ingredientId));
        await api.putPantry([...others, ...[...owned].map((id) => ({ ingredientId: id, quantity: null }))]);
      }
      try {
        localStorage.setItem(ONBOARDED_KEY, "1");
      } catch {
        /* stockage indisponible */
      }
      onDone(skip ? prefs : { ...draft, usePantry: true });
      if (!skip) toast({ title: "C'est prêt !", description: "Générez votre premier menu.", tone: "success" });
    } catch {
      toast({ title: "Impossible d'enregistrer vos choix", description: "Vous pourrez les régler plus tard.", tone: "error" });
      onDone(draft);
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { icon: StoreIcon, title: "Votre magasin et votre budget" },
    { icon: HeartPulse, title: "Votre régime et vos allergies" },
    { icon: Package, title: "Ce que vous avez déjà" },
  ];
  const Icon = steps[step]!.icon;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-canvas">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]">
        <div className="mb-6 flex items-center justify-between">
          <span className="inline-flex items-center gap-2 text-body font-semibold">
            <span className="grid size-9 place-items-center rounded-field bg-gradient-to-br from-accent to-accent-2 text-accent-fg">
              <Carrot aria-hidden className="size-5" strokeWidth={ICON_STROKE} />
            </span>
            Bienvenue
          </span>
          <button type="button" onClick={() => void finish(true)} className="focus-ring min-h-11 rounded-field px-3 text-body-sm font-medium text-muted hover:text-fg">
            Passer
          </button>
        </div>

        <ol className="mb-6 flex gap-2" aria-label={`Étape ${step + 1} sur 3`}>
          {steps.map((_, i) => (
            <li key={i} aria-hidden className={cn("h-1.5 flex-1 rounded-full transition-colors duration-200", i <= step ? "bg-accent" : "bg-surface-3")} />
          ))}
        </ol>

        <span className="mb-3 grid size-12 place-items-center rounded-card bg-accent-soft text-accent-text">
          <Icon aria-hidden className="size-6" strokeWidth={ICON_STROKE} />
        </span>
        <p className="text-caption font-medium text-subtle">Étape {step + 1} sur 3</p>
        <h1 id={titleId} className="mb-5 text-title-1 font-semibold tracking-tight">
          {steps[step]!.title}
        </h1>

        <div className="flex-1 space-y-5">
          {step === 0 && (
            <>
              <div>
                <label htmlFor={storeId} className="mb-2 block text-caption font-medium text-muted">
                  Magasin où vous faites vos courses
                </label>
                <select id={storeId} className="input" value={draft.storeId ?? ""} onChange={(e) => setDraft({ ...draft, storeId: e.target.value || undefined })}>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-caption text-subtle">Vous pourrez ajouter d&apos;autres magasins et importer leurs prix réels.</p>
              </div>
              <div>
                <label htmlFor={budgetId} className="mb-2 block text-caption font-medium text-muted">
                  Budget pour vos repas
                </label>
                <BudgetInput id={budgetId} large value={draft.budgetCents} onChange={(v) => setDraft({ ...draft, budgetCents: v })} />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Stepper label="Repas" value={draft.meals} min={1} max={21} onChange={(v) => setDraft({ ...draft, meals: v })} shortcuts={[{ value: 5, label: "5 soirs" }, { value: 7, label: "Semaine" }]} />
                <Stepper label="Personnes" value={draft.persons} min={1} max={12} onChange={(v) => setDraft({ ...draft, persons: v })} shortcuts={[{ value: 1, label: "Solo" }, { value: 2, label: "Duo" }]} />
              </div>
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <p className="mb-2 text-caption font-medium text-muted">Régime</p>
                <Segmented
                  label="Régime"
                  value={draft.diet}
                  onChange={(d: Diet) => setDraft({ ...draft, diet: d })}
                  options={(Object.keys(DIETS) as Diet[]).map((value) => ({ value, label: DIET_SHORT[value] }))}
                />
              </div>
              <div>
                <p className="mb-2 text-caption font-medium text-muted">Allergies et intolérances (toujours exclues)</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(ALLERGENS) as [Allergen, string][]).map(([a, label]) => (
                    <Chip key={a} state={allergens.includes(a) ? "excluded" : "neutral"} onClick={() => setAllergens(allergens.includes(a) ? allergens.filter((x) => x !== a) : [...allergens, a])}>
                      {label}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-caption text-subtle">Les aliments que vous n&apos;aimez pas se règlent dans l&apos;onglet Exclusions.</p>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <p className="text-body-sm text-muted">Touchez les condiments que vous avez déjà : ils ne seront pas comptés dans le budget. C&apos;est ce qui rend les premiers menus réalistes.</p>
              <div className="flex flex-wrap gap-2">
                <Chip state="neutral" onClick={() => setOwned(new Set(staples.map((s) => s.id)))}>
                  Tout cocher
                </Chip>
                <Chip state="neutral" onClick={() => setOwned(new Set())}>
                  Tout décocher
                </Chip>
              </div>
              <div className="flex flex-wrap gap-2">
                {staples.map((s) => (
                  <Chip
                    key={s.id}
                    state={owned.has(s.id) ? "selected" : "neutral"}
                    onClick={() => {
                      const next = new Set(owned);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      setOwned(next);
                    }}
                  >
                    {s.name}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="mt-8 flex gap-2">
          {step > 0 && (
            <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
              Retour
            </Button>
          )}
          {step < 2 ? (
            <Button size="lg" className="flex-1" iconRight={ArrowRight} onClick={() => setStep(step + 1)}>
              Continuer
            </Button>
          ) : (
            <Button size="lg" className="flex-1" icon={Check} loading={saving} onClick={() => void finish()}>
              C&apos;est parti
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
