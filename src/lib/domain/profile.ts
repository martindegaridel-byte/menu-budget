import { z } from "zod";
import { AllergenSchema, type Ingredient, type Preferences } from "./schemas";

/** Exclusions permanentes de l'utilisateur, appliquées à tous ses menus. */
export const ProfileSchema = z.object({
  excludedIngredientIds: z.array(z.string().min(1)).max(300).default([]),
  allergens: z.array(AllergenSchema).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const EMPTY_PROFILE: Profile = { excludedIngredientIds: [], allergens: [] };

/** Ajoute les exclusions permanentes à celles choisies pour ce menu (sans doublon). */
export function applyProfile(prefs: Preferences, profile: Profile): Preferences {
  return {
    ...prefs,
    excludedIngredientIds: [...new Set([...profile.excludedIngredientIds, ...prefs.excludedIngredientIds])],
    allergens: [...new Set([...profile.allergens, ...prefs.allergens])],
  };
}

/** Familles d'aliments pour exclure d'un geste (porc, poisson, champignons…). */
export const EXCLUSION_GROUPS: { id: string; label: string; match: (i: Ingredient) => boolean }[] = [
  { id: "porc", label: "Porc", match: (i) => i.tags.includes("porc") },
  { id: "boeuf", label: "Bœuf", match: (i) => i.tags.includes("boeuf") },
  { id: "volaille", label: "Volaille", match: (i) => i.tags.includes("volaille") },
  { id: "agneau", label: "Agneau", match: (i) => i.tags.includes("agneau") },
  { id: "poisson", label: "Poisson", match: (i) => i.animal === "poisson" },
  { id: "fruits-de-mer", label: "Fruits de mer", match: (i) => i.animal === "fruits-de-mer" },
  { id: "champignon", label: "Champignons", match: (i) => i.tags.includes("champignon") },
  { id: "fromage", label: "Fromages", match: (i) => i.tags.includes("fromage") },
  { id: "piquant", label: "Épicé / piquant", match: (i) => i.tags.includes("piquant") },
  { id: "abats", label: "Abats", match: (i) => i.tags.includes("abats") },
];

export function groupIngredientIds(groupId: string, ingredients: readonly Ingredient[]): string[] {
  const g = EXCLUSION_GROUPS.find((x) => x.id === groupId);
  return g ? ingredients.filter(g.match).map((i) => i.id) : [];
}
