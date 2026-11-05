import type { Allergen, Preferences, Recipe } from "@/lib/domain/schemas";
import { isOriginAllowed } from "./diet";
import { hashString } from "./rng";
import { buildShoppingList, pantryQuantity } from "./shopping";
import type { EngineContext, Needs, ShoppingList } from "./types";
import { toBaseQuantity } from "./units";

export type RejectionReason =
  | "regime"
  | "allergene"
  | "aliment-exclu"
  | "temps"
  | "difficulte"
  | "equipement"
  | "indisponible";

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  regime: "régime alimentaire",
  allergene: "allergènes",
  "aliment-exclu": "aliments exclus",
  temps: "temps de préparation",
  difficulte: "niveau de cuisine",
  equipement: "équipement",
  indisponible: "ingrédient indisponible en magasin",
};

/** Recette prête pour l'optimisation : besoins calculés pour le nombre de personnes. */
export interface PreparedRecipe {
  recipe: Recipe;
  /** Besoins essentiels (hors ingrédients facultatifs). */
  needs: Needs;
  /** Ingrédients facultatifs compatibles, ajoutés seulement si le budget le permet. */
  optionalNeeds: Needs;
  /** Ingrédients facultatifs retirés car incompatibles ou indisponibles. */
  droppedOptional: string[];
  score: number;
  /** Indicateurs utiles au score de variété. */
  protein: string | null;
}

export interface FilterResult {
  candidates: PreparedRecipe[];
  rejected: { recipeId: string; reasons: RejectionReason[] }[];
}

const PROTEIN_TAGS = ["boeuf", "porc", "poulet", "volaille", "poisson", "fruits-de-mer", "oeufs"] as const;

type Constraints = Pick<
  Preferences,
  "diet" | "allergens" | "excludedIngredientIds" | "maxTotalMinutes" | "maxDifficulty" | "equipment"
>;

/** Pourquoi un ingrédient est-il interdit pour ces préférences ? (null = autorisé) */
function ingredientViolation(ingredientId: string, prefs: Constraints, ctx: EngineContext): RejectionReason | null {
  const ing = ctx.ingredients.get(ingredientId);
  if (!ing) return "indisponible";
  if (prefs.excludedIngredientIds.includes(ingredientId)) return "aliment-exclu";
  if (!isOriginAllowed(prefs.diet, ing.animal)) return "regime";
  if (ing.allergens.some((a: Allergen) => prefs.allergens.includes(a))) return "allergene";
  return null;
}

/** Applique les contraintes dures et calcule les besoins de chaque recette pour `persons`. */
export function filterRecipes(prefs: Preferences, ctx: EngineContext): FilterResult {
  const candidates: PreparedRecipe[] = [];
  const rejected: FilterResult["rejected"] = [];

  for (const recipe of ctx.recipes) {
    const reasons = new Set<RejectionReason>();
    if (recipe.prepMinutes + recipe.cookMinutes > prefs.maxTotalMinutes) reasons.add("temps");
    if (recipe.difficulty > prefs.maxDifficulty) reasons.add("difficulte");
    if (!recipe.equipment.every((e) => prefs.equipment.includes(e))) reasons.add("equipement");

    const needs: Needs = new Map();
    const optionalNeeds: Needs = new Map();
    const droppedOptional: string[] = [];
    const factor = prefs.persons / recipe.baseServings;
    for (const line of recipe.ingredients) {
      const ing = ctx.ingredients.get(line.ingredientId);
      const violation = ingredientViolation(line.ingredientId, prefs, ctx);
      const qty = ing ? toBaseQuantity(line.quantity, line.unit, ing) * factor : 0;
      const available = ctx.priceBook.has(line.ingredientId) || pantryQuantity(ctx.pantry.get(line.ingredientId)) >= qty;
      if (line.optional) {
        if (violation || !available) droppedOptional.push(line.ingredientId);
        else optionalNeeds.set(line.ingredientId, (optionalNeeds.get(line.ingredientId) ?? 0) + qty);
        continue;
      }
      if (violation) reasons.add(violation);
      else if (!available) reasons.add("indisponible");
      else needs.set(line.ingredientId, (needs.get(line.ingredientId) ?? 0) + qty);
    }

    if (reasons.size > 0) {
      rejected.push({ recipeId: recipe.id, reasons: [...reasons] });
      continue;
    }
    candidates.push({
      recipe,
      needs,
      optionalNeeds,
      droppedOptional,
      score: scoreRecipe(recipe, needs, prefs, ctx),
      protein: PROTEIN_TAGS.find((t) => recipe.tags.includes(t)) ?? null,
    });
  }
  return { candidates, rejected };
}

const EXPIRING_DAYS = 5;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

/**
 * Score de préférence d'une recette (plus haut = mieux). Le coût n'y figure pas :
 * il est géré par l'optimiseur sous contrainte de budget.
 */
export function scoreRecipe(
  recipe: Recipe,
  needs: Needs,
  prefs: Pick<Preferences, "likedCuisines" | "favoriteIngredientIds" | "diet" | "seed">,
  ctx: EngineContext,
): number {
  let score = 10;
  if (prefs.likedCuisines.includes(recipe.cuisine)) score += 4;
  const favs = [...needs.keys()].filter((id) => prefs.favoriteIngredientIds.includes(id)).length;
  score += Math.min(6, favs * 3);
  if (prefs.diet === "flexitarien" && [...needs.keys()].some((id) => ctx.ingredients.get(id)?.animal === "viande")) {
    score -= 3;
  }
  // Anti-gaspi : utiliser ce qui périme bientôt.
  for (const id of needs.keys()) {
    const item = ctx.pantry.get(id);
    if (item?.expiresOn && daysBetween(ctx.today, item.expiresOn) <= EXPIRING_DAYS) score += 4;
  }
  // Léger bruit reproductible pour varier les menus d'une graine à l'autre.
  score += (hashString(recipe.id, prefs.seed) % 1000) / 500;
  return score;
}

export interface RecipeCost {
  /** Coût en caisse si l'on cuisine cette recette seule (paquets entiers, placard déduit). */
  purchaseCents: number;
  /** Coût de la part réellement utilisée (indicatif). */
  usedCents: number;
  shoppingList: ShoppingList;
}

/** Coût d'une recette pour `persons` personnes. */
export function computeRecipeCost(recipe: Recipe, prefs: Preferences, ctx: EngineContext): RecipeCost | null {
  const prepared = filterRecipes(prefs, { ...ctx, recipes: [recipe] }).candidates[0];
  if (!prepared) return null;
  const list = buildShoppingList(prepared.needs, ctx);
  return { purchaseCents: list.totalCents, usedCents: list.usedCostCents, shoppingList: list };
}
