import { PreferencesSchema, type Package, type PantryItem, type PreferencesInput } from "@/lib/domain/schemas";
import { loadSeedData } from "@/lib/data/seed";
import { resolvePriceBook } from "@/lib/pricing/priceBook";
import type { EngineContext } from "./types";

/** Contexte moteur basé sur les vraies données seed (Intermarché Super). */
export function seedContext(opts: { pantry?: PantryItem[]; unavailable?: string[]; storePackages?: Package[] } = {}): EngineContext {
  const data = loadSeedData();
  return {
    ingredients: new Map(data.ingredients.map((i) => [i.id, i])),
    recipes: data.recipes,
    priceBook: resolvePriceBook({
      referencePackages: data.packages,
      store: { priceIndex: 100 },
      storePackages: opts.storePackages,
      unavailableIngredientIds: opts.unavailable,
    }),
    pantry: new Map((opts.pantry ?? []).map((p) => [p.ingredientId, p])),
    today: "2026-11-05",
  };
}

export function prefs(input: Partial<PreferencesInput> = {}) {
  return PreferencesSchema.parse({ budgetCents: 3000, meals: 5, persons: 2, ...input });
}

export function pkg(ingredientId: string, quantity: number, priceCents: number, label = `${quantity}`): Package {
  return { id: `${ingredientId}:${quantity}:${priceCents}`, ingredientId, label, quantity, priceCents, source: "manual", asOf: "2026-11-05" };
}
