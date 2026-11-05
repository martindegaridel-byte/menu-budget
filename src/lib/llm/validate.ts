import { RecipeSchema, type Ingredient, type Recipe } from "@/lib/domain/schemas";
import { isOriginAllowed } from "@/lib/engine/diet";
import { toBaseQuantity } from "@/lib/engine/units";
import type { RecipeGenerationRequest, RecipeGenerationResult } from "./types";

/** Recette telle que renvoyée par le LLM (avant contrôle). Aucun champ de prix. */
export interface RawGeneratedRecipe {
  name: string;
  description: string;
  cuisine: string;
  baseServings: number;
  prepMinutes: number;
  cookMinutes: number;
  difficulty: number;
  equipment: string[];
  ingredients: { ingredientId: string; quantity: number; unit: string; optional: boolean }[];
  steps: string[];
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "recette";

/**
 * Contrôle une sortie LLM : schéma Zod, ingrédients connus et autorisés,
 * unités convertibles, contraintes de temps / niveau / équipement, pas de doublon.
 * Toute recette non conforme est rejetée (jamais « réparée » silencieusement).
 */
export function validateGeneratedRecipes(raw: readonly RawGeneratedRecipe[], req: RecipeGenerationRequest): RecipeGenerationResult {
  const allowed = new Map<string, Ingredient>(req.allowedIngredients.map((i) => [i.id, i]));
  const existing = new Set(req.existingRecipeNames.map((n) => n.trim().toLowerCase()));
  const p = req.preferences;
  const recipes: Recipe[] = [];
  const rejected: RecipeGenerationResult["rejected"] = [];

  for (const r of raw) {
    const reject = (reason: string) => rejected.push({ name: r.name, reason });
    const parsed = RecipeSchema.safeParse({ ...r, id: `ia-${slug(r.name)}`, tags: ["ia"], source: "llm" });
    if (!parsed.success) {
      reject(`format invalide (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message})`);
      continue;
    }
    const recipe = parsed.data;
    if (existing.has(recipe.name.trim().toLowerCase())) {
      reject("existe déjà");
      continue;
    }
    const unknown = recipe.ingredients.find((l) => !allowed.has(l.ingredientId));
    if (unknown) {
      reject(`ingrédient inconnu ou non autorisé : ${unknown.ingredientId}`);
      continue;
    }
    const badUnit = recipe.ingredients.find((l) => {
      try {
        toBaseQuantity(l.quantity, l.unit, allowed.get(l.ingredientId)!);
        return false;
      } catch {
        return true;
      }
    });
    if (badUnit) {
      reject(`unité incompatible pour ${badUnit.ingredientId}`);
      continue;
    }
    // Double sécurité : régime et allergènes revérifiés même si la liste était filtrée.
    const forbidden = recipe.ingredients.find((l) => {
      const ing = allowed.get(l.ingredientId)!;
      return !isOriginAllowed(p.diet, ing.animal) || ing.allergens.some((a) => p.allergens.includes(a)) || p.excludedIngredientIds.includes(ing.id);
    });
    if (forbidden) {
      reject(`ingrédient interdit : ${forbidden.ingredientId}`);
      continue;
    }
    if (recipe.prepMinutes + recipe.cookMinutes > p.maxTotalMinutes) {
      reject("trop long");
      continue;
    }
    if (recipe.difficulty > p.maxDifficulty || !recipe.equipment.every((e) => p.equipment.includes(e))) {
      reject("niveau ou équipement non disponible");
      continue;
    }
    existing.add(recipe.name.trim().toLowerCase());
    recipes.push(recipe);
  }
  return { recipes, rejected };
}
